from rest_framework import serializers
from .models import *

# MODULE 1: EMPLOYEE & WORKFORCE MANAGEMENT

class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = '__all__'
        read_only_fields = ['id', 'athens_tenant_id', 'created_at']

class DesignationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Designation
        fields = '__all__'
        read_only_fields = ['id', 'athens_tenant_id', 'created_at']

class EmployeeSerializer(serializers.ModelSerializer):
    age = serializers.ReadOnlyField()
    department_name = serializers.CharField(source='department.name', read_only=True)
    designation_name = serializers.CharField(source='designation.name', read_only=True)

    # Accept empty string or null — convert to None before date parsing
    date_of_birth = serializers.DateField(required=False, allow_null=True, default=None)
    joining_date = serializers.DateField(required=False, allow_null=True, default=None)

    class Meta:
        model = Employee
        fields = '__all__'
        read_only_fields = ['id', 'athens_tenant_id', 'created_at', 'updated_at']

    def to_internal_value(self, data):
        # Convert empty strings to None for date fields before DRF validates them
        mutable = data.copy() if hasattr(data, 'copy') else dict(data)
        for field in ('date_of_birth', 'joining_date', 'confirmation_date', 'leaving_date'):
            if mutable.get(field) == '':
                mutable[field] = None
        return super().to_internal_value(mutable)

    def validate(self, attrs):
        # Provide defaults for required model fields if not supplied
        from datetime import date
        if not attrs.get('date_of_birth'):
            attrs['date_of_birth'] = date(2000, 1, 1)
        if not attrs.get('joining_date'):
            attrs['joining_date'] = date.today()
        return attrs

# MODULE 2: ATTENDANCE & WORK HOURS MANAGEMENT

class ShiftScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShiftSchedule
        fields = '__all__'
        read_only_fields = ['id', 'athens_tenant_id', 'created_at']

class HolidaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Holiday
        fields = '__all__'
        read_only_fields = ['id', 'athens_tenant_id', 'created_at']

class AttendanceSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)
    shift_name = serializers.CharField(source='shift.shift_name', read_only=True)
    
    class Meta:
        model = Attendance
        fields = '__all__'
        read_only_fields = ['id', 'athens_tenant_id', 'created_at']


class UserAttendanceSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    email    = serializers.CharField(source='user.email',    read_only=True)
    name     = serializers.CharField(source='user.name',     read_only=True)

    class Meta:
        model = UserAttendance
        fields = [
            'id', 'user', 'username', 'email', 'name',
            'date', 'check_in_time', 'check_out_time',
            'status', 'latitude', 'longitude',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']

# MODULE 3: PAYROLL & WAGE MANAGEMENT

class PayrollCycleSerializer(serializers.ModelSerializer):
    entry_count = serializers.SerializerMethodField()
    total_net    = serializers.SerializerMethodField()
    paid_count   = serializers.SerializerMethodField()

    class Meta:
        model = PayrollCycle
        fields = '__all__'
        read_only_fields = ['id', 'athens_tenant_id', 'processed_at', 'created_at']

    def get_entry_count(self, obj):
        return obj.payrollentry_set.count()

    def get_total_net(self, obj):
        from django.db.models import Sum
        result = obj.payrollentry_set.aggregate(t=Sum('net_salary'))['t']
        return float(result or 0)

    def get_paid_count(self, obj):
        return obj.payrollentry_set.filter(payment_status='paid').count()


class PayrollEntrySerializer(serializers.ModelSerializer):
    employee_name    = serializers.CharField(source='employee.full_name', read_only=True)
    employee_code    = serializers.CharField(source='employee.employee_code', read_only=True)
    department_name  = serializers.SerializerMethodField()
    designation_name = serializers.SerializerMethodField()
    cycle_name       = serializers.CharField(source='payroll_cycle.cycle_name', read_only=True)
    period_from      = serializers.DateField(source='payroll_cycle.period_from', read_only=True)
    period_to        = serializers.DateField(source='payroll_cycle.period_to', read_only=True)

    class Meta:
        model = PayrollEntry
        fields = '__all__'
        read_only_fields = ['id', 'athens_tenant_id', 'created_at']

    def get_department_name(self, obj):
        return obj.employee.department.name if obj.employee.department else ''

    def get_designation_name(self, obj):
        return obj.employee.designation.name if obj.employee.designation else ''

class PayrollSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = PayrollSettings
        fields = '__all__'
        read_only_fields = ['id', 'athens_tenant_id', 'created_at', 'updated_at']

class BonusRecordSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True)
    
    class Meta:
        model = BonusRecord
        fields = '__all__'
        read_only_fields = ['id', 'athens_tenant_id', 'created_at']

class FineSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)
    
    class Meta:
        model = Fine
        fields = '__all__'
        read_only_fields = ['id', 'athens_tenant_id', 'created_at']

class AdvanceSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)
    
    class Meta:
        model = Advance
        fields = '__all__'
        read_only_fields = ['id', 'athens_tenant_id', 'created_at']

# LEGACY SERIALIZERS

class EmployeeProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeProfile
        fields = '__all__'
        read_only_fields = ['id', 'athens_tenant_id', 'created_at', 'updated_at']

class LeaveTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveType
        fields = '__all__'
        read_only_fields = ['id', 'athens_tenant_id', 'created_at']

class LeaveBalanceSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveBalance
        fields = '__all__'
        read_only_fields = ['id', 'athens_tenant_id']

class LeaveRequestSerializer(serializers.ModelSerializer):
    employee_name     = serializers.SerializerMethodField()
    employee_role     = serializers.SerializerMethodField()
    leave_type_name   = serializers.CharField(source='leave_type.name', read_only=True)
    approved_by_name  = serializers.SerializerMethodField()
    approver_name     = serializers.SerializerMethodField()
    can_approve       = serializers.SerializerMethodField()

    class Meta:
        model = LeaveRequest
        fields = '__all__'
        read_only_fields = [
            'id', 'athens_tenant_id', 'employee', 'requester_role',
            'assigned_approver', 'approved_by', 'approved_at',
            'rejection_reason', 'created_at',
        ]

    def get_employee_name(self, obj):
        u = obj.employee
        return (getattr(u, 'name', None) or getattr(u, 'username', '') or getattr(u, 'email', '')) if u else ''

    def get_employee_role(self, obj):
        return obj.requester_role or 'user'

    def get_approved_by_name(self, obj):
        u = obj.approved_by
        return (getattr(u, 'name', None) or getattr(u, 'username', '')) if u else None

    def get_approver_name(self, obj):
        u = obj.assigned_approver
        return (getattr(u, 'name', None) or getattr(u, 'username', '')) if u else None

    def get_can_approve(self, obj):
        request = self.context.get('request')
        if not request:
            return False
        user = request.user
        if obj.employee_id == user.id:
            return False
        if obj.status != 'pending':
            return False
        if obj.assigned_approver_id and obj.assigned_approver_id != user.id:
            return False
        return True


class ContractorMasterSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContractorMaster
        fields = ['id', 'company_name', 'company_type', 'company_address', 'contact_person',
                  'contact_number', 'email', 'pan_number', 'gst_number', 'status']
        read_only_fields = ['id', 'athens_tenant_id']
