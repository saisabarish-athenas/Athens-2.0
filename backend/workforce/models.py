from django.db import models
from django.core.validators import MinValueValidator
from authentication.models import User
from decimal import Decimal

# MODULE 1: EMPLOYEE & WORKFORCE MANAGEMENT

class Department(models.Model):
    athens_tenant_id = models.IntegerField(db_index=True)
    name = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        db_table = 'workforce_department'
        unique_together = ['athens_tenant_id', 'name']

class Designation(models.Model):
    athens_tenant_id = models.IntegerField(db_index=True)
    name = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        db_table = 'workforce_designation'
        unique_together = ['athens_tenant_id', 'name']

class Employee(models.Model):
    GENDER_CHOICES = [('M', 'Male'), ('F', 'Female'), ('O', 'Other')]
    EMPLOYMENT_TYPE_CHOICES = [('permanent', 'Permanent'), ('contract', 'Contract'), ('temporary', 'Temporary')]
    WAGE_TYPE_CHOICES = [('daily', 'Daily'), ('monthly', 'Monthly')]
    STATUS_CHOICES = [('active', 'Active'), ('inactive', 'Inactive')]
    
    athens_tenant_id = models.IntegerField(db_index=True)
    employee_code = models.CharField(max_length=50)
    full_name = models.CharField(max_length=200)
    father_or_husband_name = models.CharField(max_length=200, blank=True)
    gender = models.CharField(max_length=1, choices=GENDER_CHOICES)
    date_of_birth = models.DateField()
    permanent_address = models.TextField()
    contact_number = models.CharField(max_length=20)
    
    department = models.ForeignKey(Department, on_delete=models.PROTECT, null=True)
    designation = models.ForeignKey(Designation, on_delete=models.PROTECT, null=True)
    employment_type = models.CharField(max_length=20, choices=EMPLOYMENT_TYPE_CHOICES)
    skill_category = models.CharField(max_length=100, blank=True)
    joining_date = models.DateField()
    confirmation_date = models.DateField(null=True, blank=True)
    leaving_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    
    uan_number = models.CharField(max_length=50, blank=True)
    esi_number = models.CharField(max_length=50, blank=True)
    pf_applicable = models.BooleanField(default=False)
    esi_applicable = models.BooleanField(default=False)
    lwf_applicable = models.BooleanField(default=False)
    
    wage_type = models.CharField(max_length=20, choices=WAGE_TYPE_CHOICES)
    basic_structure = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    da_structure = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    hra_structure = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    other_allowances_structure = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    overtime_rate = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    @property
    def age(self):
        from datetime import date
        today = date.today()
        return today.year - self.date_of_birth.year - ((today.month, today.day) < (self.date_of_birth.month, self.date_of_birth.day))
    
    class Meta:
        db_table = 'workforce_employee'
        unique_together = ['athens_tenant_id', 'employee_code']
        indexes = [models.Index(fields=['athens_tenant_id', 'status'])]

# MODULE 2: ATTENDANCE & WORK HOURS MANAGEMENT

class ShiftSchedule(models.Model):
    athens_tenant_id = models.IntegerField(db_index=True)
    shift_name = models.CharField(max_length=100)
    start_time = models.TimeField()
    end_time = models.TimeField()
    weekly_off_day = models.IntegerField(validators=[MinValueValidator(0)], help_text='0=Monday, 6=Sunday')
    max_hours_per_day = models.DecimalField(max_digits=4, decimal_places=2, default=9)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        db_table = 'workforce_shift_schedule'
        unique_together = ['athens_tenant_id', 'shift_name']

class Holiday(models.Model):
    HOLIDAY_TYPE_CHOICES = [('national', 'National'), ('festival', 'Festival'), ('restricted', 'Restricted')]
    athens_tenant_id = models.IntegerField(db_index=True)
    holiday_date = models.DateField()
    holiday_type = models.CharField(max_length=20, choices=HOLIDAY_TYPE_CHOICES)
    notification_reference = models.CharField(max_length=200, blank=True)
    description = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        db_table = 'workforce_holiday'
        unique_together = ['athens_tenant_id', 'holiday_date']

