from rest_framework import permissions
from control_plane.models import TenantService, Service
from system.utils import get_current_tenant
from authentication.permissions import IsServiceAdmin


def _is_any_admin(user) -> bool:
    """
    Returns True for any user that should be treated as a project-level admin.
    Covers all three creation paths:
      1. Original subscriber admin:  admin_type in ('client','epc','contractor')
      2. Admin created by MasterAdmin: role_type='admin', admin_type=None
      3. Admin with company_type set:  company_type in ('client','epc','contractor')
    Also always allows masteradmin and superadmin.
    """
    if not user or not user.is_authenticated:
        return False
    if user.user_type in ('masteradmin', 'superadmin'):
        return True
    if user.user_type == 'companyuser':
        if getattr(user, 'admin_type', None) in ('client', 'epc', 'contractor',
                                                   'clientuser', 'epcuser', 'contractoruser'):
            return True
        if getattr(user, 'role_type', None) == 'admin':
            return True
        if getattr(user, 'company_type', None) in ('client', 'epc', 'contractor'):
            return True
    return False


class WorkforceServiceEnabled(permissions.BasePermission):
    """
    Check if Workforce service is enabled for tenant.
    All admin roles always bypass this check.
    Regular users (role_type='user') are checked against the service flag.
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        # All admin roles bypass the service flag check entirely
        if _is_any_admin(user):
            return True

        # Regular users: check if service is enabled for their tenant
        tenant, error = get_current_tenant(user)
        if error or not tenant:
            return True  # fail-open: no tenant config should not block users

        try:
            service = Service.objects.get(code='workforce')
            tenant_service = TenantService.objects.get(tenant=tenant, service=service)
            if not tenant_service.is_enabled:
                self.message = {'error': 'SERVICE_DISABLED', 'detail': 'Workforce service is not enabled'}
                return False
            return True
        except (Service.DoesNotExist, TenantService.DoesNotExist):
            return True  # not configured = fail-open


class IsWorkforceAdmin(permissions.BasePermission):
    """
    Allow write access to Workforce data.
    Permitted: any admin role (client/epc/contractor admin_type, role_type='admin',
    company_type set) plus masteradmin and superadmin.
    Blocks: regular users (role_type='user').
    """

    def has_permission(self, request, view):
        if _is_any_admin(request.user):
            return True
        self.message = {'error': 'WORKFORCE_ADMIN_REQUIRED',
                        'detail': 'Only admin roles can manage workforce data.'}
        return False
