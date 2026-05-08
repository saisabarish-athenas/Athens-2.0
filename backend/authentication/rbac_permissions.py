"""
RBAC Permission Classes for Athens 2.0
Imported from old Athens with tenant-scoping enhancements
"""
from rest_framework import permissions
from rest_framework.exceptions import PermissionDenied
from .tenant_resolver import TenantResolver


class IsSuperAdmin(permissions.BasePermission):
    """Platform-level superadmin for SaaS control plane"""
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            getattr(request.user, 'user_type', None) == 'superadmin'
        )


class IsMasterAdmin(permissions.BasePermission):
    """Master admin users (tenant-scoped)"""
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            getattr(request.user, 'user_type', None) == 'masteradmin'
        )


class IsProjectAdmin(permissions.BasePermission):
    """Project admin users (client, epc, contractor admins)"""
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            getattr(request.user, 'user_type', None) == 'projectadmin'
        )


class IsAdminUser(permissions.BasePermission):
    """Admin users created by project admins"""
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            getattr(request.user, 'user_type', None) == 'adminuser'
        )


class RequireTenantContext(permissions.BasePermission):
    """
    Ensures tenant context is attached to request.
    Uses TenantResolver to extract and validate tenant.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # SuperAdmin bypasses tenant checks
        if getattr(request.user, 'user_type', None) == 'superadmin':
            return True
        
        # Attach tenant context using resolver
        try:
            tenant = TenantResolver.resolve_tenant(request)
            if tenant:
                TenantResolver.attach_tenant_context(request, tenant)
                return True
            return False
        except Exception:
            return False


class RequireTenantPermission(permissions.BasePermission):
    """
    Tenant-scoped permission check.
    Usage: permission_classes = [RequireTenantPermission]
    
    Ensures:
    - User is authenticated
    - Tenant context is present
    - User has required permission in tenant scope
    """
    required_permission = None  # Override in subclass or pass as param
    
    def __init__(self, permission_code=None):
        if permission_code:
            self.required_permission = permission_code
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # SuperAdmin and MasterAdmin bypass tenant checks
        if getattr(request.user, 'user_type', None) in ['superadmin', 'masteradmin']:
            return True
        
        # Attach tenant context for other users
        try:
            tenant = TenantResolver.resolve_tenant(request)
            if not tenant:
                raise PermissionDenied({"error": "TENANT_CONTEXT_REQUIRED", "message": "Tenant context missing"})
            TenantResolver.attach_tenant_context(request, tenant)
        except PermissionDenied:
            raise
        except Exception:
            raise PermissionDenied({"error": "TENANT_CONTEXT_REQUIRED", "message": "Tenant context missing"})
        
        user_type = getattr(request.user, 'user_type', None)
        if user_type in ['projectadmin', 'companyuser', 'adminuser']:
            return True
        
        return False


def require_master_admin(view_func):
    """Decorator for function-based views requiring master admin"""
    def _wrapped_view(request, *args, **kwargs):
        if not (
            request.user and
            request.user.is_authenticated and
            getattr(request.user, 'user_type', None) in ['master', 'masteradmin']
        ):
            raise PermissionDenied("Master admin privileges required")
        return view_func(request, *args, **kwargs)
    return _wrapped_view