class Attendance(models.Model):
    STATUS_CHOICES = [('P', 'Present'), ('A', 'Absent'), ('L', 'Leave'), ('H', 'Holiday'), ('WO', 'Weekly Off')]
    athens_tenant_id = models.IntegerField(db_index=True)
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE)
    admin_user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='managed_attendance_records')
    project_id = models.IntegerField(null=True, blank=True, db_index=True)
    organization_id = models.IntegerField(null=True, blank=True, db_index=True)
    date = models.DateField()
    shift = models.ForeignKey(ShiftSchedule, on_delete=models.SET_NULL, null=True, blank=True)
    in_time = models.TimeField(null=True, blank=True)
    out_time = models.TimeField(null=True, blank=True)
    total_hours = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    overtime_hours = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    status = models.CharField(max_length=2, choices=STATUS_CHOICES, default='P')
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        db_table = 'workforce_attendance'
        unique_together = ['employee', 'date']
        indexes = [models.Index(fields=['athens_tenant_id', 'date'])]


class UserAttendance(models.Model):
    """
    Self-service attendance for Users (role_type='user' or any companyuser).
    Linked directly to User — no Employee record required.
    Single source of truth for user-side check-in/check-out.
    """
    STATUS_CHOICES = [
        ('present',  'Present'),
        ('late',     'Late'),
        ('half_day', 'Half Day'),
        ('absent',   'Absent'),
    ]
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='user_attendances')
    date = models.DateField(db_index=True)
    check_in_time  = models.TimeField(null=True, blank=True)
    check_out_time = models.TimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='present')
    latitude  = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'workforce_user_attendance'
        unique_together = ['user', 'date']
        indexes = [models.Index(fields=['user', 'date'])]

    def __str__(self):
        return f"{self.user_id} {self.date} {self.status}"

# MODULE 3: PAYROLL & WAGE MANAGEMENT

class PayrollCycle(models.Model):
    STATUS_CHOICES = [('draft', 'Draft'), ('processed', 'Processed'), ('locked', 'Locked')]
    athens_tenant_id = models.IntegerField(db_index=True)
    cycle_name = models.CharField(max_length=100)
    period_from = models.DateField()
    period_to = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    processed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        db_table = 'workforce_payroll_cycle'
        unique_together = ['athens_tenant_id', 'cycle_name']

class PayrollEntry(models.Model):
    PAYMENT_MODE_CHOICES = [('cash', 'Cash'), ('bank', 'Bank Transfer'), ('cheque', 'Cheque')]
    PAYMENT_STATUS_CHOICES = [('pending', 'Pending'), ('processed', 'Processed'), ('paid', 'Paid')]
    athens_tenant_id = models.IntegerField(db_index=True)
    payroll_cycle = models.ForeignKey(PayrollCycle, on_delete=models.CASCADE)
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE)
    total_days_worked = models.IntegerField(default=0)
    paid_leave_days = models.IntegerField(default=0)
    unpaid_leave_days = models.IntegerField(default=0)
    overtime_hours = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    
    basic_earned = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    da_earned = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    hra_earned = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    other_allowances = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    overtime_wages = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    gross_salary = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
    pf_employee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    esi_employee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    professional_tax = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    fines = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    advances = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    other_deductions = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_deductions = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
    net_salary = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default='pending')
    payment_date = models.DateField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    payment_mode = models.CharField(max_length=20, choices=PAYMENT_MODE_CHOICES, blank=True)
    transaction_reference = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        db_table = 'workforce_payroll_entry'
        unique_together = ['payroll_cycle', 'employee']

