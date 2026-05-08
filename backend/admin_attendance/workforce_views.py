"""
Admin Workforce Management Views
Centralized monitoring for Master Admin: employees under admins, leave approvals, payroll approvals
"""
from django.utils import timezone
from django.db.models import Q, Count, Prefetch
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from authentication.models import User
from workforce.models import Employee, Attendance, LeaveRequest, PayrollEntry
from .models import AdminAttendance


def _require_masteradmin_or_superadmin(user):
    return getattr(user, 'user_type', None) in ('masteradmin', 'superadmin')


def _get_tenant_id(user):
    return getattr(user, 'athens_tenant_id', None)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_hierarchy_view(request):
    """
    Get all admins with their employees grouped underneath.
    Returns expandable hierarchy for Master Admin.
    """
    if not _require_masteradmin_or_superadmin(request.user):
        return Response({'detail': 'Forbidden'}, status=403)

    date_str = request.query_params.get('date', timezone.localdate().isoformat())
    try:
        from datetime import date
        target_date = date.fromisoformat(date_str)
    except ValueError:
        target_date = timezone.localdate()

    tenant_id = _get_tenant_id(request.user) if request.user.user_type == 'masteradmin' else None

    # Get all admins
    admin_roles = ('client', 'epc', 'contractor', 'project_admin', 'owner')
    admin_qs = User.objects.filter(admin_type__in=admin_roles, is_active=True)
    if tenant_id:
        admin_qs = admin_qs.filter(athens_tenant_id=tenant_id)

    # Get admin attendance for the date
    admin_attendance_map = {}
    for att in AdminAttendance.objects.filter(attendance_date=target_date).select_related('admin'):
        admin_attendance_map[att.admin_id] = {
            'check_in_time': att.check_in_time.isoformat() if att.check_in_time else None,
            'check_out_time': att.check_out_time.isoformat() if att.check_out_time else None,
            'status': att.status,
            'total_hours': str(att.total_hours),
        }

    # Get all employees
    employee_qs = Employee.objects.filter(is_active=True)
    if tenant_id:
        employee_qs = employee_qs.filter(athens_tenant_id=tenant_id)

    # Get employee attendance for the date
    employee_attendance_map = {}
    for att in Attendance.objects.filter(date=target_date).select_related('employee'):
        employee_attendance_map[att.employee_id] = {
            'check_in_time': att.in_time.isoformat() if att.in_time else None,
            'check_out_time': att.out_time.isoformat() if att.out_time else None,
            'status': att.status,
            'total_hours': str(att.total_hours) if att.total_hours else '0',
        }

    # Build hierarchy
    result = []
    for admin in admin_qs:
        admin_data = {
            'id': admin.id,
            'email': admin.email,
            'name': f"{admin.first_name} {admin.last_name}".strip() or admin.email.split('@')[0],
            'admin_type': admin.admin_type,
            'organization': getattr(admin, 'organization', ''),
            'project_name': getattr(admin, 'project_name', ''),
            'attendance': admin_attendance_map.get(admin.id, {
                'check_in_time': None,
                'check_out_time': None,
                'status': 'absent',
                'total_hours': '0',
            }),
            'employees': []
        }

        # Find employees under this admin (by project or company)
        project_id = getattr(admin, 'project_id', None)
        company_id = getattr(admin, 'company_id', None)

        emp_filter = Q()
        if project_id:
            emp_filter |= Q(project_id=project_id)
        if company_id:
            emp_filter |= Q(company_id=company_id)

        if emp_filter:
            employees = employee_qs.filter(emp_filter)
            for emp in employees:
                admin_data['employees'].append({
                    'id': emp.id,
                    'employee_code': emp.employee_code,
                    'full_name': emp.full_name,
                    'department': emp.department.name if emp.department else '',
                    'designation': emp.designation.name if emp.designation else '',
                    'attendance': employee_attendance_map.get(emp.id, {
                        'check_in_time': None,
                        'check_out_time': None,
                        'status': 'A',
                        'total_hours': '0',
                    }),
                })

        result.append(admin_data)

    return Response({'data': result})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def leave_requests_for_masteradmin(request):
    """
    Get all leave requests visible to Master Admin.
    Includes both employee and admin leave requests.
    """
    if not _require_masteradmin_or_superadmin(request.user):
        return Response({'detail': 'Forbidden'}, status=403)

    tenant_id = _get_tenant_id(request.user) if request.user.user_type == 'masteradmin' else None

    qs = LeaveRequest.objects.select_related(
        'employee', 'leave_type', 'approved_by', 'assigned_approver'
    ).order_by('-created_at')

    if tenant_id:
        qs = qs.filter(athens_tenant_id=tenant_id)

    # Filter by status
    status_filter = request.query_params.get('status')
    if status_filter:
        qs = qs.filter(status=status_filter)

    # Master admin can approve admin leave requests
    data = []
    for leave in qs:
        employee = leave.employee
        data.append({
            'id': leave.id,
            'employee_id': employee.id,
            'employee_name': employee.full_name,
            'employee_code': employee.employee_code,
            'employee_role': getattr(employee, 'designation', {}).name if hasattr(employee, 'designation') else '',
            'leave_type_name': leave.leave_type.name,
            'start_date': leave.start_date.isoformat(),
            'end_date': leave.end_date.isoformat(),
            'days_count': leave.days_count,
            'reason': leave.reason,
            'status': leave.status,
            'approver_name': leave.approved_by.email if leave.approved_by else None,
            'assigned_approver_name': leave.assigned_approver.email if leave.assigned_approver else None,
            'can_approve': leave.status == 'pending' and (
                leave.assigned_approver_id == request.user.id or
                request.user.user_type in ('masteradmin', 'superadmin')
            ),
            'created_at': leave.created_at.isoformat(),
        })

    return Response({'data': data})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def approve_leave_request(request, pk):
    """Master Admin approves a leave request."""
    if not _require_masteradmin_or_superadmin(request.user):
        return Response({'detail': 'Forbidden'}, status=403)

    try:
        leave = LeaveRequest.objects.get(pk=pk)
    except LeaveRequest.DoesNotExist:
        return Response({'detail': 'Not found'}, status=404)

    tenant_id = _get_tenant_id(request.user)
    if request.user.user_type == 'masteradmin' and leave.athens_tenant_id != tenant_id:
        return Response({'detail': 'Forbidden'}, status=403)

    if leave.status != 'pending':
        return Response({'detail': 'Leave request already processed'}, status=400)

    leave.status = 'approved'
    leave.approved_by = request.user
    leave.approved_at = timezone.now()
    leave.save(update_fields=['status', 'approved_by', 'approved_at'])

    return Response({'message': 'Leave request approved', 'status': 'approved'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def reject_leave_request(request, pk):
    """Master Admin rejects a leave request."""
    if not _require_masteradmin_or_superadmin(request.user):
        return Response({'detail': 'Forbidden'}, status=403)

    try:
        leave = LeaveRequest.objects.get(pk=pk)
    except LeaveRequest.DoesNotExist:
        return Response({'detail': 'Not found'}, status=404)

    tenant_id = _get_tenant_id(request.user)
    if request.user.user_type == 'masteradmin' and leave.athens_tenant_id != tenant_id:
        return Response({'detail': 'Forbidden'}, status=403)

    if leave.status != 'pending':
        return Response({'detail': 'Leave request already processed'}, status=400)

    rejection_reason = request.data.get('rejection_reason', '').strip()
    leave.status = 'rejected'
    leave.approved_by = request.user
    leave.approved_at = timezone.now()
    leave.rejection_reason = rejection_reason
    leave.save(update_fields=['status', 'approved_by', 'approved_at', 'rejection_reason'])

    return Response({'message': 'Leave request rejected', 'status': 'rejected'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def payroll_entries_for_masteradmin(request):
    """
    Get all payroll entries visible to Master Admin.
    """
    if not _require_masteradmin_or_superadmin(request.user):
        return Response({'detail': 'Forbidden'}, status=403)

    tenant_id = _get_tenant_id(request.user) if request.user.user_type == 'masteradmin' else None

    qs = PayrollEntry.objects.select_related(
        'employee', 'cycle', 'employee__department'
    ).order_by('-created_at')

    if tenant_id:
        qs = qs.filter(athens_tenant_id=tenant_id)

    # Filter by payment status
    payment_status = request.query_params.get('payment_status')
    if payment_status:
        qs = qs.filter(payment_status=payment_status)

    data = []
    for entry in qs:
        data.append({
            'id': entry.id,
            'employee_id': entry.employee.id,
            'employee_name': entry.employee.full_name,
            'employee_code': entry.employee.employee_code,
            'department_name': entry.employee.department.name if entry.employee.department else '',
            'cycle_name': entry.cycle.name,
            'gross_salary': str(entry.gross_salary),
            'total_deductions': str(entry.total_deductions),
            'net_salary': str(entry.net_salary),
            'payment_status': entry.payment_status,
            'payment_date': entry.payment_date.isoformat() if entry.payment_date else None,
            'payment_mode': entry.payment_mode,
            'can_approve': entry.payment_status == 'processed',
        })

    return Response({'data': data})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def approve_payroll_payment(request, pk):
    """Master Admin approves payroll payment."""
    if not _require_masteradmin_or_superadmin(request.user):
        return Response({'detail': 'Forbidden'}, status=403)

    try:
        entry = PayrollEntry.objects.get(pk=pk)
    except PayrollEntry.DoesNotExist:
        return Response({'detail': 'Not found'}, status=404)

    tenant_id = _get_tenant_id(request.user)
    if request.user.user_type == 'masteradmin' and entry.athens_tenant_id != tenant_id:
        return Response({'detail': 'Forbidden'}, status=403)

    if entry.payment_status != 'processed':
        return Response({'detail': 'Payroll entry not ready for payment'}, status=400)

    payment_mode = request.data.get('payment_mode', 'bank')
    entry.payment_status = 'paid'
    entry.payment_date = timezone.now()
    entry.payment_mode = payment_mode
    entry.save(update_fields=['payment_status', 'payment_date', 'payment_mode'])

    return Response({'message': 'Payroll payment approved', 'status': 'paid'})


@api_view(['GET'])
@permission_calls([IsAuthenticated])
def pending_approvals_summary(request):
    """
    Get summary of all pending approvals for Master Admin.
    """
    if not _require_masteradmin_or_superadmin(request.user):
        return Response({'detail': 'Forbidden'}, status=403)

    tenant_id = _get_tenant_id(request.user) if request.user.user_type == 'masteradmin' else None

    # Count pending leave requests
    leave_qs = LeaveRequest.objects.filter(status='pending')
    if tenant_id:
        leave_qs = leave_qs.filter(athens_tenant_id=tenant_id)
    pending_leaves = leave_qs.count()

    # Count pending payroll entries
    payroll_qs = PayrollEntry.objects.filter(payment_status='processed')
    if tenant_id:
        payroll_qs = payroll_qs.filter(athens_tenant_id=tenant_id)
    pending_payroll = payroll_qs.count()

    return Response({
        'pending_leaves': pending_leaves,
        'pending_payroll': pending_payroll,
        'total_pending': pending_leaves + pending_payroll,
    })
