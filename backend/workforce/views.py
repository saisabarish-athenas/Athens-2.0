from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.db import transaction
from django.db import models
from system.utils import get_current_tenant
from system.api_response import ok, fail
from .models import *
from .serializers import *
from .permissions import WorkforceServiceEnabled, IsWorkforceAdmin, _is_any_admin
from decimal import Decimal
import random, string


def _gen_password(length=12):
    chars = string.ascii_letters + string.digits + '!@#$%'
    return ''.join(random.choices(chars, k=length))


def _tenant_id(user):
    """
    Resolve a stable integer scope-ID for ANY user type — never crashes.
    Priority: tenant FK → project FK → company_id → user.id
    """
    tenant, _ = get_current_tenant(user)
    if tenant:
        return tenant.id
    project = getattr(user, 'project', None)
    if project:
        return project.id
    company_id = getattr(user, 'company_id', None)
    if company_id:
        return company_id
    return user.id


def _resolve_tid(user):
    """Shorthand: always returns an int, never None."""
    return _tenant_id(user)


def _attendance_scope_metadata(user):
    project = getattr(user, 'project', None)
    organization_id = getattr(user, 'company_id', None) or _resolve_tid(user)
    return {
        'admin_user': user if getattr(user, 'is_authenticated', False) else None,
        'project_id': getattr(project, 'id', None),
        'organization_id': organization_id,
    }


def _parse_hhmm(value, fallback=None):
    from datetime import time as dtime
    if not value:
        return fallback
    try:
        parts = str(value).split(':')
        return dtime(int(parts[0]), int(parts[1]), int(parts[2]) if len(parts) > 2 else 0)
    except Exception:
        return fallback


def _calculate_hours(in_time, out_time):
    if not in_time or not out_time:
        return Decimal('0')
    minutes = (out_time.hour * 60 + out_time.minute) - (in_time.hour * 60 + in_time.minute)
    if minutes <= 0:
        return Decimal('0')
    return (Decimal(minutes) / Decimal(60)).quantize(Decimal('0.01'))


def _employee_display_status(attendance, target_date):
    from datetime import time as dtime
    if not attendance or not attendance.in_time:
        if target_date < timezone.localdate():
            return 'absent'
        return 'absent' if timezone.localtime().time() > dtime(9, 0) else 'not_marked'
    if attendance.out_time:
        if attendance.total_hours and attendance.total_hours < Decimal('4'):
            return 'half_day'
        return 'checked_out'
    if attendance.in_time > dtime(9, 0):
        return 'late'
    return 'present'


def _late_status(attendance):
    from datetime import time as dtime
    return bool(attendance and attendance.in_time and attendance.in_time > dtime(9, 0))


def _find_employee_for_user(user):
    tenant_id = _resolve_tid(user)
    qs = Employee.objects.filter(athens_tenant_id=tenant_id).exclude(status='inactive')
    username = getattr(user, 'username', '') or ''
    if '_' in username:
        employee_code = username.rsplit('_', 1)[-1]
        match = qs.filter(employee_code__iexact=employee_code).first()
        if match:
            return match
    full_name = user.get_full_name() if hasattr(user, 'get_full_name') else getattr(user, 'name', '')
    if full_name:
        match = qs.filter(full_name__iexact=full_name).first()
        if match:
            return match
    return qs.filter(full_name__iexact=getattr(user, 'name', '') or '').first()


def _sync_user_attendance_to_employee_attendance(user, user_attendance):
    employee = _find_employee_for_user(user)
    if not employee:
        return None
    total_hours = _calculate_hours(user_attendance.check_in_time, user_attendance.check_out_time)
    record, _ = Attendance.objects.update_or_create(
        employee=employee,
        date=user_attendance.date,
        defaults={
            'athens_tenant_id': employee.athens_tenant_id,
            'in_time': user_attendance.check_in_time,
            'out_time': user_attendance.check_out_time,
            'total_hours': total_hours,
            'status': 'P' if user_attendance.check_in_time else 'A',
            'latitude': user_attendance.latitude,
            'longitude': user_attendance.longitude,
            'project_id': getattr(getattr(user, 'project', None), 'id', None),
            'organization_id': getattr(user, 'company_id', None) or employee.athens_tenant_id,
        }
    )
    return record

# MODULE 1: EMPLOYEE & WORKFORCE MANAGEMENT

