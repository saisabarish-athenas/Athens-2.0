import secrets
import uuid
from datetime import timedelta
from django.db import models
from django.conf import settings
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from worker.models import Worker

def _generate_join_code() -> str:
    return f"{secrets.randbelow(10**6):06d}"

class ToolboxTalk(models.Model):
    STATUS_CHOICES = (
        ('draft', _('Draft')),
        ('scheduled', _('Scheduled')),
        ('live', _('Live')),
        ('completed', _('Completed')),
        ('ptw_generated', _('PTW Generated')),
        ('cancelled', _('Cancelled')),
    )

    TRAINING_TYPE_CHOICES = (
        ('inspection_training', _('Inspection Training')),
        ('job_training', _('Job Training')),
        ('induction_training', _('Induction Training')),
        ('safety_training', _('Safety Training')),
        ('toolbox_training', _('Toolbox Training')),
    )

    DURATION_UNIT_CHOICES = (
        ('minutes', _('Minutes')),
        ('hours', _('Hours')),
    )

    # Multi-tenant isolation field - MANDATORY
    athens_tenant_id = models.UUIDField(
        null=True, blank=True,
        help_text="Athens tenant identifier for multi-tenant isolation"
    )

    title = models.CharField(_('Title'), max_length=255)
    description = models.TextField(_('Description'), blank=True)
    date = models.DateField(_('Date'))
    duration = models.PositiveIntegerField(_('Duration'), default=30)
    duration_unit = models.CharField(_('Duration Unit'), max_length=10, choices=DURATION_UNIT_CHOICES, default='minutes')
    location = models.CharField(_('Location'), max_length=255)
    work_area = models.CharField(_('Work Area'), max_length=255, blank=True)
    start_time = models.TimeField(_('Start Time'), null=True, blank=True)
    end_time = models.TimeField(_('End Time'), null=True, blank=True)
    conducted_by = models.CharField(_('Conducted By'), max_length=255)
    training_type = models.CharField(
        _('Training Type'),
        max_length=50,
        choices=TRAINING_TYPE_CHOICES,
        default='toolbox_training',
        db_index=True,
    )
    status = models.CharField(_('Status'), max_length=20, choices=STATUS_CHOICES, default='draft')

    # Discussion points: list of {type, content} dicts
    # types: work_description, hazard, precautions, ppe, emergency, general
    discussion_points = models.JSONField(_('Discussion Points'), default=list, blank=True)

    # User participants (admins/supervisors/employees as User objects)
    user_participants = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name='tbt_participations',
        blank=True,
        verbose_name=_('User Participants')
    )

    # Completion tracking
    completion_notes = models.TextField(_('Completion Notes'), blank=True)
    completed_at = models.DateTimeField(_('Completed At'), null=True, blank=True)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='completed_tbts',
        verbose_name=_('Completed By')
    )

    # PTW link
    generated_ptw_id = models.IntegerField(_('Generated PTW ID'), null=True, blank=True)

    project = models.ForeignKey(
        'authentication.Project',
        on_delete=models.CASCADE,
        related_name='toolbox_talks',
        null=True, blank=True
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='created_toolbox_talks',
        verbose_name=_('Created By')
    )
    evidence_photo = models.ImageField(_('Evidence Photo'), upload_to='toolbox_talk_evidence/', blank=True, null=True)
    join_code = models.CharField(_('Join Code'), max_length=12, blank=True, null=True)
    qr_token = models.CharField(_('QR Token'), max_length=64, blank=True, null=True)
    qr_expires_at = models.DateTimeField(_('QR Expires At'), blank=True, null=True)
    created_at = models.DateTimeField(_('Created At'), auto_now_add=True)
    updated_at = models.DateTimeField(_('Updated At'), auto_now=True)

    class Meta:
        verbose_name = _('Toolbox Talk')
        verbose_name_plural = _('Toolbox Talks')
        ordering = ['-date']

    def save(self, *args, **kwargs):
        if not self.join_code:
            self.join_code = _generate_join_code()
        if not self.qr_token:
            self.qr_token = uuid.uuid4().hex
        if not self.qr_expires_at:
            self.qr_expires_at = timezone.now() + timedelta(days=7)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title

    @property
    def total_minutes(self):
        if self.duration_unit == 'hours':
            return self.duration * 60
        return self.duration


class ToolboxTalkAttendance(models.Model):
    STATUS_CHOICES = (
        ('present', _('Present')),
        ('absent', _('Absent')),
    )

    # Multi-tenant isolation field - MANDATORY
    athens_tenant_id = models.UUIDField(
        null=True, blank=True,
        help_text="Athens tenant identifier for multi-tenant isolation"
    )

    toolbox_talk = models.ForeignKey(
        ToolboxTalk,
        on_delete=models.CASCADE,
        related_name='attendance_records',
        verbose_name=_('Toolbox Talk')
    )
    # Worker participant (field worker)
    worker = models.ForeignKey(
        Worker,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='toolbox_talk_attendance',
        verbose_name=_('Worker')
    )
    # User participant (admin/supervisor/employee)
    user_participant = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='tbt_attendance_records',
        verbose_name=_('User Participant')
    )
    status = models.CharField(_('Status'), max_length=10, choices=STATUS_CHOICES, default='present')
    attendance_photo = models.ImageField(_('Attendance Photo'), upload_to='toolbox_talk_attendance/', blank=True, null=True)
    match_score = models.FloatField(_('Match Score'), default=0)
    timestamp = models.DateTimeField(_('Timestamp'), auto_now_add=True)

    class Meta:
        verbose_name = _('Toolbox Talk Attendance')
        verbose_name_plural = _('Toolbox Talk Attendance Records')

    def __str__(self):
        name = self.worker.name if self.worker else (str(self.user_participant) if self.user_participant else 'Unknown')
        return f"{name} - {self.toolbox_talk.title} - {self.status}"
