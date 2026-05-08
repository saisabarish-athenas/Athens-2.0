from django.core.management.base import BaseCommand
from mom.models import Mom


class Command(BaseCommand):
    help = 'Ensure all meeting creators are in the participants list'

    def handle(self, *args, **options):
        fixed = 0
        for mom in Mom.objects.select_related('scheduled_by').prefetch_related('participants'):
            if not mom.participants.filter(id=mom.scheduled_by_id).exists():
                mom.participants.add(mom.scheduled_by)
                fixed += 1
                self.stdout.write(f'Fixed meeting {mom.id}: added creator {mom.scheduled_by_id}')
        self.stdout.write(self.style.SUCCESS(f'Done. Fixed {fixed} meetings.'))