class DepartmentViewSet(viewsets.ModelViewSet):
    serializer_class = DepartmentSerializer
    permission_classes = [IsAuthenticated, WorkforceServiceEnabled, IsWorkforceAdmin]
    

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return ok(data=serializer.data, request=request)
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return ok(data=serializer.data, request=request)
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return ok(data=None, request=request, status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        return Department.objects.filter(athens_tenant_id=_resolve_tid(self.request.user))

    def perform_create(self, serializer):
        serializer.save(athens_tenant_id=_resolve_tid(self.request.user))

class DesignationViewSet(viewsets.ModelViewSet):
    serializer_class = DesignationSerializer
    permission_classes = [IsAuthenticated, WorkforceServiceEnabled, IsWorkforceAdmin]
    

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return ok(data=serializer.data, request=request)
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return ok(data=serializer.data, request=request)
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return ok(data=None, request=request, status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        return Designation.objects.filter(athens_tenant_id=_resolve_tid(self.request.user))

    def perform_create(self, serializer):
        serializer.save(athens_tenant_id=_resolve_tid(self.request.user))

class EmployeeViewSet(viewsets.ModelViewSet):
    serializer_class = EmployeeSerializer
    permission_classes = [IsAuthenticated, WorkforceServiceEnabled, IsWorkforceAdmin]

    def get_queryset(self):
        tenant, _ = get_current_tenant(self.request.user)
        
        if tenant is None:
            tenant_id = _tenant_id(self.request.user)
        else:
            tenant_id = tenant.id
        
        return Employee.objects.filter(
            athens_tenant_id=tenant_id
        ).exclude(status='inactive').select_related('department', 'designation')

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.filter_queryset(self.get_queryset()), many=True)
        return ok(data=serializer.data, request=request)

    def retrieve(self, request, *args, **kwargs):
        return ok(data=self.get_serializer(self.get_object()).data, request=request)

    def create(self, request, *args, **kwargs):
        """
        Atomically create Employee + User login account.
        Accepts extra fields: email, password (optional).
        Returns employee data + login credentials.
        """
        print("REQUEST DATA:", request.data)  # DEBUG LOG
        
        from authentication.models import User, UserType, SecurityLog

        admin = request.user
        tenant, _ = get_current_tenant(admin)

        # Resolve tenant_id for scoping — works for all admin types
        tenant_id = tenant.id if tenant else _tenant_id(admin)

        email = (request.data.get('email') or '').strip()
        if not email:
            return fail('EMAIL_REQUIRED', 'Email is required to create login credentials.',
                        status=status.HTTP_400_BAD_REQUEST, request=request)

        if User.objects.filter(email=email).exists():
            return fail('EMAIL_EXISTS', 'A user with this email already exists.',
                        status=status.HTTP_400_BAD_REQUEST, request=request)

        # Build unique username
        emp_code = (request.data.get('employee_code') or '').replace(' ', '')
        base_username = email.split('@')[0]
        username = f"{base_username}_{emp_code}" if emp_code else base_username
        if User.objects.filter(username=username).exists():
            username = f"{username}_{random.randint(100, 999)}"

        plain_password = request.data.get('password') or _gen_password()

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            with transaction.atomic():
                # 1. Create employee record
                employee = serializer.save(athens_tenant_id=tenant_id)

                # 2. Create user login account
                user = User(
                    email=email,
                    username=username,
                    name=request.data.get('full_name', ''),
                    user_type=UserType.COMPANYUSER,
                    role_type='user',
                    company_type=getattr(admin, 'admin_type', None),
                    admin_type=None,
                    project=getattr(admin, 'project', None),
                    tenant=tenant,  # may be None for project-scoped admins
                    company_id=getattr(admin, 'company_id', None) or tenant_id,
                    athens_tenant_id=getattr(admin, 'athens_tenant_id', None),
                    created_by=admin,
                    approval_status='pending',
                    is_first_login=True,
                    is_autogenerated_password=not bool(request.data.get('password')),
                    is_active=True,
                )
                user.set_password(plain_password)
                user.save()

                SecurityLog.objects.create(
                    event_type=SecurityLog.EventType.MASTER_CREATED,
                    severity=SecurityLog.Severity.INFO,
                    user=admin,
                    metadata={
                        'event': 'workforce.create_employee_with_login',
                        'employee_id': employee.id,
                        'user_id': user.id,
                    }
                )
        except Exception as e:
            import logging
            import traceback
            logger = logging.getLogger(__name__)
            logger.error('Employee create failed: %s', e, exc_info=True)
            msg = str(e)
            if 'unique' in msg.lower() or 'duplicate' in msg.lower():
                msg = 'An employee with this code or email already exists.'
            print(f"[EMPLOYEE CREATE ERROR] {msg}\n{traceback.format_exc()}")
            return fail('CREATE_FAILED', msg,
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR, request=request)

        return Response({
            'data': serializer.data,
            'login': {
                'user_id': user.id,
                'email': user.email,
                'username': user.username,
                'password': plain_password,
                'role_type': 'user',
                'approval_status': 'pending',
                'is_first_login': True,
            }
        }, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.status = 'inactive'
        instance.save()
        return ok(data={'detail': 'Employee marked as inactive'}, request=request)

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def participants(self, request):
        """
        Lightweight endpoint for MOM participants dropdown.
        Returns User accounts (not Employee records) so that IDs are valid
        for the MOM participants M2M field which links to AUTH_USER_MODEL.
        Scoped to the current tenant/project.
        """
        from authentication.models import CustomUser
        from django.db.models import Q
        tenant, _ = get_current_tenant(request.user)
        tenant_id = tenant.id if tenant else _tenant_id(request.user)

        # Build queryset of User accounts in this tenant/project scope
        user_qs = CustomUser.objects.filter(is_active=True).exclude(id=request.user.id)

        # Scope by project if available, otherwise by tenant/company
        user_project = getattr(request.user, 'project', None)
        company_id = getattr(request.user, 'company_id', None)
        if user_project:
            user_qs = user_qs.filter(project=user_project)
        elif company_id:
            user_qs = user_qs.filter(company_id=company_id)
        else:
            # Broadest fallback: users created by this admin OR sharing the same tenant
            user_qs = user_qs.filter(
                Q(created_by=request.user) | Q(athens_tenant_id=tenant_id)
            )

        # Also cross-reference with Employee records to get employee_code
        employee_codes = {}
        try:
            emp_qs = Employee.objects.filter(
                athens_tenant_id=tenant_id
            ).exclude(status='inactive').values('id', 'full_name', 'employee_code')
            # Map by full_name for loose matching
            for e in emp_qs:
                employee_codes[str(e['full_name']).strip().lower()] = e['employee_code']
        except Exception:
            pass

        data = []
        for u in user_qs.values('id', 'name', 'username', 'email', 'department'):
            display_name = (u['name'] or u['username'] or u['email'] or '').strip()
            emp_code = employee_codes.get(display_name.lower()) or str(u['id']).zfill(2)
            data.append({
                'id': u['id'],           # ← User.id — correct for MOM M2M
                'full_name': display_name,
                'employee_code': emp_code,
                'department': u['department'] or '',
            })

        print(f"[MOM PARTICIPANTS] user={request.user.id} project={user_project} count={len(data)}")
        return Response(data)

# MODULE 2: ATTENDANCE & WORK HOURS MANAGEMENT

class ShiftScheduleViewSet(viewsets.ModelViewSet):
    serializer_class = ShiftScheduleSerializer
    permission_classes = [IsAuthenticated, WorkforceServiceEnabled, IsWorkforceAdmin]
    

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return ok(data=serializer.data, request=request)
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return ok(data=serializer.data, request=request)
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return ok(data=None, request=request, status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        return ShiftSchedule.objects.filter(athens_tenant_id=_resolve_tid(self.request.user))

    def perform_create(self, serializer):
        serializer.save(athens_tenant_id=_resolve_tid(self.request.user))

class HolidayViewSet(viewsets.ModelViewSet):
    serializer_class = HolidaySerializer
    permission_classes = [IsAuthenticated, WorkforceServiceEnabled, IsWorkforceAdmin]
    

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return ok(data=serializer.data, request=request)
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return ok(data=serializer.data, request=request)
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return ok(data=None, request=request, status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        return Holiday.objects.filter(athens_tenant_id=_resolve_tid(self.request.user))

    def perform_create(self, serializer):
        serializer.save(athens_tenant_id=_resolve_tid(self.request.user))

class AttendanceViewSet(viewsets.ModelViewSet):
    serializer_class = AttendanceSerializer
    permission_classes = [IsAuthenticated, WorkforceServiceEnabled]
    

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return ok(data=serializer.data, request=request)
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return ok(data=serializer.data, request=request)
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return ok(data=None, request=request, status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        return Attendance.objects.filter(athens_tenant_id=_resolve_tid(self.request.user)).select_related('employee', 'shift')

    def perform_create(self, serializer):
        serializer.save(athens_tenant_id=_resolve_tid(self.request.user))

# MODULE 3: PAYROLL & WAGE MANAGEMENT

class PayrollCycleViewSet(viewsets.ModelViewSet):
    serializer_class = PayrollCycleSerializer
    permission_classes = [IsAuthenticated, WorkforceServiceEnabled, IsWorkforceAdmin]

    def get_queryset(self):
        return PayrollCycle.objects.filter(athens_tenant_id=_resolve_tid(self.request.user))

    def perform_create(self, serializer):
        serializer.save(athens_tenant_id=_resolve_tid(self.request.user))

    def list(self, request, *args, **kwargs):
        return ok(data=self.get_serializer(self.filter_queryset(self.get_queryset()), many=True).data, request=request)

    def retrieve(self, request, *args, **kwargs):
        return ok(data=self.get_serializer(self.get_object()).data, request=request)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status != 'draft':
            return fail('INVALID_STATUS', 'Only draft cycles can be deleted.',
                        status=status.HTTP_400_BAD_REQUEST, request=request)
        self.perform_destroy(instance)
        return ok(data=None, request=request, status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def process(self, request, pk=None):
        """Process payroll cycle — calculate salaries for all active employees."""
        cycle = self.get_object()
        tid = _resolve_tid(request.user)
        try:
            from .services import PayrollService
            result = PayrollService.process_payroll_cycle(cycle, tid)
            # Mark all entries as 'processed'
            cycle.payrollentry_set.update(payment_status='processed')
            return ok(data=result, request=request)
        except ValueError as e:
            return fail('VALIDATION_ERROR', str(e), status=status.HTTP_400_BAD_REQUEST, request=request)
        except Exception as e:
            return fail('PROCESSING_FAILED', f'Payroll processing failed: {str(e)}',
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR, request=request)

    @action(detail=True, methods=['post'])
    def lock(self, request, pk=None):
        """Lock a processed cycle — no further changes allowed."""
        cycle = self.get_object()
        if cycle.status != 'processed':
            return fail('INVALID_STATUS', 'Only processed cycles can be locked.',
                        status=status.HTTP_400_BAD_REQUEST, request=request)
        cycle.status = 'locked'
        cycle.save(update_fields=['status'])
        return ok(data={'detail': 'Payroll cycle locked.'}, request=request)

    @action(detail=True, methods=['get'])
    def entries(self, request, pk=None):
        """List all payroll entries for this cycle."""
        cycle = self.get_object()
        qs = cycle.payrollentry_set.select_related(
            'employee', 'employee__department', 'employee__designation'
        ).order_by('employee__full_name')
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                models.Q(employee__full_name__icontains=search) |
                models.Q(employee__employee_code__icontains=search)
            )
        ps = request.query_params.get('payment_status')
        if ps:
            qs = qs.filter(payment_status=ps)
        return ok(data=PayrollEntrySerializer(qs, many=True).data, request=request)

    @action(detail=True, methods=['post'], url_path='pay-all')
    def pay_all(self, request, pk=None):
        """Mark all processed entries in this cycle as paid."""
        cycle = self.get_object()
        if cycle.status not in ('processed', 'locked'):
            return fail('INVALID_STATUS', 'Cycle must be processed before payment.',
                        status=status.HTTP_400_BAD_REQUEST, request=request)
        payment_mode = request.data.get('payment_mode', 'bank')
        now = timezone.now()
        updated = cycle.payrollentry_set.filter(payment_status='processed').update(
            payment_status='paid',
            paid_at=now,
            payment_date=now.date(),
            payment_mode=payment_mode,
        )
        return ok(data={'paid_count': updated, 'detail': f'{updated} entries marked as paid.'}, request=request)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Dashboard summary for the current tenant."""
        tid = _resolve_tid(request.user)
        from django.db.models import Sum, Count
        cycles = PayrollCycle.objects.filter(athens_tenant_id=tid)
        entries = PayrollEntry.objects.filter(athens_tenant_id=tid)
        data = {
            'total_cycles': cycles.count(),
            'draft_cycles': cycles.filter(status='draft').count(),
            'processed_cycles': cycles.filter(status='processed').count(),
            'locked_cycles': cycles.filter(status='locked').count(),
            'total_entries': entries.count(),
            'pending_entries': entries.filter(payment_status='pending').count(),
            'processed_entries': entries.filter(payment_status='processed').count(),
            'paid_entries': entries.filter(payment_status='paid').count(),
            'total_net_paid': float(entries.filter(payment_status='paid').aggregate(t=Sum('net_salary'))['t'] or 0),
            'total_net_pending': float(entries.filter(payment_status__in=['pending', 'processed']).aggregate(t=Sum('net_salary'))['t'] or 0),
        }
        return ok(data=data, request=request)

class PayrollEntryViewSet(viewsets.ModelViewSet):
    serializer_class = PayrollEntrySerializer
    permission_classes = [IsAuthenticated, WorkforceServiceEnabled]

    def get_queryset(self):
        tid = _resolve_tid(self.request.user)
        qs = PayrollEntry.objects.filter(athens_tenant_id=tid).select_related(
            'employee', 'employee__department', 'employee__designation', 'payroll_cycle'
        )
        cycle_id = self.request.query_params.get('cycle')
        if cycle_id:
            qs = qs.filter(payroll_cycle_id=cycle_id)
        ps = self.request.query_params.get('payment_status')
        if ps:
            qs = qs.filter(payment_status=ps)
        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                models.Q(employee__full_name__icontains=search) |
                models.Q(employee__employee_code__icontains=search)
            )
        return qs.order_by('-payroll_cycle__period_from', 'employee__full_name')

    def list(self, request, *args, **kwargs):
        return ok(data=self.get_serializer(self.filter_queryset(self.get_queryset()), many=True).data, request=request)

    def retrieve(self, request, *args, **kwargs):
        return ok(data=self.get_serializer(self.get_object()).data, request=request)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(athens_tenant_id=_resolve_tid(request.user))
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        if instance.payment_status == 'paid':
            return fail('INVALID_STATUS', 'Paid entries cannot be modified.',
                        status=status.HTTP_400_BAD_REQUEST, request=request)
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.payment_status == 'paid':
            return fail('INVALID_STATUS', 'Paid entries cannot be deleted.',
                        status=status.HTTP_400_BAD_REQUEST, request=request)
        self.perform_destroy(instance)
        return ok(data=None, request=request, status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def pay(self, request, pk=None):
        """Mark a single payroll entry as paid."""
        entry = self.get_object()
        if entry.payment_status == 'paid':
            return fail('ALREADY_PAID', 'This entry has already been paid.',
                        status=status.HTTP_400_BAD_REQUEST, request=request)
        if entry.payment_status == 'pending':
            return fail('NOT_PROCESSED', 'Payroll must be processed before payment.',
                        status=status.HTTP_400_BAD_REQUEST, request=request)
        now = timezone.now()
        entry.payment_status = 'paid'
        entry.paid_at = now
        entry.payment_date = now.date()
        entry.payment_mode = request.data.get('payment_mode', 'bank')
        entry.transaction_reference = request.data.get('transaction_reference', '')
        entry.save(update_fields=['payment_status', 'paid_at', 'payment_date', 'payment_mode', 'transaction_reference'])
        return ok(data=self.get_serializer(entry).data, request=request)

    @action(detail=True, methods=['post'])
    def process_single(self, request, pk=None):
        """Process a single pending entry (recalculate salary)."""
        entry = self.get_object()
        if entry.payment_status == 'paid':
            return fail('ALREADY_PAID', 'Paid entries cannot be reprocessed.',
                        status=status.HTTP_400_BAD_REQUEST, request=request)
        tid = _resolve_tid(request.user)
        try:
            from .services import PayrollService
            settings = __import__('workforce.models', fromlist=['PayrollSettings']).PayrollSettings
            ps = settings.objects.filter(athens_tenant_id=tid).first()
            if not ps:
                return fail('NO_SETTINGS', 'Payroll settings not configured.',
                            status=status.HTTP_400_BAD_REQUEST, request=request)
            cycle = entry.payroll_cycle
            emp = entry.employee
            att = PayrollService.get_attendance_summary(emp, cycle.period_from, cycle.period_to)
            earnings = PayrollService.calculate_earnings(emp, att, ps)
            deductions = PayrollService.calculate_deductions(emp, earnings, cycle.period_from, cycle.period_to, ps)
            net = earnings['gross_salary'] - deductions['total_deductions']
            for k, v in {**att, **earnings, **deductions, 'net_salary': net}.items():
                if hasattr(entry, k):
                    setattr(entry, k, v)
            entry.payment_status = 'processed'
            entry.save()
            return ok(data=self.get_serializer(entry).data, request=request)
        except Exception as e:
            return fail('PROCESSING_FAILED', str(e),
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR, request=request)

    @action(detail=True, methods=['get'], url_path='payslip')
    def payslip(self, request, pk=None):
        """Generate and return payslip data for an entry."""
        entry = self.get_object()
        emp = entry.employee
        cycle = entry.payroll_cycle
        payslip_data = {
            'id': entry.id,
            'employee_name': emp.full_name,
            'employee_id': emp.employee_code,
            'department': emp.department.name if emp.department else 'N/A',
            'designation': emp.designation.name if emp.designation else 'N/A',
            'payroll_month': cycle.cycle_name,
            'period_from': cycle.period_from,
            'period_to': cycle.period_to,
            'earnings': {
                'basic_salary': float(entry.basic_earned),
                'da': float(entry.da_earned),
                'hra': float(entry.hra_earned),
                'allowances': float(entry.other_allowances),
                'overtime_wages': float(entry.overtime_wages),
                'gross_salary': float(entry.gross_salary),
            },
            'deductions': {
                'pf': float(entry.pf_employee),
                'esi': float(entry.esi_employee),
                'professional_tax': float(entry.professional_tax),
                'fines': float(entry.fines),
                'advances': float(entry.advances),
                'other_deductions': float(entry.other_deductions),
                'total_deductions': float(entry.total_deductions),
            },
            'net_salary': float(entry.net_salary),
            'payment_status': entry.payment_status,
            'payment_date': entry.payment_date,
            'payment_mode': entry.payment_mode,
            'transaction_reference': entry.transaction_reference,
            'total_days_worked': entry.total_days_worked,
            'paid_leave_days': entry.paid_leave_days,
            'unpaid_leave_days': entry.unpaid_leave_days,
            'overtime_hours': float(entry.overtime_hours),
        }
        return ok(data=payslip_data, request=request)

    @action(detail=False, methods=['get'], url_path='export')
    def export(self, request):
        """Export payroll entries as CSV."""
        import csv
        from django.http import HttpResponse
        tid = _resolve_tid(request.user)
        cycle_id = request.query_params.get('cycle')
        payment_status = request.query_params.get('payment_status')
        
        qs = PayrollEntry.objects.filter(athens_tenant_id=tid).select_related(
            'employee', 'employee__department', 'employee__designation', 'payroll_cycle'
        )
        
        if cycle_id:
            qs = qs.filter(payroll_cycle_id=cycle_id)
        if payment_status:
            qs = qs.filter(payment_status=payment_status)
        
        qs = qs.order_by('-payroll_cycle__period_from', 'employee__full_name')
        
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="payroll_export.csv"'
        
        writer = csv.writer(response)
        writer.writerow([
            'Employee Code', 'Employee Name', 'Department', 'Designation',
            'Basic', 'DA', 'HRA', 'Allowances', 'OT Wages', 'Gross',
            'PF', 'ESI', 'PT', 'Fines', 'Advances', 'Other Deductions', 'Total Deductions',
            'Net Salary', 'Status', 'Payment Date', 'Payment Mode'
        ])
        
        for entry in qs:
            writer.writerow([
                entry.employee.employee_code,
                entry.employee.full_name,
                entry.employee.department.name if entry.employee.department else 'N/A',
                entry.employee.designation.name if entry.employee.designation else 'N/A',
                entry.basic_earned,
                entry.da_earned,
                entry.hra_earned,
                entry.other_allowances,
                entry.overtime_wages,
                entry.gross_salary,
                entry.pf_employee,
                entry.esi_employee,
                entry.professional_tax,
                entry.fines,
                entry.advances,
                entry.other_deductions,
                entry.total_deductions,
                entry.net_salary,
                entry.payment_status,
                entry.payment_date or 'N/A',
                entry.payment_mode or 'N/A',
            ])
        
        return response

class PayrollSettingsViewSet(viewsets.ModelViewSet):
    serializer_class = PayrollSettingsSerializer
    permission_classes = [IsAuthenticated, WorkforceServiceEnabled, IsWorkforceAdmin]
    

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return ok(data=serializer.data, request=request)
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return ok(data=serializer.data, request=request)
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return ok(data=None, request=request, status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        return PayrollSettings.objects.filter(athens_tenant_id=_resolve_tid(self.request.user))

    def perform_create(self, serializer):
        serializer.save(athens_tenant_id=_resolve_tid(self.request.user))

class BonusRecordViewSet(viewsets.ModelViewSet):
    serializer_class = BonusRecordSerializer
    permission_classes = [IsAuthenticated, WorkforceServiceEnabled, IsWorkforceAdmin]
    

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return ok(data=serializer.data, request=request)
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return ok(data=serializer.data, request=request)
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return ok(data=None, request=request, status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        return BonusRecord.objects.filter(athens_tenant_id=_resolve_tid(self.request.user)).select_related('employee')

    def perform_create(self, serializer):
        serializer.save(athens_tenant_id=_resolve_tid(self.request.user))

class FineViewSet(viewsets.ModelViewSet):
    serializer_class = FineSerializer
    permission_classes = [IsAuthenticated, WorkforceServiceEnabled, IsWorkforceAdmin]
    

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return ok(data=serializer.data, request=request)
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return ok(data=serializer.data, request=request)
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return ok(data=None, request=request, status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        return Fine.objects.filter(athens_tenant_id=_resolve_tid(self.request.user)).select_related('employee')

    def perform_create(self, serializer):
        serializer.save(athens_tenant_id=_resolve_tid(self.request.user))

class AdvanceViewSet(viewsets.ModelViewSet):
    serializer_class = AdvanceSerializer
    permission_classes = [IsAuthenticated, WorkforceServiceEnabled, IsWorkforceAdmin]
    

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return ok(data=serializer.data, request=request)
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return ok(data=serializer.data, request=request)
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return ok(data=None, request=request, status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        return Advance.objects.filter(athens_tenant_id=_resolve_tid(self.request.user)).select_related('employee')

    def perform_create(self, serializer):
        serializer.save(athens_tenant_id=_resolve_tid(self.request.user))

# LEGACY VIEWS

class EmployeeProfileViewSet(viewsets.ModelViewSet):
    serializer_class = EmployeeProfileSerializer
    permission_classes = [IsAuthenticated, WorkforceServiceEnabled, IsWorkforceAdmin]
    

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return ok(data=serializer.data, request=request)
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return ok(data=serializer.data, request=request)
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return ok(data=None, request=request, status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        return EmployeeProfile.objects.filter(athens_tenant_id=_resolve_tid(self.request.user))

    def perform_create(self, serializer):
        serializer.save(athens_tenant_id=_resolve_tid(self.request.user))

class LeaveTypeViewSet(viewsets.ModelViewSet):
    serializer_class = LeaveTypeSerializer

    def get_permissions(self):
        # All authenticated users can list/retrieve leave types
        # Only admins can create/update/delete
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated(), WorkforceServiceEnabled()]
        return [IsAuthenticated(), WorkforceServiceEnabled(), IsWorkforceAdmin()]

    def get_queryset(self):
        return LeaveType.objects.filter(athens_tenant_id=_resolve_tid(self.request.user))

    def perform_create(self, serializer):
        serializer.save(athens_tenant_id=_resolve_tid(self.request.user))

    def list(self, request, *args, **kwargs):
        return ok(data=self.get_serializer(self.get_queryset(), many=True).data, request=request)

    def retrieve(self, request, *args, **kwargs):
        return ok(data=self.get_serializer(self.get_object()).data, request=request)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)

    def destroy(self, request, *args, **kwargs):
        self.perform_destroy(self.get_object())
        return ok(data=None, request=request, status=status.HTTP_204_NO_CONTENT)

class LeaveBalanceViewSet(viewsets.ModelViewSet):
    serializer_class = LeaveBalanceSerializer
    permission_classes = [IsAuthenticated, WorkforceServiceEnabled]
    

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return ok(data=serializer.data, request=request)
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return ok(data=serializer.data, request=request)
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return ok(data=None, request=request, status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        return LeaveBalance.objects.filter(athens_tenant_id=_resolve_tid(self.request.user))

    def perform_create(self, serializer):
        serializer.save(athens_tenant_id=_resolve_tid(self.request.user))

# ─── Leave hierarchy helpers ────────────────────────────────────────────────

def _get_user_role(user) -> str:
    """Return a canonical role string for the user."""
    ut = getattr(user, 'user_type', '')
    if ut == 'superadmin':
        return 'superadmin'
    if ut == 'masteradmin':
        return 'masteradmin'
    rt = getattr(user, 'role_type', 'user')
    at = getattr(user, 'admin_type', None)
    if rt == 'admin' or at in ('client', 'epc', 'contractor'):
        return at or 'admin'
    return 'user'


def _find_approver(requester) -> 'User | None':
    """
    Return the correct approver for `requester` based on hierarchy:
      user        → any admin in same project/company
      client/epc/contractor admin → masteradmin of same tenant
      masteradmin → superadmin
      superadmin  → None (no higher authority)
    """
    from authentication.models import User as AuthUser
    role = _get_user_role(requester)

    if role == 'superadmin':
        return None

    if role == 'masteradmin':
        return AuthUser.objects.filter(
            user_type='superadmin', is_active=True
        ).first()

    if role in ('client', 'epc', 'contractor', 'admin'):
        # Find a masteradmin scoped to the same tenant
        tenant, _ = get_current_tenant(requester)
        if tenant:
            approver = AuthUser.objects.filter(
                user_type='masteradmin', tenant=tenant, is_active=True
            ).first()
            if approver:
                return approver
        # Fallback: any masteradmin
        return AuthUser.objects.filter(
            user_type='masteradmin', is_active=True
        ).first()

    # role == 'user' → find admin in same project/company
    project = getattr(requester, 'project', None)
    company_id = getattr(requester, 'company_id', None)
    qs = AuthUser.objects.filter(
        user_type='companyuser', role_type='admin', is_active=True
    ).exclude(id=requester.id)
    if project:
        approver = qs.filter(project=project).first()
        if approver:
            return approver
    if company_id:
        approver = qs.filter(company_id=company_id).first()
        if approver:
            return approver
    return None


def _can_approve(approver, leave_request) -> tuple[bool, str]:
    """
    Returns (allowed: bool, reason: str).
    Enforces: no self-approval, correct hierarchy level.
    """
    if leave_request.employee_id == approver.id:
        return False, 'You cannot approve or reject your own leave request.'
    if leave_request.status != 'pending':
        return False, f'This request is already {leave_request.status}.'
    # If an approver was assigned, only they (or a higher authority) may act
    if leave_request.assigned_approver_id:
        assigned_role = _get_user_role(leave_request.assigned_approver)
        approver_role = _get_user_role(approver)
        hierarchy = ['user', 'admin', 'client', 'epc', 'contractor', 'masteradmin', 'superadmin']
        assigned_level = hierarchy.index(assigned_role) if assigned_role in hierarchy else 0
        approver_level = hierarchy.index(approver_role) if approver_role in hierarchy else 0
        if approver_level < assigned_level and leave_request.assigned_approver_id != approver.id:
            return False, 'You are not authorised to approve this request.'
    return True, ''


class LeaveRequestViewSet(viewsets.ModelViewSet):
    serializer_class = LeaveRequestSerializer
    permission_classes = [IsAuthenticated, WorkforceServiceEnabled]

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

    def get_queryset(self):
        user = self.request.user
        role = _get_user_role(user)
        tid  = _resolve_tid(user)

        base = LeaveRequest.objects.filter(
            athens_tenant_id=tid
        ).select_related('employee', 'leave_type', 'approved_by', 'assigned_approver')

        if role == 'superadmin':
            qs = LeaveRequest.objects.select_related(
                'employee', 'leave_type', 'approved_by', 'assigned_approver'
            ).all()
        elif role == 'masteradmin':
            # Own requests + requests assigned to them
            qs = base.filter(
                models.Q(employee=user) | models.Q(assigned_approver=user)
            )
        elif role in ('client', 'epc', 'contractor', 'admin'):
            # Own requests + employee requests under same project/company
            project = getattr(user, 'project', None)
            company_id = getattr(user, 'company_id', None)
            q = models.Q(employee=user) | models.Q(assigned_approver=user)
            if project:
                q |= models.Q(employee__project=project, employee__role_type='user')
            if company_id:
                q |= models.Q(employee__company_id=company_id, employee__role_type='user')
            qs = base.filter(q)
        else:
            # Regular user: own requests only
            qs = base.filter(employee=user)

        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        scope = self.request.query_params.get('scope')
        if scope == 'inbox':
            qs = qs.filter(assigned_approver=user, status='pending').exclude(employee=user)

        return qs.order_by('-created_at')

    def perform_create(self, serializer):
        user = self.request.user
        role = _get_user_role(user)
        approver = _find_approver(user)
        serializer.save(
            athens_tenant_id=_resolve_tid(user),
            employee=user,
            requester_role=role,
            assigned_approver=approver,
        )

    def list(self, request, *args, **kwargs):
        return ok(data=self.get_serializer(self.filter_queryset(self.get_queryset()), many=True).data, request=request)

    def retrieve(self, request, *args, **kwargs):
        return ok(data=self.get_serializer(self.get_object()).data, request=request)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        if instance.employee_id != request.user.id:
            return fail('FORBIDDEN', 'You can only edit your own leave requests.',
                        status=status.HTTP_403_FORBIDDEN, request=request)
        if instance.status != 'pending':
            return fail('INVALID_STATUS', 'Only pending requests can be edited.',
                        status=status.HTTP_400_BAD_REQUEST, request=request)
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.employee_id != request.user.id:
            return fail('FORBIDDEN', 'You can only cancel your own leave requests.',
                        status=status.HTTP_403_FORBIDDEN, request=request)
        if instance.status not in ('pending',):
            return fail('INVALID_STATUS', 'Only pending requests can be cancelled.',
                        status=status.HTTP_400_BAD_REQUEST, request=request)
        instance.status = 'cancelled'
        instance.save(update_fields=['status'])
        return ok(data={'detail': 'Leave request cancelled.'}, request=request)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        leave = self.get_object()
        allowed, reason = _can_approve(request.user, leave)
        if not allowed:
            return fail('FORBIDDEN', reason, status=status.HTTP_403_FORBIDDEN, request=request)
        leave.status = 'approved'
        leave.approved_by = request.user
        leave.approved_at = timezone.now()
        leave.save(update_fields=['status', 'approved_by', 'approved_at'])
        return ok(data=self.get_serializer(leave).data, request=request)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        leave = self.get_object()
        allowed, reason = _can_approve(request.user, leave)
        if not allowed:
            return fail('FORBIDDEN', reason, status=status.HTTP_403_FORBIDDEN, request=request)
        rejection_reason = (request.data.get('rejection_reason') or '').strip()
        leave.status = 'rejected'
        leave.approved_by = request.user
        leave.approved_at = timezone.now()
        leave.rejection_reason = rejection_reason
        leave.save(update_fields=['status', 'approved_by', 'approved_at', 'rejection_reason'])
        return ok(data=self.get_serializer(leave).data, request=request)

    @action(detail=False, methods=['get'])
    def inbox(self, request):
        """Pending requests assigned to the current user for approval."""
        qs = LeaveRequest.objects.filter(
            assigned_approver=request.user,
            status='pending'
        ).exclude(employee=request.user).select_related(
            'employee', 'leave_type', 'assigned_approver'
        ).order_by('-created_at')
        return ok(data=self.get_serializer(qs, many=True).data, request=request)

    @action(detail=False, methods=['get'])
    def my_requests(self, request):
        """All leave requests submitted by the current user."""
        qs = LeaveRequest.objects.filter(
            employee=request.user
        ).select_related('leave_type', 'approved_by', 'assigned_approver').order_by('-created_at')
        return ok(data=self.get_serializer(qs, many=True).data, request=request)


class ContractorMasterViewSet(viewsets.ModelViewSet):
    serializer_class = ContractorMasterSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tid = _resolve_tid(self.request.user)
        qs = ContractorMaster.objects.filter(athens_tenant_id=tid, status='active')
        company_type = self.request.query_params.get('company_type')
        if company_type:
            qs = qs.filter(company_type=company_type)
        return qs

    def perform_create(self, serializer):
        serializer.save(athens_tenant_id=_resolve_tid(self.request.user))


class UserAttendanceViewSet(viewsets.ModelViewSet):
    """
    Unified attendance for users and admins.

    Users  : can only see/create/update their own record.
    Admins : can see all records for their tenant/project.

    Special actions:
      GET  /api/workforce/user-attendance/today/       — today's record for logged-in user
      POST /api/workforce/user-attendance/             — check-in (creates record)
      PATCH /api/workforce/user-attendance/{id}/checkout/ — clock-out
    """
    serializer_class = UserAttendanceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if _is_any_admin(user):
            # Admin sees all records scoped to their project/company
            user_project = getattr(user, 'project', None)
            if user_project:
                return UserAttendance.objects.filter(
                    user__project=user_project
                ).select_related('user').order_by('-date', '-check_in_time')
            company_id = getattr(user, 'company_id', None)
            if company_id:
                return UserAttendance.objects.filter(
                    user__company_id=company_id
                ).select_related('user').order_by('-date', '-check_in_time')
            # masteradmin/superadmin — all records
            return UserAttendance.objects.select_related('user').order_by('-date', '-check_in_time')
        # Regular user — own records only
        return UserAttendance.objects.filter(user=user).order_by('-date')

    def create(self, request, *args, **kwargs):
        """User self check-in. Prevents duplicate check-in for same day."""
        today = timezone.localdate()
        if UserAttendance.objects.filter(user=request.user, date=today).exists():
            return Response(
                {'detail': 'Already checked in today.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        record = serializer.save(user=request.user, date=today)
        _sync_user_attendance_to_employee_attendance(request.user, record)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def today(self, request):
        """Return today's attendance record for the logged-in user, or 404."""
        today = timezone.localdate()
        try:
            record = UserAttendance.objects.get(user=request.user, date=today)
            return Response(UserAttendanceSerializer(record).data)
        except UserAttendance.DoesNotExist:
            return Response(None, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['patch'])
    def checkout(self, request, pk=None):
        """Clock-out: update check_out_time and optionally location."""
        record = self.get_object()
        if record.user != request.user and not _is_any_admin(request.user):
            return Response({'detail': 'Not allowed.'}, status=status.HTTP_403_FORBIDDEN)
        if record.check_out_time:
            return Response({'detail': 'Already clocked out.'}, status=status.HTTP_400_BAD_REQUEST)
        serializer = self.get_serializer(record, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        record = serializer.save()
        _sync_user_attendance_to_employee_attendance(record.user, record)
        return Response(serializer.data)
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated], url_path='admin-today')
    def admin_today(self, request):
        """Today's UserAttendance record for the logged-in admin (self-service clock-in/out)."""
        today = timezone.localdate()
        try:
            record = UserAttendance.objects.get(user=request.user, date=today)
            return Response(UserAttendanceSerializer(record).data)
        except UserAttendance.DoesNotExist:
            return Response(None, status=status.HTTP_404_NOT_FOUND)

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def dashboard(self, request):
        """Admin dashboard: every active Employee plus that day's Attendance record."""
        if not _is_any_admin(request.user):
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

        from django.db.models import Q
        from datetime import date as ddate

        date_str = request.query_params.get('date')
        try:
            target_date = ddate.fromisoformat(date_str) if date_str else timezone.localdate()
        except ValueError:
            return Response({'detail': 'Invalid date format. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        if getattr(user, 'user_type', None) in ('masteradmin', 'superadmin'):
            employees = Employee.objects.exclude(status='inactive')
        else:
            tenant, _ = get_current_tenant(user)
            allowed_tids = set()
            if tenant:
                allowed_tids.add(tenant.id)
            project = getattr(user, 'project', None)
            if project:
                allowed_tids.add(project.id)
            company_id = getattr(user, 'company_id', None)
            if company_id:
                allowed_tids.add(company_id)
            if not allowed_tids:
                allowed_tids.add(_resolve_tid(user))
            employees = Employee.objects.filter(athens_tenant_id__in=list(allowed_tids)).exclude(status='inactive')
        employees = employees.select_related('department', 'designation')

        search = request.query_params.get('search', '').strip()
        if search:
            employees = employees.filter(
                Q(full_name__icontains=search)
                | Q(employee_code__icontains=search)
                | Q(department__name__icontains=search)
            )

        department = request.query_params.get('department', '').strip()
        if department:
            employees = employees.filter(department__name__icontains=department)

        total_employees = employees.count()
        attendance_by_employee = {
            rec.employee_id: rec
            for rec in Attendance.objects.filter(employee__in=employees, date=target_date).select_related('employee')
        }

        status_filter = request.query_params.get('status', '').strip()
        records = []
        present_count = late_count = half_day_count = absent_count = checked_out_count = not_marked_count = 0

        for employee in employees.order_by('full_name', 'employee_code'):
            attendance = attendance_by_employee.get(employee.id)
            effective_status = _employee_display_status(attendance, target_date)

            if effective_status in ('present', 'late', 'checked_out'):
                present_count += 1
            if effective_status == 'late':
                late_count += 1
            if effective_status == 'half_day':
                half_day_count += 1
            if effective_status == 'checked_out':
                checked_out_count += 1
            if effective_status == 'not_marked':
                not_marked_count += 1
            if effective_status == 'absent':
                absent_count += 1

            row = {
                'id': attendance.id if attendance else None,
                'employee_id': employee.id,
                'employee_code': employee.employee_code,
                'name': employee.full_name,
                'email': '',
                'department': employee.department.name if employee.department else '',
                'designation': employee.designation.name if employee.designation else '',
                'check_in_time': str(attendance.in_time)[:5] if attendance and attendance.in_time else None,
                'check_out_time': str(attendance.out_time)[:5] if attendance and attendance.out_time else None,
                'total_hours': f"{attendance.total_hours}h" if attendance and attendance.total_hours else None,
                'status': effective_status,
                'current_state': (
                    'Working' if attendance and attendance.in_time and not attendance.out_time else
                    'Checked Out' if attendance and attendance.out_time else
                    'Not Marked'
                ),
                'is_late': _late_status(attendance),
                'latitude': attendance.latitude if attendance else None,
                'longitude': attendance.longitude if attendance else None,
                'has_record': bool(attendance),
            }

            if status_filter and row['status'] != status_filter:
                continue
            records.append(row)

        return Response({
            'date': str(target_date),
            'summary': {
                'total': total_employees,
                'present': present_count,
                'late': late_count,
                'half_day': half_day_count,
                'absent': absent_count,
                'checked_out': checked_out_count,
                'not_marked': not_marked_count,
            },
            'records': records,
        })

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated], url_path='admin-checkin')
    def admin_checkin(self, request):
        """Admin check-in, override, or correction for an Employee attendance row."""
        if not _is_any_admin(request.user):
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

        from datetime import date as ddate

        employee_id = request.data.get('employee_id') or request.data.get('user_id')
        if not employee_id:
            return Response({'detail': 'employee_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        employee_qs = Employee.objects.exclude(status='inactive')
        if getattr(request.user, 'user_type', None) not in ('masteradmin', 'superadmin'):
            tenant, _ = get_current_tenant(request.user)
            allowed_tids = set()
            if tenant:
                allowed_tids.add(tenant.id)
            project = getattr(request.user, 'project', None)
            if project:
                allowed_tids.add(project.id)
            company_id = getattr(request.user, 'company_id', None)
            if company_id:
                allowed_tids.add(company_id)
            if not allowed_tids:
                allowed_tids.add(_resolve_tid(request.user))
            employee_qs = employee_qs.filter(athens_tenant_id__in=list(allowed_tids))

        try:
            employee = employee_qs.get(id=employee_id)
        except Employee.DoesNotExist:
            return Response({'detail': 'Employee not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            target_date = ddate.fromisoformat(request.data.get('date')) if request.data.get('date') else timezone.localdate()
        except ValueError:
            return Response({'detail': 'Invalid date.'}, status=status.HTTP_400_BAD_REQUEST)

        check_in_time = _parse_hhmm(request.data.get('check_in_time'), timezone.localtime().time())
        check_out_time = _parse_hhmm(request.data.get('check_out_time'))
        total_hours = _calculate_hours(check_in_time, check_out_time)
        status_code = 'A' if request.data.get('status') == 'absent' else 'P'

        defaults = {
            'athens_tenant_id': employee.athens_tenant_id,
            'in_time': check_in_time,
            'out_time': check_out_time,
            'total_hours': total_hours,
            'status': status_code,
            'latitude': request.data.get('latitude'),
            'longitude': request.data.get('longitude'),
            **_attendance_scope_metadata(request.user),
        }
        record, created = Attendance.objects.update_or_create(employee=employee, date=target_date, defaults=defaults)
        return Response({
            'id': record.id,
            'employee_id': employee.id,
            'date': str(target_date),
            'check_in_time': str(record.in_time)[:5] if record.in_time else None,
            'check_out_time': str(record.out_time)[:5] if record.out_time else None,
            'status': _employee_display_status(record, target_date),
            'created': created,
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated], url_path='admin-checkout')
    def admin_checkout(self, request):
        """Admin check-out/correction for an Employee attendance row."""
        if not _is_any_admin(request.user):
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

        from datetime import date as ddate

        employee_id = request.data.get('employee_id') or request.data.get('user_id')
        if not employee_id:
            return Response({'detail': 'employee_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        employee_qs = Employee.objects.exclude(status='inactive')
        if getattr(request.user, 'user_type', None) not in ('masteradmin', 'superadmin'):
            tenant, _ = get_current_tenant(request.user)
            allowed_tids = set()
            if tenant:
                allowed_tids.add(tenant.id)
            project = getattr(request.user, 'project', None)
            if project:
                allowed_tids.add(project.id)
            company_id = getattr(request.user, 'company_id', None)
            if company_id:
                allowed_tids.add(company_id)
            if not allowed_tids:
                allowed_tids.add(_resolve_tid(request.user))
            employee_qs = employee_qs.filter(athens_tenant_id__in=list(allowed_tids))

        try:
            employee = employee_qs.get(id=employee_id)
        except Employee.DoesNotExist:
            return Response({'detail': 'Employee not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            target_date = ddate.fromisoformat(request.data.get('date')) if request.data.get('date') else timezone.localdate()
        except ValueError:
            return Response({'detail': 'Invalid date.'}, status=status.HTTP_400_BAD_REQUEST)

        record, _ = Attendance.objects.get_or_create(
            employee=employee,
            date=target_date,
            defaults={
                'athens_tenant_id': employee.athens_tenant_id,
                'status': 'P',
                **_attendance_scope_metadata(request.user),
            }
        )
        record.out_time = _parse_hhmm(request.data.get('check_out_time'), timezone.localtime().time())
        if not record.in_time:
            record.in_time = _parse_hhmm(request.data.get('check_in_time'), record.out_time)
        record.total_hours = _calculate_hours(record.in_time, record.out_time)
        record.status = 'P' if record.in_time else 'A'
        record.latitude = request.data.get('latitude') or record.latitude
        record.longitude = request.data.get('longitude') or record.longitude
        record.save()

        return Response({
            'id': record.id,
            'employee_id': employee.id,
            'check_out_time': str(record.out_time)[:5] if record.out_time else None,
            'status': _employee_display_status(record, target_date),
        })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def contractoruser_list(request):
    """Compat endpoint: returns contractor companies in the format SafetyObservationForm expects."""
    contractors = ContractorMaster.objects.filter(
        athens_tenant_id=_resolve_tid(request.user), status='active', company_type='contractor'
    ).values('id', 'company_name', 'contact_person', 'contact_number', 'email')
    users = [{'company_name': c['company_name'], 'id': c['id']} for c in contractors]
    return Response({'users': users})
