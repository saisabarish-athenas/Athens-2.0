from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('workforce', '0008_leave_hierarchy'),
    ]

    operations = [
        migrations.AddField(
            model_name='payrollentry',
            name='payment_status',
            field=models.CharField(
                max_length=20,
                choices=[('pending', 'Pending'), ('processed', 'Processed'), ('paid', 'Paid')],
                default='pending',
            ),
        ),
        migrations.AddField(
            model_name='payrollentry',
            name='paid_at',
            field=models.DateTimeField(null=True, blank=True),
        ),
    ]