class PayrollSettings(models.Model):
    athens_tenant_id = models.IntegerField(db_index=True, unique=True)
    pf_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('12.00'))
    esi_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0.75'))
    bonus_min_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('8.33'))
    bonus_max_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('20.00'))
    ot_multiplier = models.DecimalField(max_digits=4, decimal_places=2, default=Decimal('2.00'))
    min_wage_category = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        db_table = 'workforce_payroll_settings'

class BonusRecord(models.Model):
    athens_tenant_id = models.IntegerField(db_index=True)
    accounting_year = models.CharField(max_length=20)
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE)
    total_salary_for_year = models.DecimalField(max_digits=12, decimal_places=2)
    bonus_percentage = models.DecimalField(max_digits=5, decimal_places=2)
    bonus_amount = models.DecimalField(max_digits=10, decimal_places=2)
    payment_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        db_table = 'workforce_bonus_record'
        unique_together = ['athens_tenant_id', 'accounting_year', 'employee']

class Fine(models.Model):
    athens_tenant_id = models.IntegerField(db_index=True)
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE)
    fine_date = models.DateField()
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    reason = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        db_table = 'workforce_fine'

class Advance(models.Model):
    STATUS_CHOICES = [('pending', 'Pending'), ('approved', 'Approved'), ('recovered', 'Recovered')]
    athens_tenant_id = models.IntegerField(db_index=True)
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE)
    advance_date = models.DateField()
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        db_table = 'workforce_advance'

# LEGACY MODELS (Keep for backward compatibility)

class EmployeeProfile(models.Model):
    athens_tenant_id = models.IntegerField(db_index=True)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='employee_profile')
    employee_id = models.CharField(max_length=50, unique=True)
    department = models.CharField(max_length=100, blank=True)
    designation = models.CharField(max_length=100, blank=True)
    date_of_joining = models.DateField(null=True, blank=True)
    phone = models.CharField(max_length=50, blank=True)
    address = models.TextField(blank=True)
    emergency_contact = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        db_table = 'workforce_employee_profile'

class LeaveType(models.Model):
    athens_tenant_id = models.IntegerField(db_index=True)
    name = models.CharField(max_length=100)
    days_allowed = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        db_table = 'workforce_leave_type'

class LeaveBalance(models.Model):
    athens_tenant_id = models.IntegerField(db_index=True)
    employee = models.ForeignKey(User, on_delete=models.CASCADE)
    leave_type = models.ForeignKey(LeaveType, on_delete=models.CASCADE)
    total_days = models.IntegerField(default=0)
    used_days = models.IntegerField(default=0)
    year = models.IntegerField()
    class Meta:
        db_table = 'workforce_leave_balance'
        unique_together = ['employee', 'leave_type', 'year']

class LeaveRequest(models.Model):
    STATUS_PENDING  = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'
    STATUS_CANCELLED = 'cancelled'
    STATUS_CHOICES = [
        ('pending',   'Pending'),
        ('approved',  'Approved'),
        ('rejected',  'Rejected'),
        ('cancelled', 'Cancelled'),
    ]

    athens_tenant_id  = models.IntegerField(db_index=True)
    employee          = models.ForeignKey(User, on_delete=models.CASCADE, related_name='leave_requests')
    leave_type        = models.ForeignKey(LeaveType, on_delete=models.CASCADE)
    start_date        = models.DateField()
    end_date          = models.DateField()
    days_count        = models.IntegerField()
    reason            = models.TextField()
    status            = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')

    # Hierarchy fields
    requester_role    = models.CharField(max_length=30, blank=True, default='')
    assigned_approver = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='leave_approvals_assigned'
    )
    approved_by       = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='approved_leaves'
    )
    approved_at       = models.DateTimeField(null=True, blank=True)
    rejection_reason  = models.TextField(blank=True, default='')
    created_at        = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'workforce_leave_request'
        indexes = [models.Index(fields=['athens_tenant_id', 'status'])]

# CONTRACTOR COMPLIANCE MODELS (CLRA Automation)
from workforce.models_contractor import ContractorMaster, ContractorCompliance, ContractLabourDeployment
