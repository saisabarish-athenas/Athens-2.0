from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('tbt', '0005_toolboxtalk_training_type'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # Add enhanced status choices (via AlterField)
        migrations.AlterField(
            model_name='toolboxtalk',
            name='status',
            field=models.CharField(
                choices=[
                    ('draft', 'Draft'),
                    ('scheduled', 'Scheduled'),
                    ('live', 'Live'),
                    ('completed', 'Completed'),
                    ('ptw_generated', 'PTW Generated'),
                    ('cancelled', 'Cancelled'),
                ],
                default='draft',
                max_length=20,
                verbose_name='Status',
            ),
        ),
        # Discussion points stored as JSON
        migrations.AddField(
            model_name='toolboxtalk',
            name='discussion_points',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='List of discussion point objects with type and content',
                verbose_name='Discussion Points',
            ),
        ),
        # Work area / timing
        migrations.AddField(
            model_name='toolboxtalk',
            name='work_area',
            field=models.CharField(blank=True, max_length=255, verbose_name='Work Area'),
        ),
        migrations.AddField(
            model_name='toolboxtalk',
            name='start_time',
            field=models.TimeField(blank=True, null=True, verbose_name='Start Time'),
        ),
        migrations.AddField(
            model_name='toolboxtalk',
            name='end_time',
            field=models.TimeField(blank=True, null=True, verbose_name='End Time'),
        ),
        # Completion notes
        migrations.AddField(
            model_name='toolboxtalk',
            name='completion_notes',
            field=models.TextField(blank=True, verbose_name='Completion Notes'),
        ),
        migrations.AddField(
            model_name='toolboxtalk',
            name='completed_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Completed At'),
        ),
        migrations.AddField(
            model_name='toolboxtalk',
            name='completed_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='completed_tbts',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Completed By',
            ),
        ),
        # PTW link
        migrations.AddField(
            model_name='toolboxtalk',
            name='generated_ptw_id',
            field=models.IntegerField(blank=True, null=True, verbose_name='Generated PTW ID'),
        ),
        # User participants (M2M to User)
        migrations.AddField(
            model_name='toolboxtalk',
            name='user_participants',
            field=models.ManyToManyField(
                blank=True,
                related_name='tbt_participations',
                to=settings.AUTH_USER_MODEL,
                verbose_name='User Participants',
            ),
        ),
        # ToolboxTalkAttendance: add user_participant FK (nullable, for user-type attendance)
        migrations.AddField(
            model_name='toolboxtalkattendance',
            name='user_participant',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='tbt_attendance_records',
                to=settings.AUTH_USER_MODEL,
                verbose_name='User Participant',
            ),
        ),
        migrations.AlterField(
            model_name='toolboxtalkattendance',
            name='worker',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='toolbox_talk_attendance',
                to='worker.worker',
                verbose_name='Worker',
            ),
        ),
        migrations.AlterUniqueTogether(
            name='toolboxtalkattendance',
            unique_together=set(),
        ),
    ]
