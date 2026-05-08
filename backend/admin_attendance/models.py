from django.db import models
from django.utils import timezone
from authentication.models import User


class AdminAttendance(models.Model):
    STATUS_PRESENT = 'present'
    STATUS_ABSENT = 'absent'
    STATUS_LATE = 'late'
    STATUS_HALF_DAY = 'half_day'
    STATUS_WORKING = 'working'
    STATUS_CHECKED_OUT = 'checked_out'

    STATUS_CHOICES = [
        (STATUS_PRESENT, 'Present'),
        (STATUS_ABSENT, 'Absent'),
        (STATUS_LATE, 'Late'),
        (STATUS_HALF_DAY, 'Half Day'),
        (STATUS_WORKING, 'Working'),
        (STATUS_CHECKED_OUT, 'Checked Out'),
    ]

    # Tenant scoping
    athens_tenant_id = models.IntegerField(db_index=True)

    # Admin user reference
    admin = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='admin_attendances'
    )
    admin_role = models.CharField(max_length=30, blank=True)   # client/epc/contractor
    organization = models.CharField(max_length=255, blank=True)
    project_name = models.CharField(max_length=255, blank=True)

    # Date & times
    attendance_date = models.DateField(db_index=True)
    check_in_time = models.DateTimeField(null=True, blank=True)
    check_out_time = models.DateTimeField(null=True, blank=True)
    total_hours = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    # Status
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ABSENT)

    # GPS
    check_in_lat = models.FloatField(null=True, blank=True)
    check_in_lng = models.FloatField(null=True, blank=True)
    check_out_lat = models.FloatField(null=True, blank=True)
    check_out_lng = models.FloatField(null=True, blank=True)

    # Correction / manual override
    is_manual = models.BooleanField(default=False)
    correction_note = models.TextField(blank=True)
    corrected_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='attendance_corrections'
    )
    corrected_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'admin_attendance'
        unique_together = ['admin', 'attendance_date']
        indexes = [
            models.Index(fields=['athens_tenant_id', 'attendance_date']),
            models.Index(fields=['admin', 'attendance_date']),
            models.Index(fields=['status']),
        ]
        ordering = ['-attendance_date', 'admin__email']

    def compute_status(self, late_cutoff_hour: int = 9, half_day_hours: float = 4.0):
        """Recompute status from check-in/out times."""
        if not self.check_in_time:
            self.status = self.STATUS_ABSENT
            return

        check_in_local = timezone.localtime(self.check_in_time)
        is_late = check_in_local.hour >= late_cutoff_hour

        if not self.check_out_time:
            self.status = self.STATUS_LATE if is_late else self.STATUS_WORKING
            return

        hours = (self.check_out_time - self.check_in_time).total_seconds() / 3600
        self.total_hours = round(hours, 2)

        if hours < half_day_hours:
            self.status = self.STATUS_HALF_DAY
        elif is_late:
            self.status = self.STATUS_LATE
        else:
            self.status = self.STATUS_CHECKED_OUT

    def __str__(self):
        return f"{self.admin.email} | {self.attendance_date} | {self.status}"
