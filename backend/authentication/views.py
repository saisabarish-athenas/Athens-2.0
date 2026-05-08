from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from django.contrib.auth import authenticate
from django.utils import timezone
from datetime import timedelta
import logging

logger = logging.getLogger(__name__)

from .models import User, UserType, SecurityLog
from .utils import log_security_event
from .tenant_utils import get_tenant_for_user, get_tenant_id_for_filtering
from .permissions import IsSuperAdmin
from .rbac_permissions import RequireTenantContext, RequireTenantPermission
from .tenant_resolver import get_current_tenant
from system.api_response import ok, fail


class LoginThrottle(AnonRateThrottle):
    rate = '5/min'


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([LoginThrottle])
def unified_login(request):
    """Unified login endpoint for all user types"""
    email = (request.data.get('email') or request.data.get('username') or '').strip()
    password = request.data.get('password')
    totp_code = request.data.get('totp_code')

    if not email or not password:
        return Response({'error': 'Email and password required'}, status=status.HTTP_400_BAD_REQUEST)

    logger.info(f"[LOGIN] Attempt for identifier: '{email}'")

    try:
        user = User.objects.get(email=email) if '@' in email else User.objects.get(username=email)
    except User.DoesNotExist:
        try:
            user = User.objects.get(username=email) if '@' in email else User.objects.get(email=email)
        except User.DoesNotExist:
            log_security_event(request, None, SecurityLog.EventType.LOGIN_FAILED,
                               SecurityLog.Severity.WARNING, {'email': email, 'reason': 'user_not_found'})
            return Response({'error': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)

    if not user.is_active:
        log_security_event(request, user, SecurityLog.EventType.LOGIN_FAILED,
                           SecurityLog.Severity.WARNING, {'reason': 'account_inactive'})
        return Response({'error': 'Account is disabled. Contact your administrator.'}, status=status.HTTP_403_FORBIDDEN)

    if user.is_locked:
        log_security_event(request, user, SecurityLog.EventType.LOGIN_FAILED,
                           SecurityLog.Severity.WARNING, {'reason': 'account_locked'})
        return Response({'error': 'Account is locked', 'locked_until': user.locked_until,
                         'account_locked': True, 'lockout_expires_at': user.locked_until},
                        status=status.HTTP_403_FORBIDDEN)

    if not user.check_password(password):
        user.failed_login_count += 1
        if user.failed_login_count >= 5:
            user.locked_until = timezone.now() + timedelta(minutes=30)
            log_security_event(request, user, SecurityLog.EventType.ACCOUNT_LOCKED,
                               SecurityLog.Severity.CRITICAL, {'failed_attempts': user.failed_login_count})
        user.save()
        log_security_event(request, user, SecurityLog.EventType.LOGIN_FAILED,
                           SecurityLog.Severity.WARNING,
                           {'reason': 'invalid_password', 'attempts': user.failed_login_count})
        if user.failed_login_count >= 5:
            return Response({'error': 'Account is locked', 'locked_until': user.locked_until,
                             'account_locked': True, 'lockout_expires_at': user.locked_until},
                            status=status.HTTP_403_FORBIDDEN)
        attempts_remaining = max(0, 5 - user.failed_login_count)
        return Response({'error': 'Invalid credentials', 'attempts_remaining': attempts_remaining,
                         'remaining_attempts': attempts_remaining}, status=status.HTTP_401_UNAUTHORIZED)

    if user.requires_2fa and not totp_code:
        return Response({'requires_2fa': True, 'user_id': user.id}, status=status.HTTP_200_OK)

    # Subscription enforcement
    tenant = getattr(user, 'tenant', None)
    if tenant and tenant.subscription_start_date and tenant.subscription_end_date:
        today = timezone.now().date()
        if today < tenant.subscription_start_date:
            log_security_event(request, user, SecurityLog.EventType.LOGIN_FAILED,
                               SecurityLog.Severity.WARNING,
                               {'reason': 'subscription_not_started', 'start_date': str(tenant.subscription_start_date)})
            return Response({'error': 'Subscription not started yet',
                             'subscription_start_date': str(tenant.subscription_start_date)},
                            status=status.HTTP_403_FORBIDDEN)
        if today > tenant.subscription_end_date:
            log_security_event(request, user, SecurityLog.EventType.LOGIN_FAILED,
                               SecurityLog.Severity.WARNING,
                               {'reason': 'subscription_expired', 'end_date': str(tenant.subscription_end_date)})
            return Response({'error': 'Subscription expired',
                             'subscription_end_date': str(tenant.subscription_end_date)},
                            status=status.HTTP_403_FORBIDDEN)

    # Reset failed login count
    user.failed_login_count = 0
    user.locked_until = None
    user.last_login = timezone.now()
    user.save()

    has_project = getattr(user, 'project', None) is not None
    has_admin_type = bool(getattr(user, 'admin_type', None))
    has_role_user = getattr(user, 'role_type', 'admin') == 'user'
    if (
        getattr(user, 'user_type', None) not in ['superadmin', 'masteradmin']
        and not getattr(user, 'tenant', None)
        and not getattr(user, 'company_id', None)
        and not has_project
        and not has_admin_type
        and not has_role_user
    ):
        log_security_event(request, user, SecurityLog.EventType.LOGIN_FAILED,
                           SecurityLog.Severity.WARNING, {'reason': 'tenant_not_assigned'})
        return Response({'code': 'TENANT_MISSING', 'detail': 'Tenant not assigned. Contact Superadmin.',
                         'error': 'Tenant not assigned'}, status=status.HTTP_403_FORBIDDEN)

    # Generate tokens
    refresh = RefreshToken.for_user(user)
    refresh['user_type'] = user.user_type
    tenant_id = get_tenant_id_for_filtering(user)
    refresh['company_id'] = tenant_id

    log_security_event(request, user, SecurityLog.EventType.LOGIN_SUCCESS, SecurityLog.Severity.INFO, {})

    tenant_name = user.tenant.name if user.tenant else None

    # Determine next_route
    role_type = getattr(user, 'role_type', 'admin')
    if user.user_type == UserType.SUPERADMIN:
        next_route = '/superadmin/dashboard'
    elif user.user_type == UserType.MASTERADMIN:
        next_route = '/master-admin'
    elif user.user_type == UserType.COMPANYUSER:
        if role_type == 'user':
            # Regular user created by project admin
            is_first_login = getattr(user, 'is_first_login', False)
            approval_status = getattr(user, 'approval_status', 'approved')
            if is_first_login:
                next_route = '/user/profile-setup'
            elif approval_status == 'pending':
                next_route = '/user/waiting-approval'
            elif approval_status == 'rejected':
                next_route = '/user/rejected'
            else:
                next_route = '/user/dashboard'
        elif has_admin_type:
            next_route = '/project-admin'
        else:
            next_route = '/app/chatbox'
    elif user.user_type == UserType.SERVICEUSER:
        next_route = '/service'
    else:
        next_route = '/app'

    return Response({
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user': {
            'id': user.id,
            'email': user.email,
            'username': user.username,
            'user_type': user.user_type,
            'role_type': role_type,
            'company_id': tenant_id,
            'athens_tenant_id': tenant_id,
            'admin_type': user.admin_type,
            'company_type': getattr(user, 'company_type', None),
            'company_name': user.company_name or tenant_name,
            'project_id': user.project_id,
            'approval_status': getattr(user, 'approval_status', 'approved'),
            'is_first_login': getattr(user, 'is_first_login', False),
        },
        'password_expired': user.password_expired,
        'requires_2fa': False,
        'next_route': next_route,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([LoginThrottle])
def token_refresh(request):
    refresh_token = request.data.get('refresh')
    if not refresh_token:
        return Response({'error': 'Refresh token required'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        refresh = RefreshToken(refresh_token)
        return Response({'access': str(refresh.access_token)})
    except TokenError as e:
        return Response({'error': str(e)}, status=status.HTTP_401_UNAUTHORIZED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout(request):
    refresh_token = request.data.get('refresh')
    if refresh_token:
        try:
            RefreshToken(refresh_token).blacklist()
        except Exception:
            pass
    log_security_event(request, request.user, SecurityLog.EventType.LOGOUT, SecurityLog.Severity.INFO, {})
    return Response({'message': 'Logged out successfully'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_users(request):
    """List active users — filtered by company_type if provided."""
    qs = User.objects.filter(is_active=True, role_type='user')

    company_type = request.query_params.get('company_type')
    if company_type:
        qs = qs.filter(company_type=company_type)

    # Scope to same project/tenant as requesting user
    req_user = request.user
    if req_user.user_type not in ['superadmin', 'masteradmin']:
        if req_user.project_id:
            qs = qs.filter(project_id=req_user.project_id)
        elif req_user.tenant_id:
            qs = qs.filter(tenant_id=req_user.tenant_id)

    data = [
        {
            'id': u.id,
            'username': u.username,
            'name': u.name or u.username,
            'email': u.email,
            'department': u.department,
            'designation': u.designation,
            'employee_code': str(u.id).zfill(2),
            'company_type': u.company_type,
            'is_active': u.is_active,
        }
        for u in qs
    ]
    return ok(data=data, request=request)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_overview(request):
    return Response({'projects': {'total': 0, 'active': 0}, 'users': {'total': 0, 'active': 0},
                     'companies': {'total': 0, 'active': 0}, 'notifications': {'total': 0, 'unread': 0}})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def company_data(request):
    user = request.user
    tenant, error = get_tenant_for_user(user)
    if not tenant:
        return fail('NO_COMPANY', 'No company associated', status=404, request=request)
    data = {'success': True, 'company_name': tenant.name, 'company_logo': None,
            'registered_address': '', 'contact_phone': '', 'contact_email': tenant.admin_email,
            'athens_tenant_id': str(tenant.id)}
    return ok(data=data, request=request)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def current_user_profile(request):
    user = request.user
    return Response({'name': user.email.split('@')[0], 'employee_id': str(user.id),
                     'designation': user.user_type, 'department': 'N/A',
                     'user_type': user.user_type, 'admin_type': user.admin_type,
                     'project_id': user.project_id, 'project_name': None,
                     'profile_picture_url': None})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_projects(request):
    return Response({'results': []})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_admin_users(request):
    return Response({'results': []})


@api_view(['POST'])
@permission_classes([IsSuperAdmin])
def reset_user_password(request, user_id):
    try:
        User.objects.get(id=user_id)
        return ok(data={'message': 'Password reset email sent'}, request=request)
    except User.DoesNotExist:
        return fail('USER_NOT_FOUND', 'User not found', status=404, request=request)


@api_view(['POST'])
@permission_classes([IsSuperAdmin])
def toggle_user_status(request, user_id):
    try:
        target_user = User.objects.get(id=user_id)
        target_user.is_active = not target_user.is_active
        target_user.save()
        return ok(data={'message': 'User status updated', 'is_active': target_user.is_active}, request=request)
    except User.DoesNotExist:
        return fail('USER_NOT_FOUND', 'User not found', status=404, request=request)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_notifications(request):
    return Response({'results': []})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def induction_status(request):
    return Response({'hasCompleted': True, 'isEPCSafety': False, 'isMasterAdmin': False})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def subscription_status(request):
    tenant_id = get_tenant_id_for_filtering(request.user)
    return ok(data={'isTrialing': False, 'subscriptionStatus': 'active',
                    'tenantId': str(tenant_id) if tenant_id else None}, request=request)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_tenant(request):
    user = request.user
    tenant, error = get_tenant_for_user(user)
    if not tenant:
        return fail('NO_TENANT', 'No tenant assigned', status=404, request=request)
    return ok(data={'id': tenant.id, 'name': tenant.name,
                    'athens_tenant_id': tenant.id, 'admin_email': tenant.admin_email}, request=request)


@api_view(['GET'])
@permission_classes([RequireTenantContext])
def my_permissions(request):
    user = request.user
    if user.user_type == UserType.SUPERADMIN:
        return Response({'tenant_id': None, 'user_type': user.user_type,
                         'roles': ['SUPERADMIN'], 'permissions': ['*']})
    tenant = getattr(request, 'tenant', None) or get_current_tenant(user)
    role_map = {'masteradmin': ['MASTER_ADMIN'], 'projectadmin': ['PROJECT_ADMIN'],
                'adminuser': ['ADMIN_USER'], 'companyuser': ['COMPANY_USER'], 'serviceuser': ['SERVICE_USER']}
    permission_map = {
        'masteradmin': ['tenant.read', 'tenant.write', 'user.read', 'user.write',
                        'project.read', 'project.write', 'service.read', 'service.write'],
        'projectadmin': ['project.read', 'project.write', 'user.read', 'user.write'],
        'adminuser': ['project.read', 'user.read'],
        'companyuser': ['project.read'],
        'serviceuser': ['service.read'],
    }
    return Response({'tenant_id': str(tenant.id) if tenant else None, 'user_type': user.user_type,
                     'admin_type': user.admin_type, 'roles': role_map.get(user.user_type, []),
                     'permissions': permission_map.get(user.user_type, [])})


# ─── MOM / Notification endpoints ────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_notifications(request):
    """Return notifications for the logged-in user, newest first."""
    from .models_notification import Notification
    limit = int(request.query_params.get('limit', 50))
    notifs = (
        Notification.objects
        .for_user(request.user.id)
        .order_by('-created_at')[:limit]
    )
    data = [n.to_dict() for n in notifs]
    unread = Notification.objects.for_user(request.user.id).filter(read=False).count()
    return Response({'results': data, 'unread_count': unread})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_notification(request):
    """Create a notification for a target user (used by frontend sendNotification)."""
    from .models_notification import Notification
    target_user_id = request.data.get('user_id') or request.data.get('userId')
    if not target_user_id:
        return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)

    allowed_types = {t[0] for t in Notification.NOTIFICATION_TYPES}
    notif_type = request.data.get('type', 'general')
    if notif_type not in allowed_types:
        notif_type = 'general'

    notif = Notification.objects.create(
        user_id=target_user_id,
        title=request.data.get('title', 'Notification'),
        message=request.data.get('message', ''),
        notification_type=notif_type,
        data=request.data.get('data') or {},
        link=request.data.get('link') or '',
        sender=request.user,
    )
    return Response(notif.to_dict(), status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_notifications_read(request):
    """Mark a list of notification IDs as read for the current user."""
    from .models_notification import Notification
    ids = request.data.get('notification_ids', [])
    if ids:
        Notification.objects.filter(user=request.user, id__in=ids).update(
            read=True,
            read_at=timezone.now(),
        )
    return Response({'status': 'ok'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def notification_stats(request):
    """Return unread notification count for the current user."""
    from .models_notification import Notification
    unread = Notification.objects.for_user(request.user.id).filter(read=False).count()
    return Response({'unread_count': unread})
