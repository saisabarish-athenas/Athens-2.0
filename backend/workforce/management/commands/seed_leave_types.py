from django.core.management.base import BaseCommand
from workforce.models import LeaveType
from system.utils import get_current_tenant


class Command(BaseCommand):
    help = 'Seed default leave types for all tenants'

    def handle(self, *args, **options):
        default_types = [
            {'name': 'Sick Leave', 'days_allowed': 12},
            {'name': 'Casual Leave', 'days_allowed': 12},
            {'name': 'Annual Leave', 'days_allowed': 21},
            {'name': 'Maternity Leave', 'days_allowed': 180},
            {'name': 'Paternity Leave', 'days_allowed': 15},
            {'name': 'Compensatory Off', 'days_allowed': 10},
        ]

        # Get all unique tenant IDs from existing data
        from authentication.models import User
        tenant_ids = User.objects.values_list('company_id', flat=True).distinct()
        tenant_ids = [tid for tid in tenant_ids if tid]

        if not tenant_ids:
            self.stdout.write(self.style.WARNING('No tenants found. Creating for tenant_id=1'))
            tenant_ids = [1]

        created_count = 0
        for tenant_id in tenant_ids:
            for leave_type_data in default_types:
                obj, created = LeaveType.objects.get_or_create(
                    athens_tenant_id=tenant_id,
                    name=leave_type_data['name'],
                    defaults={'days_allowed': leave_type_data['days_allowed']}
                )
                if created:
                    created_count += 1
                    self.stdout.write(
                        self.style.SUCCESS(
                            f'Created {leave_type_data["name"]} for tenant {tenant_id}'
                        )
                    )

        self.stdout.write(
            self.style.SUCCESS(
                f'Successfully seeded {created_count} leave types across {len(tenant_ids)} tenants'
            )
        )
