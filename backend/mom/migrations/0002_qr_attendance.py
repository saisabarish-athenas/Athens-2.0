from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        ('mom', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='MeetingQRToken',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('token', models.CharField(db_index=True, max_length=64, unique=True)),
                ('expires_at', models.DateTimeField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('mom', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='qr_token', to='mom.mom')),
            ],
        ),
        migrations.CreateModel(
            name='MeetingAttendanceLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('marked_via', models.CharField(
                    choices=[('qr', 'QR Scan'), ('code', 'Employee Code'), ('host', 'Host')],
                    default='host', max_length=10
                )),
                ('attendance_time', models.DateTimeField(auto_now_add=True)),
                ('latitude', models.FloatField(blank=True, null=True)),
                ('longitude', models.FloatField(blank=True, null=True)),
                ('device_info', models.CharField(blank=True, max_length=255, null=True)),
                ('mom', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='attendance_logs', to='mom.mom')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='mom_attendance_logs', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'unique_together': {('mom', 'user')},
            },
        ),
    ]
