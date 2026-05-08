from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from django.utils import timezone
from datetime import timedelta
from system.utils import get_current_tenant
from system.api_response import ok, fail
from .models import *
from .serializers import *
from .permissions import ErgonServiceEnabled, IsErgonAdmin

class ProjectViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    permission_classes = [IsAuthenticated, ErgonServiceEnabled, IsErgonAdmin]
    

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return ok(data=serializer.data, request=request)
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return ok(data=serializer.data, request=request)
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return ok(data=None, request=request, status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        tenant, error = get_current_tenant(self.request.user)
        if error:
            return Project.objects.none()
        return Project.objects.filter(athens_tenant_id=tenant.id)
    
    def perform_create(self, serializer):
        tenant, _ = get_current_tenant(self.request.user)
        serializer.save(athens_tenant_id=tenant.id, created_by=self.request.user)

class DepartmentViewSet(viewsets.ModelViewSet):
    serializer_class = DepartmentSerializer
    permission_classes = [IsAuthenticated, ErgonServiceEnabled]
    

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return ok(data=serializer.data, request=request)
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return ok(data=serializer.data, request=request)
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return ok(data=None, request=request, status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        tenant, error = get_current_tenant(self.request.user)
        if error:
            return Department.objects.none()
        project_id = self.request.query_params.get('project_id')
        qs = Department.objects.filter(athens_tenant_id=tenant.id)
        if project_id:
            qs = qs.filter(project_id=project_id)
        return qs
    
    def perform_create(self, serializer):
        tenant, _ = get_current_tenant(self.request.user)
        serializer.save(athens_tenant_id=tenant.id)

class TaskCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = TaskCategorySerializer
    permission_classes = [IsAuthenticated, ErgonServiceEnabled]
    

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return ok(data=serializer.data, request=request)
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return ok(data=serializer.data, request=request)
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return ok(data=None, request=request, status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        tenant, error = get_current_tenant(self.request.user)
        if error:
            return TaskCategory.objects.none()
        department_id = self.request.query_params.get('department_id')
        qs = TaskCategory.objects.filter(athens_tenant_id=tenant.id)
        if department_id:
            qs = qs.filter(department_id=department_id)
        return qs
    
    def perform_create(self, serializer):
        tenant, _ = get_current_tenant(self.request.user)
        serializer.save(athens_tenant_id=tenant.id)

class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated, ErgonServiceEnabled]
    

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return ok(data=serializer.data, request=request)
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return ok(data=serializer.data, request=request)
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return ok(data=None, request=request, status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        tenant, error = get_current_tenant(self.request.user)
        if error:
            return Task.objects.none()
        qs = Task.objects.filter(athens_tenant_id=tenant.id).select_related(
            'assigned_by', 'assigned_to', 'project', 'department'
        )
        params = self.request.query_params
        search = params.get('search', '').strip()
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(title__icontains=search) |
                Q(description__icontains=search) |
                Q(assigned_to__email__icontains=search) |
                Q(assigned_to__name__icontains=search) |
                Q(project__name__icontains=search)
            )
        status_filter = params.get('status', '').strip()
        if status_filter and status_filter != 'all':
            if status_filter == 'overdue':
                from django.utils import timezone as tz
                qs = qs.filter(due_date__lt=tz.now().date()).exclude(status='completed')
            else:
                qs = qs.filter(status=status_filter)
        priority_filter = params.get('priority', '').strip()
        if priority_filter and priority_filter != 'all':
            qs = qs.filter(priority=priority_filter)
        project_filter = params.get('project_id', '').strip()
        if project_filter:
            qs = qs.filter(project_id=project_filter)
        return qs
    
    def perform_create(self, serializer):
        tenant, _ = get_current_tenant(self.request.user)
        with transaction.atomic():
            task = serializer.save(
                athens_tenant_id=tenant.id,
                assigned_by=self.request.user
            )
            TaskHistory.objects.create(
                task=task,
                user=self.request.user,
                action='created',
                new_value=f'Task created: {task.title}'
            )
            if task.planned_date and task.assigned_to:
                DailyTask.objects.create(
                    athens_tenant_id=tenant.id,
                    task=task,
                    user=task.assigned_to,
                    title=task.title,
                    description=task.description,
                    scheduled_date=task.planned_date,
                    priority=task.priority,
                    status='not_started'
                )
    
    def perform_update(self, serializer):
        with transaction.atomic():
            task = serializer.save()
            TaskHistory.objects.create(
                task=task,
                user=self.request.user,
                action='updated',
                new_value=f'Task updated: {task.title}'
            )
    
    @action(detail=True, methods=['post'])
    def update_progress(self, request, pk=None):
        task = self.get_object()
        progress = request.data.get('progress')
        description = request.data.get('description', '')
        
        if progress is None or not (0 <= int(progress) <= 100):
            return fail('INVALID_PROGRESS', 'Invalid progress value', status=status.HTTP_400_BAD_REQUEST, request=request)
        
        with transaction.atomic():
            # Update task
            task.progress = progress
            if progress == 100:
                task.status = 'completed'
            elif progress > 0:
                task.status = 'in_progress'
            task.save()
            
            # Create progress history
            TaskProgressHistory.objects.create(
                task=task,
                user=request.user,
                progress=progress,
                description=description
            )
            
            # Sync with daily planner
            DailyTask.objects.filter(task=task).update(
                progress=progress,
                status=task.status
            )
        
        return ok(data=TaskSerializer(task).data, request=request)
    
    @action(detail=True, methods=['get'])
    def progress_history(self, request, pk=None):
        task = self.get_object()
        history = task.progress_history.all()
        return ok(data=TaskProgressHistorySerializer(history, many=True).data, request=request)
    
    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        task = self.get_object()
        history = task.history.all()
        return ok(data=TaskHistorySerializer(history, many=True).data, request=request)

class ContactViewSet(viewsets.ModelViewSet):
    serializer_class = ContactSerializer
    permission_classes = [IsAuthenticated, ErgonServiceEnabled]
    

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return ok(data=serializer.data, request=request)
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return ok(data=serializer.data, request=request)
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return ok(data=None, request=request, status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        tenant, error = get_current_tenant(self.request.user)
        if error:
            return Contact.objects.none()
        return Contact.objects.filter(athens_tenant_id=tenant.id)
    
    def perform_create(self, serializer):
        tenant, _ = get_current_tenant(self.request.user)
        serializer.save(athens_tenant_id=tenant.id)

class FollowupViewSet(viewsets.ModelViewSet):
    serializer_class = FollowupSerializer
    permission_classes = [IsAuthenticated, ErgonServiceEnabled]
    

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return ok(data=serializer.data, request=request)
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return ok(data=serializer.data, request=request)
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return ok(data=None, request=request, status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        tenant, error = get_current_tenant(self.request.user)
        if error:
            return Followup.objects.none()
        return Followup.objects.filter(athens_tenant_id=tenant.id)
    
    def perform_create(self, serializer):
        tenant, _ = get_current_tenant(self.request.user)
        serializer.save(athens_tenant_id=tenant.id, created_by=self.request.user)
    
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        followup = self.get_object()
        with transaction.atomic():
            followup.status = 'completed'
            followup.completed_at = timezone.now()
            followup.save()
            FollowupHistory.objects.create(
                followup=followup,
                action='completed',
                notes='Follow-up marked as completed',
                created_by=request.user
            )
        return ok(data=FollowupSerializer(followup).data, request=request)
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        followup = self.get_object()
        reason = request.data.get('reason', '')
        with transaction.atomic():
            followup.status = 'cancelled'
            followup.save()
            FollowupHistory.objects.create(
                followup=followup,
                action='cancelled',
                notes=f'Cancelled: {reason}',
                created_by=request.user
            )
        return ok(data=FollowupSerializer(followup).data, request=request)
    
    @action(detail=True, methods=['post'])
    def reschedule(self, request, pk=None):
        followup = self.get_object()
        new_date = request.data.get('new_date')
        if not new_date:
            return fail('MISSING_FIELD', 'new_date required', status=status.HTTP_400_BAD_REQUEST, request=request)
        
        with transaction.atomic():
            old_date = followup.followup_date
            followup.followup_date = new_date
            followup.status = 'rescheduled'
            followup.save()
            FollowupHistory.objects.create(
                followup=followup,
                action='rescheduled',
                old_value=str(old_date),
                new_value=str(new_date),
                notes=f'Rescheduled from {old_date} to {new_date}',
                created_by=request.user
            )
        return ok(data=FollowupSerializer(followup).data, request=request)
    
    @action(detail=False, methods=['get'])
    def reminders(self, request):
        tenant, error = get_current_tenant(request.user)
        if error:
            return fail('TENANT_ERROR', error, status=status.HTTP_400_BAD_REQUEST, request=request)
        
        today = timezone.now().date()
        upcoming = Followup.objects.filter(
            athens_tenant_id=tenant.id,
            status='open',
            followup_date__gte=today,
            followup_date__lte=today + timedelta(days=7)
        ).order_by('followup_date')
        
        return ok(data=FollowupSerializer(upcoming, many=True).data, request=request)
    
    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        followup = self.get_object()
        history = followup.history.all()
        return ok(data=FollowupHistorySerializer(history, many=True).data, request=request)

class ManpowerViewSet(viewsets.ModelViewSet):
    serializer_class = ManpowerSerializer
    permission_classes = [IsAuthenticated, ErgonServiceEnabled, IsErgonAdmin]
    

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return ok(data=serializer.data, request=request)
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return ok(data=serializer.data, request=request)
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return ok(data=None, request=request, status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        tenant, error = get_current_tenant(self.request.user)
        if error:
            return Manpower.objects.none()
        return Manpower.objects.filter(athens_tenant_id=tenant.id)
    
    def perform_create(self, serializer):
        tenant, _ = get_current_tenant(self.request.user)
        serializer.save(athens_tenant_id=tenant.id)

class MachineryViewSet(viewsets.ModelViewSet):
    serializer_class = MachinerySerializer
    permission_classes = [IsAuthenticated, ErgonServiceEnabled, IsErgonAdmin]
    

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return ok(data=serializer.data, request=request)
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return ok(data=serializer.data, request=request)
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return ok(data=None, request=request, status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        tenant, error = get_current_tenant(self.request.user)
        if error:
            return Machinery.objects.none()
        return Machinery.objects.filter(athens_tenant_id=tenant.id)
    
    def perform_create(self, serializer):
        tenant, _ = get_current_tenant(self.request.user)
        serializer.save(athens_tenant_id=tenant.id)

class AdvanceViewSet(viewsets.ModelViewSet):
    serializer_class = AdvanceSerializer
    permission_classes = [IsAuthenticated, ErgonServiceEnabled]
    

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return ok(data=serializer.data, request=request)
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return ok(data=serializer.data, request=request)
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return ok(data=None, request=request, status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        tenant, error = get_current_tenant(self.request.user)
        if error:
            return Advance.objects.none()
        return Advance.objects.filter(athens_tenant_id=tenant.id)
    
    def perform_create(self, serializer):
        tenant, _ = get_current_tenant(self.request.user)
        serializer.save(athens_tenant_id=tenant.id)

class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated, ErgonServiceEnabled]
    

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return ok(data=serializer.data, request=request)
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return ok(data=serializer.data, request=request)
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return ok(data=None, request=request, status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        tenant, error = get_current_tenant(self.request.user)
        if error:
            return Expense.objects.none()
        return Expense.objects.filter(athens_tenant_id=tenant.id)
    
    def perform_create(self, serializer):
        tenant, _ = get_current_tenant(self.request.user)
        serializer.save(athens_tenant_id=tenant.id)

class LedgerEntryViewSet(viewsets.ModelViewSet):
    serializer_class = LedgerEntrySerializer
    permission_classes = [IsAuthenticated, ErgonServiceEnabled, IsErgonAdmin]
    

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return ok(data=serializer.data, request=request)
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return ok(data=serializer.data, request=request)
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return ok(data=None, request=request, status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        tenant, error = get_current_tenant(self.request.user)
        if error:
            return LedgerEntry.objects.none()
        return LedgerEntry.objects.filter(athens_tenant_id=tenant.id)
    
    def perform_create(self, serializer):
        tenant, _ = get_current_tenant(self.request.user)
        serializer.save(athens_tenant_id=tenant.id, created_by=self.request.user)

class CustomerViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated, ErgonServiceEnabled, IsErgonAdmin]
    

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return ok(data=serializer.data, request=request)
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return ok(data=serializer.data, request=request)
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return ok(data=None, request=request, status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        tenant, error = get_current_tenant(self.request.user)
        if error:
            return Customer.objects.none()
        return Customer.objects.filter(athens_tenant_id=tenant.id)
    
    def perform_create(self, serializer):
        tenant, _ = get_current_tenant(self.request.user)
        serializer.save(athens_tenant_id=tenant.id)

class InvoiceViewSet(viewsets.ModelViewSet):
    serializer_class = InvoiceSerializer
    permission_classes = [IsAuthenticated, ErgonServiceEnabled, IsErgonAdmin]
    

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return ok(data=serializer.data, request=request)
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return ok(data=serializer.data, request=request)
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return ok(data=None, request=request, status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        tenant, error = get_current_tenant(self.request.user)
        if error:
            return Invoice.objects.none()
        return Invoice.objects.filter(athens_tenant_id=tenant.id)
    
    def perform_create(self, serializer):
        tenant, _ = get_current_tenant(self.request.user)
        serializer.save(athens_tenant_id=tenant.id)

class DailyPlannerViewSet(viewsets.ModelViewSet):
    serializer_class = DailyTaskSerializer
    permission_classes = [IsAuthenticated]
    

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return ok(data=serializer.data, request=request)
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return ok(data=serializer.data, request=request)
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok(data=serializer.data, request=request, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ok(data=serializer.data, request=request)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return ok(data=None, request=request, status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        tenant, error = get_current_tenant(self.request.user)
        if error:
            return DailyTask.objects.none()
        
        date = self.request.query_params.get('date')
        if not date:
            date = timezone.now().date()
        
        return DailyTask.objects.filter(
            athens_tenant_id=tenant.id,
            user=self.request.user,
            scheduled_date=date
        ).select_related('task', 'user')
    
    def perform_create(self, serializer):
        tenant, _ = get_current_tenant(self.request.user)
        serializer.save(athens_tenant_id=tenant.id, user=self.request.user)
    
    @action(detail=True, methods=['post'])
    def start_task(self, request, pk=None):
        daily_task = self.get_object()
        if daily_task.status != 'not_started':
            return fail('INVALID_STATUS', 'Task already started', status=status.HTTP_400_BAD_REQUEST, request=request)
        
        now = timezone.now()
        sla_hours = float(daily_task.task.sla_hours) if daily_task.task else 0.25
        
        with transaction.atomic():
            daily_task.status = 'in_progress'
            daily_task.start_time = now
            daily_task.sla_end_time = now + timedelta(hours=sla_hours)
            daily_task.save()
            
            DailyTaskHistory.objects.create(
                daily_task=daily_task,
                action='started',
                new_value=f'Started at {now}',
                created_by=request.user
            )
            
            SLAHistory.objects.create(
                daily_task=daily_task,
                action='started',
                timestamp=now,
                notes=f'SLA: {sla_hours} hours'
            )
        
        return ok(data=DailyTaskSerializer(daily_task).data, request=request)
    
    @action(detail=True, methods=['post'])
    def pause_task(self, request, pk=None):
        daily_task = self.get_object()
        if daily_task.status != 'in_progress':
            return fail('INVALID_STATUS', 'Task not in progress', status=status.HTTP_400_BAD_REQUEST, request=request)
        
        now = timezone.now()
        active_time = (now - daily_task.start_time).total_seconds() if daily_task.start_time else 0
        
        with transaction.atomic():
            daily_task.status = 'on_break'
            daily_task.pause_start_time = now
            daily_task.active_seconds += int(active_time)
            daily_task.save()
            
            DailyTaskHistory.objects.create(
                daily_task=daily_task,
                action='paused',
                new_value=f'Paused at {now}',
                created_by=request.user
            )
            
            SLAHistory.objects.create(
                daily_task=daily_task,
                action='paused',
                timestamp=now,
                duration_seconds=int(active_time)
            )
        
        return ok(data=DailyTaskSerializer(daily_task).data, request=request)
    
    @action(detail=True, methods=['post'])
    def resume_task(self, request, pk=None):
        daily_task = self.get_object()
        if daily_task.status != 'on_break':
            return fail('INVALID_STATUS', 'Task not paused', status=status.HTTP_400_BAD_REQUEST, request=request)
        
        now = timezone.now()
        pause_time = (now - daily_task.pause_start_time).total_seconds() if daily_task.pause_start_time else 0
        
        with transaction.atomic():
            daily_task.status = 'in_progress'
            daily_task.pause_duration += int(pause_time)
            daily_task.start_time = now
            daily_task.sla_end_time = now + timedelta(seconds=(daily_task.sla_end_time - daily_task.pause_start_time).total_seconds())
            daily_task.pause_start_time = None
            daily_task.save()
            
            DailyTaskHistory.objects.create(
                daily_task=daily_task,
                action='resumed',
                new_value=f'Resumed at {now}',
                created_by=request.user
            )
            
            SLAHistory.objects.create(
                daily_task=daily_task,
                action='resumed',
                timestamp=now,
                duration_seconds=int(pause_time),
                notes='Break duration'
            )
        
        return ok(data=DailyTaskSerializer(daily_task).data, request=request)
    
    @action(detail=True, methods=['post'])
    def complete_task(self, request, pk=None):
        daily_task = self.get_object()
        progress = request.data.get('progress', 100)
        
        now = timezone.now()
        if daily_task.status == 'in_progress' and daily_task.start_time:
            active_time = (now - daily_task.start_time).total_seconds()
            daily_task.active_seconds += int(active_time)
        
        with transaction.atomic():
            daily_task.status = 'completed'
            daily_task.progress = progress
            daily_task.completion_time = now
            daily_task.save()
            
            # Sync with main task
            if daily_task.task:
                daily_task.task.progress = progress
                if progress == 100:
                    daily_task.task.status = 'completed'
                daily_task.task.save()
            
            DailyTaskHistory.objects.create(
                daily_task=daily_task,
                action='completed',
                new_value=f'Completed at {now} with {progress}% progress',
                created_by=request.user
            )
        
        return ok(data=DailyTaskSerializer(daily_task).data, request=request)
    
    @action(detail=True, methods=['post'])
    def postpone_task(self, request, pk=None):
        daily_task = self.get_object()
        new_date = request.data.get('new_date')
        reason = request.data.get('reason', '')
        
        if not new_date:
            return fail('MISSING_FIELD', 'new_date required', status=status.HTTP_400_BAD_REQUEST, request=request)
        
        tenant, _ = get_current_tenant(request.user)
        
        with transaction.atomic():
            daily_task.status = 'postponed'
            daily_task.postponed_to_date = new_date
            daily_task.save()
            
            # Create new entry for target date
            DailyTask.objects.create(
                athens_tenant_id=tenant.id,
                task=daily_task.task,
                original_task=daily_task.original_task or daily_task.task,
                user=daily_task.user,
                title=daily_task.title,
                description=daily_task.description,
                scheduled_date=new_date,
                priority=daily_task.priority,
                postponed_from_date=daily_task.scheduled_date
            )
            
            DailyTaskHistory.objects.create(
                daily_task=daily_task,
                action='postponed',
                old_value=str(daily_task.scheduled_date),
                new_value=str(new_date),
                notes=reason,
                created_by=request.user
            )
        
        return ok(data=DailyTaskSerializer(daily_task).data, request=request)
    
    @action(detail=False, methods=['post'])
    def rollover(self, request):
        tenant, error = get_current_tenant(request.user)
        if error:
            return fail('TENANT_ERROR', error, status=status.HTTP_400_BAD_REQUEST, request=request)
        
        yesterday = timezone.now().date() - timedelta(days=1)
        today = timezone.now().date()
        
        incomplete_tasks = DailyTask.objects.filter(
            athens_tenant_id=tenant.id,
            user=request.user,
            scheduled_date=yesterday,
            status__in=['not_started', 'in_progress', 'on_break']
        )
        
        rolled_count = 0
        with transaction.atomic():
            for task in incomplete_tasks:
                # Check if already rolled over
                if not DailyTask.objects.filter(
                    task=task.task,
                    scheduled_date=today,
                    rollover_source_date=yesterday
                ).exists():
                    DailyTask.objects.create(
                        athens_tenant_id=tenant.id,
                        task=task.task,
                        original_task=task.original_task or task.task,
                        user=task.user,
                        title=task.title,
                        description=task.description,
                        scheduled_date=today,
                        priority=task.priority,
                        rollover_source_date=yesterday,
                        rollover_timestamp=timezone.now()
                    )
                    
                    task.status = 'rolled_over'
                    task.save()
                    rolled_count += 1
        
        return ok(data={'rolled_over': rolled_count}, request=request)
    
    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        daily_task = self.get_object()
        history = daily_task.history.all()
        return ok(data=DailyTaskHistorySerializer(history, many=True).data, request=request)
    
    @action(detail=True, methods=['get'])
    def sla_history(self, request, pk=None):
        daily_task = self.get_object()
        sla_history = daily_task.sla_history.all()
        return ok(data=SLAHistorySerializer(sla_history, many=True).data, request=request)
