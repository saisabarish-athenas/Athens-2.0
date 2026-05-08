from django.utils import timezone
from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from authentication.models import User
from .models import AdminAttendance
from .serializers import (
    AdminAttendanceSerializer,
    ManualAttendanceSerializer,
    AttendanceCorrectionSerializer,
    ForceCheckoutSerializer,
)

ADMIN_ROLES = ('client', 'epc', 'contractor', 'project_admin', 'owner')


def _require_masteradmin_or_superadmin(user):
    ut = getattr(user, 'user_type', None)
    return ut in ('masteradmin', 'superadmin')


def _get_tenant_id(user):
    return getattr(user, 'athens_tenant_id', None)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def attendance_dashboard(request):
    """Summary KPIs for today's admin attendance."""
    if not _require_masteradmin_or_superadmin(request.user):
        return Response({'detail': 'Forbidden'}, status=403)

    today = timezone.localdate()
    qs = AdminAttendance.objects.filter(attendance_date=today)

    # Superadmin sees all; masteradmin scoped to tenant
    if request.user.user_type == 'masteradmin':
        tenant_id = _get_tenant_id(request.user)
        qs = qs.filter(athens_tenant_id=tenant_id)

    total_admins = _count_admin_users(request.user)
    status_counts = {s: 0 for s, _ in AdminAttendance.STATUS_CHOICES}
    for row in qs.values('status'):
        status_counts[row['status']] = status_counts.get(row['status'], 0) + 1

    return Response({
        'date': today.isoformat(),
        'total_admins': total_admins,
        'present': status_counts.get('present', 0),
        'absent': total_admins - sum(v for k, v in status_counts.items() if k != 'absent'),
        'late': status_counts.get('late', 0),
        'half_day': status_counts.get('half_day', 0),
        'working': status_counts.get('working', 0),
        'checked_out': status_counts.get('checked_out', 0),
    })


