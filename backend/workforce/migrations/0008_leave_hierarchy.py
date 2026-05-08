from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('workforce', '0007_user_attendance_table'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='leaverequest',
            name='requester_role',
            field=models.CharField(
                max_length=30, blank=True, default='',
                help_text='Role of the requester at time of submission'
            ),
        ),
        migrations.AddField(
            model_name='leaverequest',
            name='assigned_approver',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='leave_approvals_assigned',
                to=settings.AUTH_USER_MODEL,
                help_text='The authority assigned to approve this request'
            ),
        ),
        migrations.AddField(
            model_name='leaverequest',
            name='rejection_reason',
            field=models.TextField(blank=True, default=''),
        ),
    ]
