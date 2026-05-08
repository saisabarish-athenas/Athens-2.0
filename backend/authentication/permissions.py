from rest_framework import permissions
from authentication.models import UserType
from authentication.tenant_utils import get_tenant_for_user, get_tenant_id_for_filtering, require_tenant


# ============================================================================
# CANONICAL PERMISSION CLASSES
# ============================================================================

class IsSuperAdmin(permissions.BasePermission):
    """Only superadmin users can access"""
    
    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.user_type == UserType.SUPERADMIN
        )


class IsMasterAdmin(permissions.BasePermission):
    """Only master admin users can access"""
    
    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.user_type == UserType.MASTERADMIN
        )


class IsCompanyUser(permissions.BasePermission):
    """Only company users can access"""
    
    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.user_type == UserType.COMPANYUSER
        )


class IsServiceUser(permissions.BasePermission):
    """Only service users can access"""
    
    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.user_type == UserType.SERVICEUSER
        )


class IsSuperAdminOrMasterAdmin(permissions.BasePermission):
    """Allow SuperAdmin (global) or MasterAdmin (tenant-scoped)"""
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.user_type in [UserType.SUPERADMIN, UserType.MASTERADMIN]


class HasTenant(permissions.BasePermission):
    """Require user to have a tenant (blocks SuperAdmin, allows MasterAdmin/CompanyUser)"""
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        tenant, error = require_tenant(request.user)
        if error:
            self.message = error
            return False
        return True


class IsServiceAdmin(permissions.BasePermission):
    """Allow MasterAdmin or CompanyUser with admin_type (Owner/Admin)"""
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        if request.user.user_type == UserType.MASTERADMIN:
            return True
        
        if request.user.user_type == UserType.COMPANYUSER:
            # Allow any companyuser with an admin_type (client/epc/contractor)
            if request.user.admin_type:
                return True
            # Also allow role_type='admin' (project admins created via admin creation flow)
            if getattr(request.user, 'role_type', None) == 'admin':
                return True
        
        self.message = {"error": "Only Owner/Admin can manage services"}
        return False


# ============================================================================
# TENANT-AWARE PERMISSION MIXIN
# ============================================================================

class TenantScopedPermissionMixin:
    """
    Mixin for object-level tenant scoping.
    
    Usage:
        class MyPermission(TenantScopedPermissionMixin, permissions.BasePermission):
            def has_object_permission(self, request, view, obj):
                if not super().has_object_permission(request, view, obj):
                    return False
                # Additional checks...
                return True
    """
    
    def has_object_permission(self, request, view, obj):
        """Check if user can access object based on tenant"""
        user = request.user
        
        # SuperAdmin can access all
        if user.user_type == UserType.SUPERADMIN:
            return True
        
        # Get user's tenant
        user_tenant_id = get_tenant_id_for_filtering(user)
        if user_tenant_id is None:
            return False
        
        # Get object's tenant (try common field names)
        obj_tenant_id = getattr(obj, 'athens_tenant_id', None) or \
                       getattr(obj, 'tenant_id', None) or \
                       getattr(obj, 'company_id', None)
        
        if obj_tenant_id is None:
            # Object has no tenant field - allow if user has tenant
            return True
        
        # Check tenant match
        return user_tenant_id == obj_tenant_id


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_user_tenant_id(user):
    """
    Get tenant ID for user using canonical helper.
    
    Returns:
        int or None: Tenant ID, or None for SuperAdmin/no tenant
    """
    return get_tenant_id_for_filtering(user)


def is_same_tenant(user, obj_tenant_id):
    """
    Check if user belongs to the same tenant as object.
    
    Args:
        user: User instance
        obj_tenant_id: Tenant ID of the object
    
    Returns:
        bool: True if same tenant or user is SuperAdmin
    """
    if user.user_type == UserType.SUPERADMIN:
        return True
    
    user_tenant_id = get_tenant_id_for_filtering(user)
    if user_tenant_id is None:
        return False
    
    return user_tenant_id == obj_tenant_id


def check_tenant_access(user, obj):
    """
    Check if user can access object based on tenant.
    
    Args:
        user: User instance
        obj: Object with tenant field (athens_tenant_id, tenant_id, or company_id)
    
    Returns:
        bool: True if user can access object
    """
    if user.user_type == UserType.SUPERADMIN:
        return True
    
    user_tenant_id = get_tenant_id_for_filtering(user)
    if user_tenant_id is None:
        return False
    
    obj_tenant_id = getattr(obj, 'athens_tenant_id', None) or \
                   getattr(obj, 'tenant_id', None) or \
                   getattr(obj, 'company_id', None)
    
    if obj_tenant_id is None:
        return True
    
    return user_tenant_id == obj_tenant_id