def _count_admin_users(user):
    qs = User.objects.filter(admin_type__in=ADMIN_ROLES, is_active=True)
    if user.user_type == 'masteradmin':
        tenant_id = _get_tenant_id(user)
        qs = qs.filter(athens_tenant_id=tenant_id)
    return qs.count()


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def attendance_list(request):
    """List admin attendance records with filters."""
    if not _require_masteradmin_or_superadmin(request.user):
        return Response({'detail': 'Forbidden'}, status=403)

    date_str = request.query_params.get('date', timezone.localdate().isoformat())
    try:
        from datetime import date
        filter_date = date.fromisoformat(date_str)
    except ValueError:
        filter_date = timezone.localdate()

    qs = AdminAttendance.objects.filter(attendance_date=filter_date).select_related('admin', 'corrected_by')

    if request.user.user_type == 'masteradmin':
        tenant_id = _get_tenant_id(request.user)
        qs = qs.filter(athens_tenant_id=tenant_id)

    # Filters
    status_filter = request.query_params.get('status')
    if status_filter:
        qs = qs.filter(status=status_filter)

    admin_type_filter = request.query_params.get('admin_type')
    if admin_type_filter:
        qs = qs.filter(admin_role=admin_type_filter)

    search = request.query_params.get('search', '').strip()
    if search:
        qs = qs.filter(
            Q(admin__email__icontains=search) |
            Q(admin__first_name__icontains=search) |
            Q(admin__last_name__icontains=search) |
            Q(organization__icontains=search) |
            Q(project_name__icontains=search)
        )

    serializer = AdminAttendanceSerializer(qs, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_manual_attendance(request):
    """Mark or update attendance manually."""
    if not _require_masteradmin_or_superadmin(request.user):
        return Response({'detail': 'Forbidden'}, status=403)

    ser = ManualAttendanceSerializer(data=request.data)
    if not ser.is_valid():
        return Response(ser.errors, status=400)

    data = ser.validated_data
    try:
        admin_user = User.objects.get(pk=data['admin_id'])
    except User.DoesNotExist:
        return Response({'detail': 'Admin user not found'}, status=404)

    # Tenant scope check
    if request.user.user_type == 'masteradmin':
        tenant_id = _get_tenant_id(request.user)
        if _get_tenant_id(admin_user) != tenant_id:
            return Response({'detail': 'Forbidden'}, status=403)

    record, _ = AdminAttendance.objects.get_or_create(
        admin=admin_user,
        attendance_date=data['attendance_date'],
        defaults={'athens_tenant_id': _get_tenant_id(admin_user) or 0}
    )

    if 'check_in_time' in data:
        record.check_in_time = data['check_in_time']
    if 'check_out_time' in data:
        record.check_out_time = data['check_out_time']
    if 'check_in_lat' in data:
        record.check_in_lat = data.get('check_in_lat')
        record.check_in_lng = data.get('check_in_lng')

    record.is_manual = True
    record.correction_note = data.get('correction_note', '')
    record.corrected_by = request.user
    record.corrected_at = timezone.now()

    if 'status' in data:
        record.status = data['status']
    else:
        record.compute_status()

    record.save()
    return Response(AdminAttendanceSerializer(record).data, status=201)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def correct_attendance(request, pk):
    """Correct an existing attendance record."""
    if not _require_masteradmin_or_superadmin(request.user):
        return Response({'detail': 'Forbidden'}, status=403)

    try:
        record = AdminAttendance.objects.get(pk=pk)
    except AdminAttendance.DoesNotExist:
        return Response({'detail': 'Not found'}, status=404)

    if request.user.user_type == 'masteradmin':
        tenant_id = _get_tenant_id(request.user)
        if record.athens_tenant_id != tenant_id:
            return Response({'detail': 'Forbidden'}, status=403)

    ser = AttendanceCorrectionSerializer(data=request.data)
    if not ser.is_valid():
        return Response(ser.errors, status=400)

    data = ser.validated_data
    for field in ('check_in_time', 'check_out_time', 'status'):
        if field in data:
            setattr(record, field, data[field])

    record.correction_note = data.get('correction_note', record.correction_note)
    record.is_manual = True
    record.corrected_by = request.user
    record.corrected_at = timezone.now()

    if 'status' not in data:
        record.compute_status()

    record.save()
    return Response(AdminAttendanceSerializer(record).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def force_checkout(request, pk):
    """Force checkout an admin who is still marked as working."""
    if not _require_masteradmin_or_superadmin(request.user):
        return Response({'detail': 'Forbidden'}, status=403)

    try:
        record = AdminAttendance.objects.get(pk=pk)
    except AdminAttendance.DoesNotExist:
        return Response({'detail': 'Not found'}, status=404)

    if request.user.user_type == 'masteradmin':
        tenant_id = _get_tenant_id(request.user)
        if record.athens_tenant_id != tenant_id:
            return Response({'detail': 'Forbidden'}, status=403)

    ser = ForceCheckoutSerializer(data=request.data)
    if not ser.is_valid():
        return Response(ser.errors, status=400)

    record.check_out_time = timezone.now()
    record.is_manual = True
    record.correction_note = ser.validated_data.get('correction_note', 'Force checkout by Master Admin')
    record.corrected_by = request.user
    record.corrected_at = timezone.now()
    record.compute_status()
    record.save()

    return Response(AdminAttendanceSerializer(record).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def export_attendance(request):
    """Export attendance as CSV."""
    if not _require_masteradmin_or_superadmin(request.user):
        return Response({'detail': 'Forbidden'}, status=403)

    import csv
    from django.http import HttpResponse

    date_from = request.query_params.get('date_from', timezone.localdate().isoformat())
    date_to = request.query_params.get('date_to', timezone.localdate().isoformat())

    qs = AdminAttendance.objects.filter(
        attendance_date__gte=date_from,
        attendance_date__lte=date_to,
    ).select_related('admin').order_by('attendance_date', 'admin__email')

    if request.user.user_type == 'masteradmin':
        tenant_id = _get_tenant_id(request.user)
        qs = qs.filter(athens_tenant_id=tenant_id)

    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="admin_attendance_{date_from}_{date_to}.csv"'

    writer = csv.writer(response)
    writer.writerow([
        'Date', 'Admin Email', 'Admin Name', 'Role', 'Organization', 'Project',
        'Check In', 'Check Out', 'Total Hours', 'Status', 'Manual', 'Note'
    ])

    for r in qs:
        name_parts = [r.admin.first_name, r.admin.last_name]
        name = ' '.join(p for p in name_parts if p).strip() or r.admin.email.split('@')[0]
        writer.writerow([
            r.attendance_date,
            r.admin.email,
            name,
            r.admin_role,
            r.organization,
            r.project_name,
            r.check_in_time.strftime('%H:%M:%S') if r.check_in_time else '',
            r.check_out_time.strftime('%H:%M:%S') if r.check_out_time else '',
            r.total_hours,
            r.status,
            'Yes' if r.is_manual else 'No',
            r.correction_note,
        ])

    return response
