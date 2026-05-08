from rest_framework import viewsets, permissions, status, filters
from rest_framework.decorators import action, api_view, permission_classes, throttle_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
from .filters import PermitFilter, PermitAuditFilter
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.shortcuts import get_object_or_404
from django.db.models import Count, Q, Avg, Sum, F, Case, When, Value
from django.db import models
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.conf import settings
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
from django.http import HttpResponse, JsonResponse
from django.core.files.base import ContentFile
from django.core.cache import cache
import json
import base64
import uuid
import time
from io import BytesIO
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter, A4
from authentication.tenant_scoped import TenantScopedViewSet, TenantScopedReadOnlyViewSet
from authentication.rbac_permissions import RequireTenantPermission
from system.audit_utils import audit_log, AuditLogMixin
from .throttles import PTWSyncThrottle, PTWBulkExportThrottle, PTWKpiThrottle
from .observability import log_ptw_event, time_endpoint
try:
    import openpyxl
except ImportError:
    openpyxl = None
try:
    from openpyxl.styles import Font, Alignment, PatternFill
except ImportError:
    Font = Alignment = PatternFill = None

from .models import (
    Permit, PermitType, PermitApproval, PermitWorker, PermitExtension, 
    PermitAudit, WorkflowTemplate, WorkflowInstance, WorkflowStep,
    HazardLibrary, PermitHazard, GasReading, PermitPhoto, DigitalSignature,
    EscalationRule, NotificationTemplate, SystemIntegration, ComplianceReport,
    IsolationPointLibrary, PermitIsolationPoint, PermitTypeTemplateOverride,
    PermitToolboxTalk, PermitToolboxTalkAttendance, PermitCloseout
)
try:
    from .qr_utils import generate_permit_qr_code, generate_permit_qr_data
except ImportError:
    generate_permit_qr_code = generate_permit_qr_data = None
from .serializers import (
    PermitSerializer, PermitListSerializer, PermitCreateUpdateSerializer,
    PermitStatusUpdateSerializer, PermitTypeSerializer, PermitApprovalSerializer,
    PermitWorkerSerializer, PermitExtensionSerializer, PermitAuditSerializer,
    WorkflowTemplateSerializer, WorkflowInstanceSerializer, WorkflowStepSerializer,
    HazardLibrarySerializer, PermitHazardSerializer, GasReadingSerializer,
    PermitPhotoSerializer, DigitalSignatureSerializer, EscalationRuleSerializer,
    NotificationTemplateSerializer, SystemIntegrationSerializer, ComplianceReportSerializer,
    PermitAnalyticsSerializer, DashboardStatsSerializer, IsolationPointLibrarySerializer,
    PermitIsolationPointSerializer, PermitToolboxTalkSerializer, PermitToolboxTalkAttendanceSerializer,
    AssignVerifierSerializer
)
from .unified_permissions import (
    UnifiedPTWPermissions, CanCreatePermits, CanEditPermits, 
    CanVerifyPermits, CanApprovePermits, CanManagePermits
)
from .ptw_permissions import ptw_permissions
from .unified_signature_pipeline import unified_signature_pipeline
from .signature_service import signature_service
from .unified_workflow_manager import unified_workflow_manager
from .unified_error_handling import ptw_error_handler, PTWValidationError, PTWPermissionError, PTWWorkflowError, PTWSignatureError
from .canonical_workflow_manager import canonical_workflow_manager
from .api_errors import ptw_api_errors
from .status_utils import normalize_permit_status
from authentication.models import CustomUser
# from permissions.decorators import require_permission  # Replaced with RequireTenantPermission
try:
    from authentication.tenant_scoped_utils import ensure_tenant_context, ensure_project, enforce_collaboration_read_only
except ImportError:
    from .compat.tenant_utils import ensure_tenant_context, ensure_project, enforce_collaboration_read_only
from .template_utils import resolve_permit_type_template
from rest_framework import serializers


class PTWBaseViewSet(TenantScopedViewSet):
    collaboration_enabled = True
    collaboration_domain = 'ptw'


class PTWReadOnlyViewSet(TenantScopedReadOnlyViewSet):
    collaboration_enabled = True
    collaboration_domain = 'ptw'


class PermitRelatedViewSet(PTWBaseViewSet):
    project_lookup = 'permit__project'

class PermitTypeViewSet(PTWBaseViewSet):
    queryset = PermitType.objects.all().order_by('category', 'name')
    serializer_class = PermitTypeSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['category', 'risk_level', 'is_active']
    search_fields = ['name', 'description', 'category']
    pagination_class = None
    project_required = False

    @action(detail=True, methods=['get'], url_path='resolved-template')
    def resolved_template(self, request, pk=None):
        permit_type = self.get_object()
        project = None
        project_id = request.query_params.get('project')
        if project_id:
            user_project = ensure_project(request)
            if str(user_project.id) != str(project_id):
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('Project access denied for permit type template.')
            project = user_project
        else:
            project = getattr(request.user, 'project', None)

        resolved = resolve_permit_type_template(
            permit_type=permit_type,
            project=project,
            override_model=PermitTypeTemplateOverride,
        )

        return Response({
            'permit_type_id': permit_type.id,
            **resolved,
        })

class HazardLibraryViewSet(PTWBaseViewSet):
    queryset = HazardLibrary.objects.filter(is_active=True)
    serializer_class = HazardLibrarySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['category', 'risk_level']
    search_fields = ['name', 'description', 'hazard_id']
    project_required = False

class WorkflowTemplateViewSet(PTWBaseViewSet):
    queryset = WorkflowTemplate.objects.filter(is_active=True)
    serializer_class = WorkflowTemplateSerializer
    permission_classes = [IsAuthenticated, CanManagePermits]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['permit_type', 'risk_level']
    project_required = False

class PermitViewSet(AuditLogMixin, PTWBaseViewSet):
    queryset = Permit.objects.all()
    permission_classes = [RequireTenantPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = PermitFilter
    search_fields = ['permit_number', 'title', 'location', 'description']
    ordering_fields = ['created_at', 'planned_start_time', 'planned_end_time', 'risk_score', 'permit_number']
    ordering = ['-created_at']
    model = Permit  # Required for permission decorator
    
    # Audit configuration
    audit_action_map = {
        'create': 'ptw.create',
        'update': 'ptw.update',
        'destroy': 'ptw.delete',
    }
    audit_target_type = 'PTWPermit'
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def get_serializer_class(self):
        if self.action == 'list':
            return PermitListSerializer
        elif self.action in ['create', 'update', 'partial_update']:
            return PermitCreateUpdateSerializer
        elif self.action == 'update_status':
            return PermitStatusUpdateSerializer
        return PermitSerializer
    


    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Mandatory project scoping - no bypasses
        user_project = ensure_project(self.request)
        queryset = queryset.filter(project=user_project)
        
        return queryset.select_related(
            'permit_type', 'created_by', 'project'
        ).prefetch_related(
            'assigned_workers__worker', 'identified_hazards__hazard',
            'gas_readings', 'photos', 'signatures__signatory', 'approvals', 'audit_logs'
        )

    def perform_create(self, serializer):
        user_project = self.get_user_project()
        
        # Ensure user has a project for project isolation
        if not user_project:
            from rest_framework.exceptions import ValidationError
            raise ValidationError("User must be assigned to a project to create permits.")
        
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"[PTW CREATE] user={self.request.user.id} user_type={getattr(self.request.user,'user_type',None)} project={user_project.id}")
        
        with transaction.atomic():
            permit = serializer.save(
                created_by=self.request.user,
                project=user_project
            )
            logger.info(f"[PTW CREATE] saved permit id={permit.id} number={permit.permit_number} status={permit.status}")
            
            # Set current user as context for audit logging
            permit._current_user = self.request.user
            
            # Create workflow instance if template exists
            try:
                self.create_workflow_instance(permit)
            except Exception as e:
                # Log the error but don't fail the permit creation
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to create workflow instance for permit {permit.id}: {str(e)}")
            
            # Send notifications
            try:
                self.send_creation_notifications(permit)
            except Exception as e:
                # Log the error but don't fail the permit creation
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to send creation notifications for permit {permit.id}: {str(e)}")
    
    # @require_permission('edit')  # Replaced with RequireTenantPermission at class level
    def update(self, request, *args, **kwargs):
        permit = self.get_object()
        if not ptw_permissions.can_edit_permit(request.user, permit):
            return Response(
                {'error': {'code': 'PERMISSION_DENIED', 'message': 'Cannot edit this permit'}},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().update(request, *args, **kwargs)
    
    # @require_permission('edit')  # Replaced with RequireTenantPermission at class level
    def partial_update(self, request, *args, **kwargs):
        permit = self.get_object()
        if not ptw_permissions.can_edit_permit(request.user, permit):
            return Response(
                {'error': {'code': 'PERMISSION_DENIED', 'message': 'Cannot edit this permit'}},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().partial_update(request, *args, **kwargs)
    
    # @require_permission('delete')  # Replaced with RequireTenantPermission at class level
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)

    def create_workflow_instance(self, permit):
        """Create workflow instance using unified workflow manager"""
        try:
            workflow = unified_workflow_manager.initiate_workflow(permit, permit.created_by)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to create workflow for permit {permit.id}: {str(e)}")
            pass

    def send_creation_notifications(self, permit):
        """Send notifications for permit creation"""
        from .workflow_manager import workflow_manager
        
        # Check if permit has workflow and send notifications
        try:
            if hasattr(permit, 'workflow'):
                workflow = permit.workflow
                # Get pending verification steps
                verification_steps = workflow.steps.filter(
                    step_id='verification',
                    status='pending'
                )
                
                for step in verification_steps:
                    if step.assignee:
                        # Send notification using the existing notification system
                        from authentication.models_notification import Notification
                        
                        Notification.objects.create(
                            user=step.assignee,
                            title='PTW Verification Required',
                            message=f'Permit {permit.permit_number} requires your verification',
                            notification_type='ptw_verification',
                            data={
                                'permit_id': permit.id,
                                'permit_number': permit.permit_number,
                                'location': permit.location,
                                'created_by': permit.created_by.get_full_name()
                            },
                            link=f'/dashboard/ptw/view/{permit.id}'
                        )
        except Exception as e:
            # Log error but don't fail permit creation
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to send notifications for permit {permit.id}: {str(e)}")
            pass

    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        """Get dashboard statistics"""
        user_project = getattr(request.user, 'project', None)
        base_query = self.get_queryset()
        
        today = timezone.now().date()
        week_start = today - timedelta(days=today.weekday())
        month_start = today.replace(day=1)
        
        stats = {
            'permits_today': base_query.filter(created_at__date=today).count(),
            'permits_this_week': base_query.filter(created_at__date__gte=week_start).count(),
            'permits_this_month': base_query.filter(created_at__date__gte=month_start).count(),
            'pending_approvals': base_query.filter(status='under_review').count(),
            'overdue_permits': base_query.filter(
                status='active',
                planned_end_time__lt=timezone.now()
            ).count(),
            'high_risk_permits': base_query.filter(risk_level__in=['high', 'extreme']).count(),
            'recent_permits': PermitListSerializer(
                base_query.order_by('-created_at')[:5], many=True
            ).data,
            'compliance_score': self.calculate_compliance_score(base_query)
        }
        
        return Response(DashboardStatsSerializer(stats).data)

    def calculate_compliance_score(self, queryset):
        """Calculate compliance score based on various factors"""
        total_permits = queryset.count()
        if total_permits == 0:
            return 100.0
        
        # Factors for compliance scoring
        completed_on_time = queryset.filter(
            status='completed',
            actual_end_time__lte=F('planned_end_time')
        ).count()
        
        properly_documented = queryset.exclude(
            Q(control_measures='') | Q(ppe_requirements=[])
        ).count()
        
        # Calculate weighted score
        time_compliance = (completed_on_time / total_permits) * 40
        documentation_compliance = (properly_documented / total_permits) * 60
        
        return round(time_compliance + documentation_compliance, 1)

    @action(detail=False, methods=['get'])
    def analytics(self, request):
        """Get comprehensive analytics data"""
        queryset = self.get_queryset()
        
        # Date range filtering
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        
        if start_date and end_date:
            queryset = queryset.filter(
                created_at__date__range=[start_date, end_date]
            )
        
        analytics_data = {
            'total_permits': queryset.count(),
            'active_permits': queryset.filter(status='active').count(),
            'completed_permits': queryset.filter(status='completed').count(),
            'overdue_permits': queryset.filter(
                status='active',
                planned_end_time__lt=timezone.now()
            ).count(),
            'average_processing_time': self.calculate_avg_processing_time(queryset),
            'compliance_rate': self.calculate_compliance_rate(queryset),
            'incident_rate': self.calculate_incident_rate(queryset),
            'risk_distribution': self.get_risk_distribution(queryset),
            'status_distribution': self.get_status_distribution(queryset),
            'monthly_trends': self.get_monthly_trends(queryset)
        }
        
        return Response(PermitAnalyticsSerializer(analytics_data).data)

    @action(detail=False, methods=['get'], throttle_classes=[PTWKpiThrottle])
    def kpis(self, request):
        """Get KPI dashboard stats with overdue/SLA alerts - respects same filters as list"""
        start_time = time.monotonic()
        from .kpi_utils import get_kpi_stats
        
        # Apply same filters as list endpoint
        queryset = self.filter_queryset(self.get_queryset())
        
        # Optional explicit project filter (overrides default)
        project_id = request.query_params.get('project')
        project = None
        if project_id:
            try:
                from authentication.models import Project
                project = Project.objects.get(id=project_id)
                queryset = queryset.filter(project=project)
            except Project.DoesNotExist:
                pass
        
        kpi_data = get_kpi_stats(queryset=queryset, project=project)
        
        # Log timing
        duration_ms = int((time.monotonic() - start_time) * 1000)
        log_ptw_event(
            'kpis_endpoint',
            user_id=request.user.id,
            project_id=getattr(request.user.project, 'id', None),
            duration_ms=duration_ms,
            outcome='success'
        )
        
        return Response(kpi_data)

    def calculate_avg_processing_time(self, queryset):
        """Calculate average processing time in hours"""
        completed_permits = queryset.filter(
            status='completed',
            actual_start_time__isnull=False,
            actual_end_time__isnull=False
        )
        
        if not completed_permits.exists():
            return 0.0
        
        total_hours = 0
        count = 0
        
        for permit in completed_permits:
            duration = permit.actual_end_time - permit.actual_start_time
            total_hours += duration.total_seconds() / 3600
            count += 1
        
        return round(total_hours / count, 2) if count > 0 else 0.0

    def calculate_compliance_rate(self, queryset):
        """Calculate compliance rate percentage"""
        total = queryset.count()
        if total == 0:
            return 100.0
        
        compliant = queryset.filter(
            Q(status='completed') | Q(status='active')
        ).exclude(
            planned_end_time__lt=timezone.now(),
            status='active'
        ).count()
        
        return round((compliant / total) * 100, 2)

    def calculate_incident_rate(self, queryset):
        """Calculate incident rate based on real incident data"""
        from incidentmanagement.models import Incident
        from django.db.models.functions import TruncMonth
        
        total_permits = queryset.count()
        if total_permits == 0:
            return 0.0
        
        # Get permit numbers from queryset
        permit_numbers = list(queryset.values_list('permit_number', flat=True))
        
        # Count incidents linked to these permits
        incident_count = Incident.objects.filter(
            work_permit_number__in=permit_numbers
        ).count()
        
        # Calculate rate as percentage
        incident_rate = (incident_count / total_permits) * 100
        
        return round(incident_rate, 2)

    def get_risk_distribution(self, queryset):
        """Get risk level distribution"""
        return dict(
            queryset.values('risk_level').annotate(
                count=Count('id')
            ).values_list('risk_level', 'count')
        )

    def get_status_distribution(self, queryset):
        """Get status distribution"""
        return dict(
            queryset.values('status').annotate(
                count=Count('id')
            ).values_list('status', 'count')
        )

    def get_monthly_trends(self, queryset):
        """Get monthly trends data with aggregations"""
        from django.db.models.functions import TruncMonth
        from datetime import datetime
        from dateutil.relativedelta import relativedelta
        
        # Default to last 12 months if no date filter
        end_date = timezone.now()
        start_date = end_date - relativedelta(months=11)
        start_date = start_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        # Filter queryset by date range
        queryset = queryset.filter(
            created_at__gte=start_date,
            created_at__lte=end_date
        )
        
        # Aggregate by month
        monthly_data = queryset.annotate(
            month=TruncMonth('created_at')
        ).values('month').annotate(
            total=Count('id')
        ).order_by('month')
        
        # Get status breakdown by month
        status_by_month = queryset.annotate(
            month=TruncMonth('created_at')
        ).values('month', 'status').annotate(
            count=Count('id')
        ).order_by('month', 'status')
        
        # Get type breakdown by month
        type_by_month = queryset.annotate(
            month=TruncMonth('created_at')
        ).values('month', 'permit_type__name').annotate(
            count=Count('id')
        ).order_by('month', 'permit_type__name')
        
        # Build result structure
        result = {}
        for item in monthly_data:
            month_key = item['month'].strftime('%Y-%m')
            result[month_key] = {
                'month': month_key,
                'total': item['total'],
                'by_status': {},
                'by_type': {}
            }
        
        # Add status breakdown
        for item in status_by_month:
            month_key = item['month'].strftime('%Y-%m')
            if month_key in result:
                result[month_key]['by_status'][item['status']] = item['count']
        
        # Add type breakdown
        for item in type_by_month:
            month_key = item['month'].strftime('%Y-%m')
            type_name = item['permit_type__name'] or 'Unknown'
            if month_key in result:
                result[month_key]['by_type'][type_name] = item['count']
        
        # Fill in missing months with zeros
        current = start_date
        while current <= end_date:
            month_key = current.strftime('%Y-%m')
            if month_key not in result:
                result[month_key] = {
                    'month': month_key,
                    'total': 0,
                    'by_status': {},
                    'by_type': {}
                }
            current = current + relativedelta(months=1)
        
        # Convert to sorted list
        return sorted(result.values(), key=lambda x: x['month'])

    @action(detail=True, methods=['post'])
    def update_status(self, request, pk=None):
        """Update permit status with validation - routes through canonical workflow manager"""
        permit = self.get_object()
        target_status = request.data.get('status')
        comments = request.data.get('comments', '')
        
        if not target_status:
            return ptw_api_errors.validation_error('Status is required', field='status')
        
        try:
            # Use canonical workflow manager for ALL status transitions
            permit = canonical_workflow_manager.transition(
                permit=permit,
                target_status=target_status,
                actor=request.user,
                comments=comments,
                context={'source': 'api'}
            )
            
            return Response(PermitSerializer(permit).data)
            
        except PTWPermissionError as e:
            return ptw_api_errors.permission_error(e.message)
        except (PTWWorkflowError, PTWValidationError) as e:
            return ptw_api_errors.validation_error(e.message, details=e.details)
        except Exception as e:
            ptw_error_handler.log_error(e, {'permit_id': permit.id, 'target_status': target_status})
            return ptw_api_errors.workflow_error(str(e))

    def handle_workflow_progression(self, permit, user):
        """Handle workflow step progression"""
        try:
            workflow = permit.workflow
            current_step = workflow.steps.filter(
                status='pending',
                order=workflow.current_step
            ).first()
            
            if current_step:
                current_step.status = 'completed'
                current_step.completed_at = timezone.now()
                current_step.assignee = user
                current_step.save()
                
                # Move to next step
                next_step = workflow.steps.filter(
                    order__gt=workflow.current_step
                ).first()
                
                if next_step:
                    workflow.current_step = next_step.order
                    workflow.save()
                else:
                    workflow.status = 'completed'
                    workflow.completed_at = timezone.now()
                    workflow.save()
                    
        except WorkflowInstance.DoesNotExist:
            pass

    @action(detail=True, methods=['post'])
    def add_photo(self, request, pk=None):
        """Add photo to permit"""
        permit = self.get_object()
        
        photo_data = request.data.get('photo')
        photo_type = request.data.get('photo_type', 'during')
        description = request.data.get('description', '')
        gps_location = request.data.get('gps_location', '')
        
        if not photo_data:
            return Response(
                {'error': 'Photo data is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Handle base64 encoded photo
            if photo_data.startswith('data:image'):
                format, imgstr = photo_data.split(';base64,')
                ext = format.split('/')[-1]
                photo_file = ContentFile(
                    base64.b64decode(imgstr),
                    name=f'permit_{permit.id}_{uuid.uuid4().hex[:8]}.{ext}'
                )
            else:
                photo_file = photo_data
            
            photo = PermitPhoto.objects.create(
                permit=permit,
                photo=photo_file,
                photo_type=photo_type,
                description=description,
                taken_by=request.user,
                gps_location=gps_location
            )
            
            return Response(PermitPhotoSerializer(photo).data)
            
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    def add_signature(self, request, pk=None):
        """Add digital signature to permit using JSON-only payload"""
        permit = self.get_object()
        signature_type = request.data.get('signature_type')
        signature_payload = request.data.get('signature_payload')
        
        if not signature_type:
            return Response(
                {'error': {'code': 'MISSING_SIGNATURE_TYPE', 'message': 'Signature type is required'}},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if signature_type not in ['requestor', 'verifier', 'approver']:
            return Response(
                {'error': {'code': 'INVALID_SIGNATURE_TYPE', 'message': 'Invalid signature type'}},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not signature_payload or not signature_payload.get('strokes'):
            return Response(
                {'error': {'code': 'MISSING_SIGNATURE_PAYLOAD', 'message': 'Signature payload with strokes is required'}},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Role enforcement
            if signature_type == 'requestor' and permit.created_by != request.user:
                return Response(
                    {'error': {'code': 'PERMISSION_DENIED', 'message': 'Only permit creator can sign as requestor'}},
                    status=status.HTTP_403_FORBIDDEN
                )
            elif signature_type == 'verifier' and permit.verifier != request.user:
                return Response(
                    {'error': {'code': 'PERMISSION_DENIED', 'message': 'Only assigned verifier can sign as verifier'}},
                    status=status.HTTP_403_FORBIDDEN
                )
            elif signature_type == 'approver' and permit.approver != request.user:
                return Response(
                    {'error': {'code': 'PERMISSION_DENIED', 'message': 'Only assigned approver can sign as approver'}},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            # Status enforcement
            current_status = normalize_permit_status(permit.status)
            if signature_type == 'requestor' and current_status not in ['draft', 'submitted', 'pending_verification']:
                return Response(
                    {'error': {'code': 'INVALID_STATUS', 'message': 'Requestor signature not allowed in current status'}},
                    status=status.HTTP_400_BAD_REQUEST
                )
            elif signature_type == 'verifier' and current_status not in ['pending_verification', 'under_review']:
                return Response(
                    {'error': {'code': 'INVALID_STATUS', 'message': 'Verifier signature not allowed in current status'}},
                    status=status.HTTP_400_BAD_REQUEST
                )
            elif signature_type == 'approver' and current_status not in ['pending_approval', 'under_review']:
                return Response(
                    {'error': {'code': 'INVALID_STATUS', 'message': 'Approver signature not allowed in current status'}},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Validate payload structure
            if not isinstance(signature_payload, dict) or signature_payload.get('type') != 'stroke_v1':
                return Response(
                    {'error': {'code': 'INVALID_PAYLOAD', 'message': 'Invalid signature payload format'}},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Validate JSON payload structure
            if not signature_payload.get('strokes') or not isinstance(signature_payload['strokes'], list):
                return Response(
                    {'error': {'code': 'INVALID_STROKES', 'message': 'Signature payload must contain valid strokes array'}},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Compute payload hash for integrity
            import json
            import hashlib
            canonical_json = json.dumps(signature_payload, sort_keys=True, separators=(',', ':'))
            payload_hash = hashlib.sha256(canonical_json.encode()).hexdigest()
            signature_payload['payload_hash'] = payload_hash
            
            with transaction.atomic():
                # Create or update signature - JSON-only storage
                signature, created = DigitalSignature.objects.update_or_create(
                    permit=permit,
                    signature_type=signature_type,
                    signatory=request.user,
                    defaults={
                        'signature_payload': signature_payload,
                        'payload_version': 1,
                        'signature_data': '',  # Clear legacy field
                        'ip_address': self.get_client_ip(request),
                        'device_info': self.get_device_info(request)
                    }
                )
                
                # STREAMLINED WORKFLOW: Signing = Action
                if signature_type == 'verifier':
                    # Verifier signing = Verification approval
                    canonical_workflow_manager.transition(
                        permit=permit,
                        target_status='under_review',
                        actor=request.user,
                        comments='Verified via digital signature',
                        context={'source': 'signature', 'signature_type': signature_type}
                    )
                elif signature_type == 'approver':
                    # Approver signing = Permit approval
                    canonical_workflow_manager.transition(
                        permit=permit,
                        target_status='approved',
                        actor=request.user,
                        comments='Approved via digital signature',
                        context={'source': 'signature', 'signature_type': signature_type}
                    )
                    # Set approved_by field
                    permit.approved_by = request.user
                    permit.approved_at = signature.signed_at
                    permit.save(update_fields=['approved_by', 'approved_at'])
                
                # Get updated signatures_by_type
                permit.refresh_from_db()
                serializer = PermitSerializer(permit, context={'request': request})
                signatures_by_type = serializer.data.get('signatures_by_type', {})
                
                return Response({
                    'message': f'{signature_type.title()} signature added successfully',
                    'signatures_by_type': signatures_by_type
                }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
            
        except Exception as e:
            ptw_error_handler.log_error(e, {'permit_id': permit.id, 'signature_type': signature_type})
            return Response(
                {'error': {'code': 'SIGNATURE_ERROR', 'message': str(e)}},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def _build_tbt_response(self, request, permit):
        tbt = PermitToolboxTalk.objects.filter(permit=permit).first()
        tbt_data = (
            PermitToolboxTalkSerializer(tbt, context={'request': request}).data
            if tbt else None
        )
        attendance_by_worker = {}
        if tbt:
            attendance_qs = tbt.attendance.select_related('permit_worker', 'permit_worker__worker')
            for attendance in attendance_qs:
                attendance_by_worker[attendance.permit_worker_id] = attendance

        entries = []
        workers = permit.assigned_workers.select_related('worker')
        for worker in workers:
            attendance = attendance_by_worker.get(worker.id)
            if attendance:
                entries.append(
                    PermitToolboxTalkAttendanceSerializer(attendance, context={'request': request}).data
                )
                continue
            entries.append({
                'id': None,
                'tbt': tbt.id if tbt else None,
                'permit_worker': worker.id,
                'permit_worker_details': PermitWorkerSerializer(worker, context={'request': request}).data,
                'acknowledged': False,
                'acknowledged_at': None,
                'ack_signature': '',
            })

        return Response({
            'tbt': tbt_data,
            'attendance': entries,
        })

    @action(detail=True, methods=['get'])
    def available_tbts(self, request, pk=None):
        """Get available TBTs for permit selection (same day + location)"""
        permit = self.get_object()
        
        from tbt.models import ToolboxTalk
        from tbt.serializers import ToolboxTalkSerializer
        
        # Filter TBTs by same date and location
        permit_date = permit.planned_start_time.date() if permit.planned_start_time else timezone.now().date()
        
        available_tbts = ToolboxTalk.objects.filter(
            project=permit.project,
            date=permit_date,
            location__icontains=permit.location.strip().lower() if permit.location else '',
            status='completed'
        ).order_by('-created_at')
        
        # If no exact location match, try fuzzy matching
        if not available_tbts.exists() and permit.location:
            location_words = permit.location.strip().lower().split()
            if location_words:
                from django.db.models import Q
                location_q = Q()
                for word in location_words:
                    location_q |= Q(location__icontains=word)
                
                available_tbts = ToolboxTalk.objects.filter(
                    project=permit.project,
                    date=permit_date,
                    status='completed'
                ).filter(location_q).order_by('-created_at')
        
        serializer_data = []
        for tbt in available_tbts:
            serializer_data.append({
                'id': tbt.id,
                'title': tbt.title,
                'conducted_at': tbt.created_at.isoformat(),
                'location': tbt.location,
                'conducted_by': tbt.conducted_by,
                'description': tbt.description
            })
        
        return Response(serializer_data)
    
    @action(detail=True, methods=['post'])
    def assign_tbt(self, request, pk=None):
        """Assign existing TBT to permit"""
        permit = self.get_object()
        tbt_id = request.data.get('tbt_id')
        
        if not tbt_id:
            return Response(
                {'error': 'tbt_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            from tbt.models import ToolboxTalk
            selected_tbt = ToolboxTalk.objects.get(
                id=tbt_id,
                project=permit.project,
                status='completed'
            )
            
            # Create or update permit TBT record
            permit_tbt, created = PermitToolboxTalk.objects.get_or_create(
                permit=permit,
                defaults={
                    'title': selected_tbt.title,
                    'conducted_at': selected_tbt.created_at,
                    'conducted_by': CustomUser.objects.filter(username=selected_tbt.conducted_by).first(),
                    'notes': f'Linked to TBT #{selected_tbt.id}: {selected_tbt.description}'
                }
            )
            
            if not created:
                # Update existing record
                permit_tbt.title = selected_tbt.title
                permit_tbt.conducted_at = selected_tbt.created_at
                permit_tbt.conducted_by = CustomUser.objects.filter(username=selected_tbt.conducted_by).first()
                permit_tbt.notes = f'Linked to TBT #{selected_tbt.id}: {selected_tbt.description}'
                permit_tbt.save()
            
            return Response({
                'message': f'TBT "{selected_tbt.title}" assigned to permit successfully',
                'tbt': PermitToolboxTalkSerializer(permit_tbt, context={'request': request}).data
            })
            
        except ToolboxTalk.DoesNotExist:
            return Response(
                {'error': 'Selected TBT not found or not available for this permit'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['get'])
    def tbt(self, request, pk=None):
        """Get Toolbox Talk details and attendance for this permit."""
        permit = self.get_object()
        return self._build_tbt_response(request, permit)

    @action(detail=True, methods=['post'])
    def update_tbt(self, request, pk=None):
        """Create or update Toolbox Talk details for this permit."""
        permit = self.get_object()
        tbt, _created = PermitToolboxTalk.objects.get_or_create(permit=permit)

        title = request.data.get('title')
        if title is not None:
            tbt.title = title

        if 'conducted_at' in request.data:
            conducted_at = request.data.get('conducted_at')
            if conducted_at:
                parsed_dt = parse_datetime(conducted_at)
                if parsed_dt:
                    tbt.conducted_at = parsed_dt
            else:
                tbt.conducted_at = None

        conducted_by = request.data.get('conducted_by')
        if conducted_by:
            try:
                tbt.conducted_by = CustomUser.objects.get(id=conducted_by)
            except CustomUser.DoesNotExist:
                return Response(
                    {'error': 'Conducted by user not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

        if 'document' in request.FILES:
            tbt.document = request.FILES['document']

        url = request.data.get('url')
        if url is not None:
            tbt.url = url

        notes = request.data.get('notes')
        if notes is not None:
            tbt.notes = notes

        tbt.save()
        return self._build_tbt_response(request, permit)

    @action(detail=True, methods=['post'])
    def tbt_ack(self, request, pk=None):
        """Acknowledge Toolbox Talk attendance for a permit worker."""
        permit = self.get_object()
        tbt = PermitToolboxTalk.objects.filter(permit=permit).first()
        if not tbt:
            return Response(
                {'error': 'Toolbox Talk not found for this permit'},
                status=status.HTTP_400_BAD_REQUEST
            )

        permit_worker_id = request.data.get('permit_worker_id')
        if not permit_worker_id:
            return Response(
                {'error': 'permit_worker_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        worker = permit.assigned_workers.filter(id=permit_worker_id).first()
        if not worker:
            return Response(
                {'error': 'Permit worker not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        def parse_bool(value, default=False):
            if value is None:
                return default
            if isinstance(value, bool):
                return value
            if isinstance(value, str):
                return value.strip().lower() in {'1', 'true', 'yes', 'y'}
            return bool(value)

        acknowledged = parse_bool(request.data.get('acknowledged'), True)

        attendance, _created = PermitToolboxTalkAttendance.objects.get_or_create(
            tbt=tbt,
            permit_worker=worker
        )
        attendance.acknowledged = acknowledged
        attendance.acknowledged_at = timezone.now() if acknowledged else None

        if 'ack_signature' in request.data:
            attendance.ack_signature = request.data.get('ack_signature') or ''

        attendance.save()
        return Response(
            PermitToolboxTalkAttendanceSerializer(attendance, context={'request': request}).data
        )

    @action(detail=True, methods=['get'])
    def gas_readings(self, request, pk=None):
        """Get gas readings for permit"""
        permit = self.get_object()
        readings = permit.gas_readings.all().order_by('-tested_at')
        serializer = GasReadingSerializer(readings, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def add_gas_reading(self, request, pk=None):
        """Add gas reading to permit"""
        permit = self.get_object()
        
        # Check if permit allows modifications
        if permit.status in ['completed', 'cancelled', 'expired']:
            return Response(
                {'error': 'Cannot add gas readings to completed permits'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        data = request.data.copy()
        data['permit'] = permit.id
        
        serializer = GasReadingSerializer(data=data)
        if serializer.is_valid():
            gas_reading = serializer.save(tested_by=request.user)
            return Response(GasReadingSerializer(gas_reading).data, status=status.HTTP_201_CREATED)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['put', 'patch'])
    def update_gas_reading(self, request, pk=None):
        """Update gas reading for permit"""
        permit = self.get_object()
        reading_id = request.data.get('reading_id')
        
        if not reading_id:
            return Response(
                {'error': 'reading_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            gas_reading = permit.gas_readings.get(id=reading_id)
        except GasReading.DoesNotExist:
            return Response(
                {'error': 'Gas reading not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check if permit allows modifications
        if permit.status in ['completed', 'cancelled', 'expired']:
            return Response(
                {'error': 'Cannot modify gas readings for completed permits'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = GasReadingSerializer(gas_reading, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['delete'])
    def delete_gas_reading(self, request, pk=None):
        """Delete gas reading from permit"""
        permit = self.get_object()
        reading_id = request.data.get('reading_id') or request.query_params.get('reading_id')
        
        if not reading_id:
            return Response(
                {'error': 'reading_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            gas_reading = permit.gas_readings.get(id=reading_id)
        except GasReading.DoesNotExist:
            return Response(
                {'error': 'Gas reading not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check if permit allows modifications
        if permit.status in ['completed', 'cancelled', 'expired']:
            return Response(
                {'error': 'Cannot delete gas readings for completed permits'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        gas_reading.delete()
        return Response({'message': 'Gas reading deleted successfully'})

    @action(detail=True, methods=['get'])
    def check_work_hours(self, request, pk=None):
        """Check if permit is within allowed work hours"""
        permit = self.get_object()
        from .utils import is_permit_expired_by_work_hours
        
        is_expired = is_permit_expired_by_work_hours(permit)
        is_within_hours = permit.is_within_work_hours()
        
        return Response({
            'is_within_work_hours': is_within_hours,
            'is_expired_by_work_hours': is_expired,
            'work_hours_display': permit.get_work_hours_display()
        })
    
    @action(detail=True, methods=['get'])
    def generate_qr_code(self, request, pk=None):
        """Generate QR code for permit - requires saved permit with numeric ID"""
        # Critical fix: Reject non-numeric IDs including "new"
        try:
            permit_id = int(pk)
            if permit_id <= 0:
                raise ValueError("Invalid permit ID")
        except (ValueError, TypeError):
            return Response(
                {'error': 'QR code can only be generated for saved permits with valid numeric ID.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        permit = self.get_object()
        
        # Ensure permit is actually saved (has valid ID)
        if not permit.pk or permit.pk != permit_id:
            return Response(
                {'error': 'Permit must be saved before generating QR code.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            if generate_permit_qr_code is None:
                return Response(
                    {'error': 'QR code generation not available - qrcode library not installed'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Get size parameter
            size = request.query_params.get('size', 'medium')
            if size not in ['small', 'medium', 'large']:
                size = 'medium'
            
            # Generate QR code and data
            base_url = getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:5173')
            mobile_url = f"{base_url}/mobile/permit/{permit.id}"
            web_url = f"{base_url}/dashboard/ptw/view/{permit.id}"
            
            qr_data = generate_permit_qr_data(permit)
            qr_image = generate_permit_qr_code(permit, qr_payload=qr_data, size=size)
            
            if not qr_image:
                return Response(
                    {'error': 'Failed to generate QR code image'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            # Update permit with QR data
            permit.qr_code = qr_data
            permit.save(update_fields=['qr_code'])
            
            # Create audit log
            PermitAudit.objects.create(
                permit=permit,
                action='qr_generated',
                user=request.user,
                comments=f'QR code generated (size: {size})'
            )
            
            # Standardized response schema
            return Response({
                'qr_image': qr_image,
                'qr_data': permit.qr_code,
                'mobile_url': mobile_url,
                'web_url': web_url,
                'size': size,
                'expires_at': (timezone.now() + timezone.timedelta(hours=24)).isoformat(),
                'permit_id': permit.id,
                'permit_number': permit.permit_number,
                'permit_info': {
                    'number': permit.permit_number,
                    'status': permit.status,
                    'location': permit.location,
                    'risk_level': permit.risk_level
                }
            })
            
        except Exception as e:
            return Response(
                {'error': f'QR generation failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['post'])
    def batch_generate_qr(self, request):
        """Generate QR codes for multiple permits"""
        permit_ids = request.data.get('permit_ids', [])
        size = request.data.get('size', 'medium')
        
        if not permit_ids:
            return Response(
                {'error': 'permit_ids is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if len(permit_ids) > 50:  # Limit batch size
            return Response(
                {'error': 'Maximum 50 permits allowed per batch'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            from .qr_utils import generate_batch_qr_codes
            
            permits = self.get_queryset().filter(id__in=permit_ids)
            results = generate_batch_qr_codes(permits, size=size)
            
            # Update permits with QR data
            for permit in permits:
                if permit.id in results and results[permit.id]['success']:
                    permit.qr_code = results[permit.id]['qr_data']
                    permit.save(update_fields=['qr_code'])
            
            return Response({
                'results': results,
                'summary': {
                    'total': len(permit_ids),
                    'successful': len([r for r in results.values() if r['success']]),
                    'failed': len([r for r in results.values() if not r['success']])
                }
            })
            
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['get'])
    def users_search(self, request):
        """Search users for personnel selection with typeahead"""
        query = request.query_params.get('q', '')
        user_type = request.query_params.get('user_type', '')
        grade = request.query_params.get('grade', '')
        
        user_project = getattr(request.user, 'project', None)
        if not user_project:
            return Response([])
        
        # Base query: users in same project
        users_query = CustomUser.objects.filter(project=user_project)
        
        # Filter by user type if specified
        if user_type:
            users_query = users_query.filter(admin_type=user_type)
        
        # Filter by grade if specified
        if grade:
            users_query = users_query.filter(grade=grade)
        
        # Search by name, username, email
        if query:
            from django.db.models import Q
            users_query = users_query.filter(
                Q(name__icontains=query) |
                Q(surname__icontains=query) |
                Q(username__icontains=query) |
                Q(email__icontains=query)
            )
        
        # Limit results
        users = users_query[:20]
        
        user_data = []
        for user in users:
            user_data.append({
                'id': user.id,
                'username': user.username,
                'full_name': f"{user.name or ''} {user.surname or ''}".strip() or user.username,
                'email': user.email or '',
                'admin_type': user.admin_type,
                'grade': user.grade,
                'department': getattr(user, 'department', ''),
                'designation': getattr(user, 'designation', '')
            })
        
        return Response(user_data)
    
    @action(detail=False, methods=['get'])
    def available_verifiers(self, request):
        """Get available verifiers based on requestor type, grade and company filter"""
        user = request.user
        company_filter = request.query_params.get('company_filter', '')
        
        try:
            from .workflow_manager import workflow_manager
            
            verifiers = workflow_manager.get_available_verifiers(
                user.project, 
                user.admin_type,
                user.grade,
                company_filter
            )
            
            verifier_data = []
            for verifier in verifiers:
                # Add specialization info
                specialization = self._get_verifier_specialization(verifier, user.admin_type)
                
                verifier_data.append({
                    'id': verifier.id,
                    'username': verifier.username,
                    'full_name': verifier.get_full_name(),
                    'admin_type': verifier.admin_type,
                    'grade': verifier.grade,
                    'company_name': getattr(verifier, 'company_name', ''),
                    'department': getattr(verifier, 'department', ''),
                    'specialization': specialization
                })
            
            return Response({
                'verifiers': verifier_data,
                'selection_rules': self._get_verifier_selection_rules(user.admin_type, user.grade)
            })
            
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['get'])
    def available_approvers_for_verifier(self, request):
        """Get available approvers based on verifier type, grade and company filter"""
        user = request.user
        company_filter = request.query_params.get('company_filter', '')
        
        try:
            from .workflow_manager import workflow_manager
            
            approvers = workflow_manager.get_available_approvers(
                user.project, 
                user.admin_type,
                user.grade,
                company_filter
            )
            
            approver_data = []
            for approver in approvers:
                approver_data.append({
                    'id': approver.id,
                    'username': approver.username,
                    'full_name': approver.get_full_name(),
                    'admin_type': approver.admin_type,
                    'grade': approver.grade,
                    'company_name': getattr(approver, 'company_name', ''),
                    'department': getattr(approver, 'department', ''),
                    'authority': 'Full Approval Authority (Grade A)'
                })
            
            return Response({
                'approvers': approver_data,
                'selection_rules': self._get_approver_selection_rules(user.admin_type, user.grade)
            })
            
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def assign_verifier(self, request, pk=None):
        """Assign verifier to permit (requestor selects verifier)"""
        permit = self.get_object()
        serializer = AssignVerifierSerializer(data=request.data)
        if not serializer.is_valid():
            return ptw_api_errors.validation_error(
                'Verifier ID is required',
                field='verifier_id',
                details=serializer.errors,
            )
        verifier_id = serializer.validated_data['verifier_id']

        current_status = normalize_permit_status(permit.status)
        if current_status not in ['draft', 'submitted']:
            return ptw_api_errors.validation_error(
                'Cannot change verifier after verification is completed',
                field='status',
                details={'status': permit.status},
            )
        
        # Check if user is the requestor (created_by)
        if permit.created_by != request.user:
            return ptw_api_errors.permission_error(
                'Only the permit requestor can assign verifier',
                action='assign_verifier',
            )
        
        try:
            verifier = CustomUser.objects.filter(
                id=verifier_id,
                project=permit.project
            ).first()
            if not verifier:
                return ptw_api_errors.validation_error(
                    'Verifier not found for this project',
                    field='verifier_id',
                )
            
            from .workflow_manager import workflow_manager

            try:
                permit.workflow
            except WorkflowInstance.DoesNotExist:
                workflow_manager.initiate_workflow(permit, request.user)
                permit.refresh_from_db()

            workflow_manager.assign_verifier(permit, verifier, request.user)
            
            return Response({
                'message': f'Verifier {verifier.get_full_name()} assigned successfully'
            })
            
        except CustomUser.DoesNotExist:
            return ptw_api_errors.validation_error(
                'Verifier not found for this project',
                field='verifier_id',
            )
        except Exception as e:
            return ptw_api_errors.validation_error(str(e))
    
    @action(detail=True, methods=['post'])
    def assign_approver(self, request, pk=None):
        """Assign approver to permit (verifier selects approver)"""
        permit = self.get_object()
        approver_id = request.data.get('approver_id')
        
        if not approver_id:
            return Response(
                {'error': 'Approver ID is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if permit allows approver changes
        if permit.status not in ['verified', 'under_review', 'pending_approval', 'submitted']:
            return Response(
                {'error': 'Cannot change approver before verification or after approval is completed'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Allow both verifier and users with appropriate permissions to assign approver
        if permit.verifier != request.user and not ptw_permissions.can_edit_permit(request.user, permit):
            return Response(
                {'error': 'Only the permit verifier or authorized users can assign approver'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            approver = CustomUser.objects.get(id=approver_id)
            
            from .workflow_manager import workflow_manager

            if not hasattr(permit, 'workflow'):
                return Response(
                    {'error': 'Workflow is not initialized for this permit'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            workflow_manager.assign_approver(permit, approver, request.user)
            
            return Response({
                'message': f'Approver {approver.get_full_name()} assigned successfully'
            })
            
        except CustomUser.DoesNotExist:
            return Response(
                {'error': 'Approver not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    def _get_verifier_specialization(self, verifier, requestor_type):
        """Get verifier specialization description"""
        if verifier.admin_type == 'epcuser':
            if verifier.grade == 'C':
                return "Specializes in contractor permit verification"
            elif verifier.grade == 'B':
                return "Specializes in EPC permit verification"
        elif verifier.admin_type == 'clientuser':
            if verifier.grade == 'C':
                return "Limited verification authority"
            elif verifier.grade == 'B':
                return "Specializes in Client permit verification"
        return "General verification"
    
    def _get_verifier_selection_rules(self, requestor_type, requestor_grade):
        """Get verifier selection rules for display"""
        if requestor_type == 'clientuser':
            return "Client requestors can only select Client Grade B verifiers"
        elif requestor_type == 'epcuser':
            if requestor_grade == 'C':
                return "EPC Grade C requestors can select EPC Grade A/B verifiers"
            return "EPC Grade B requestors can select EPC Grade A or Client Grade B/C verifiers"
        elif requestor_type == 'contractoruser':
            return "Contractor requestors can select EPC verifiers (Grades B/C only)"
        return "Select appropriate verifier based on permit type"
    
    def _get_approver_selection_rules(self, verifier_type, verifier_grade):
        """Get approver selection rules for display"""
        if verifier_type == 'clientuser':
            return "Client verifiers can only select Client Grade A approvers"
        if verifier_type == 'epcuser' and verifier_grade == 'C':
            return "EPC Grade C verifiers can select EPC/Client Grade A/B approvers"
        return "EPC Grade B verifiers can select EPC Grade A or Client Grade A/B approvers"
    
    @action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        """Verify permit using canonical workflow manager"""
        permit = self.get_object()
        
        # Enforce permission check
        if not ptw_permissions.can_verify(request.user, permit):
            return Response(
                {'error': {'code': 'PERMISSION_DENIED', 'message': 'Cannot verify this permit'}},
                status=status.HTTP_403_FORBIDDEN
            )
        
        action = request.data.get('action')
        comments = request.data.get('comments', '')
        selected_approver_id = request.data.get('selected_approver_id')
        
        if action not in ['approve', 'reject']:
            ptw_error_handler.handle_validation_error('Invalid action. Must be approve or reject', 'action')
        
        if action == 'reject' and not comments:
            ptw_error_handler.handle_validation_error('Comments are required for rejection', 'comments')
        
        try:
            # Validate required signatures before verification
            if action == 'approve':
                signature_service.validate_signature_for_workflow(permit, 'verify', request.user)
            
            # Use canonical workflow manager for verification
            if action == 'approve':
                # First transition to under_review (verified state)
                canonical_workflow_manager.transition(
                    permit=permit,
                    target_status='under_review',
                    actor=request.user,
                    comments=comments,
                    context={'source': 'verify', 'action': action}
                )
                
                # If approver is selected, assign them
                if selected_approver_id:
                    try:
                        approver = CustomUser.objects.get(id=selected_approver_id)
                        permit.approver = approver
                        permit.save()
                    except CustomUser.DoesNotExist:
                        pass  # Continue without approver assignment
                        
            else:
                # Reject verification
                canonical_workflow_manager.transition(
                    permit=permit,
                    target_status='rejected',
                    actor=request.user,
                    comments=comments,
                    context={'source': 'verify', 'action': action}
                )
            
            message = 'Permit verified successfully' if action == 'approve' else 'Permit verification rejected'
            return ptw_error_handler.create_success_response(message=message)
            
        except (PTWValidationError, PTWPermissionError, PTWWorkflowError) as e:
            return Response(
                {'error': {'code': e.code, 'message': e.message}},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            ptw_error_handler.log_error(e, {'permit_id': permit.id, 'action': action})
            return Response(
                {'error': {'code': 'WORKFLOW_ERROR', 'message': str(e)}},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve permit using canonical workflow manager"""
        permit = self.get_object()
        
        # Enforce permission check
        if not ptw_permissions.can_approve(request.user, permit):
            return Response(
                {'error': {'code': 'PERMISSION_DENIED', 'message': 'Cannot approve this permit'}},
                status=status.HTTP_403_FORBIDDEN
            )
        
        comments = request.data.get('comments', '')
        
        try:
            # Validate required signatures before approval
            signature_service.validate_signature_for_workflow(permit, 'approve', request.user)
            
            # Use canonical workflow manager for approval
            canonical_workflow_manager.transition(
                permit=permit,
                target_status='approved',
                actor=request.user,
                comments=comments,
                context={'source': 'approve'}
            )
            
            return ptw_error_handler.create_success_response(message='Permit approved successfully')
            
        except (PTWValidationError, PTWPermissionError, PTWWorkflowError) as e:
            return Response(
                {'error': {'code': e.code, 'message': e.message}},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            ptw_error_handler.log_error(e, {'permit_id': permit.id})
            return Response(
                {'error': {'code': 'WORKFLOW_ERROR', 'message': str(e)}},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject permit"""
        permit = self.get_object()
        
        action = 'reject'
        comments = request.data.get('comments', '')
        
        if not comments:
            return Response(
                {'error': 'Comments are required for rejection'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            from .workflow_manager import workflow_manager
            
            # Check if this is approval rejection or verification rejection
            if permit.status == 'under_review':
                workflow_manager.approve_permit(permit, request.user, action, comments)
                message = 'Permit approval rejected'
            else:
                workflow_manager.verify_permit(permit, request.user, action, comments)
                message = 'Permit verification rejected'
            
            return Response({
                'message': message
            })
            
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['get'])
    @action(detail=True, methods=['get'])
    def export_pdf(self, request, pk=None):
        """Export permit as comprehensive audit-ready PDF"""
        from .export_utils import generate_audit_ready_pdf
        
        permit = self.get_object()
        
        buffer = generate_audit_ready_pdf(permit)
        
        response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="PTW_{permit.permit_number}.pdf"'
        
        return response

    @action(detail=False, methods=['get'])
    def export_excel(self, request):
        """Export permits as Excel with optional detailed sheets - respects same filters as list"""
        from .excel_utils import generate_excel_export
        
        # Apply same filters as list endpoint
        queryset = self.filter_queryset(self.get_queryset())
        
        if openpyxl is None:
            return Response(
                {'error': 'Excel export not available - openpyxl not installed'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check for detailed export
        detailed = request.query_params.get('detailed', 'false').lower() == 'true'
        
        # Limit queryset to avoid huge files
        max_permits = 500
        if queryset.count() > max_permits:
            return Response(
                {'error': f'Too many permits to export. Maximum {max_permits} permits allowed.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Optimize query
        queryset = queryset.select_related(
            'permit_type', 'project', 'created_by', 'issuer', 'receiver',
            'verifier', 'approved_by', 'area_incharge'
        ).prefetch_related(
            'isolation_points__point',
            'gas_readings',
            'closeout__template',
            'audit_logs'
        )
        
        wb = generate_excel_export(queryset, detailed=detailed)
        
        response = HttpResponse(
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        filename = f"permits_{'detailed_' if detailed else ''}{timezone.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        
        wb.save(response)
        return response

    def generate_permit_pdf(self, canvas, permit):
        """Generate PDF content for permit (legacy method - kept for compatibility)"""
        canvas.setTitle(f"Permit {permit.permit_number}")
        canvas.drawString(100, 750, f"Permit to Work: {permit.permit_number}")

    @action(detail=False, methods=['post'], throttle_classes=[PTWBulkExportThrottle])
    def bulk_export_pdf(self, request):
        """Bulk export permits as ZIP of PDFs - supports permit_ids OR filters"""
        start_time = time.monotonic()
        import zipfile
        from tempfile import SpooledTemporaryFile
        from .export_utils import generate_audit_ready_pdf
        
        # Get permit IDs from request OR use filters
        permit_ids = request.data.get('permit_ids', [])
        use_filters = request.data.get('use_filters', False)
        
        if use_filters or not permit_ids:
            # Apply filters from query params
            queryset = self.filter_queryset(self.get_queryset())
        else:
            # Use explicit permit IDs
            queryset = self.get_queryset().filter(id__in=permit_ids)
        
        # Enforce limit
        max_permits = getattr(settings, 'PTW_BULK_EXPORT_LIMIT', 200)
        if queryset.count() > max_permits:
            return Response(
                {'error': f'Too many permits. Maximum {max_permits} permits allowed per bulk export.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Optimize query
        queryset = queryset.select_related(
            'permit_type', 'project', 'created_by', 'issuer', 'receiver',
            'verifier', 'approved_by'
        ).prefetch_related(
            'isolation_points__point',
            'gas_readings',
            'closeout__template',
            'signatures',
            'photos',
            'audit_logs'
        )
        
        if not queryset.exists():
            return Response(
                {'error': 'No permits found or you do not have permission to export them'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Create ZIP file
        temp_file = SpooledTemporaryFile(max_size=100*1024*1024)  # 100MB max in memory
        
        with zipfile.ZipFile(temp_file, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for permit in queryset:
                try:
                    pdf_buffer = generate_audit_ready_pdf(permit)
                    filename = f"PTW_{permit.permit_number}.pdf"
                    zip_file.writestr(filename, pdf_buffer.getvalue())
                except Exception as e:
                    # Log error but continue with other permits
                    continue
        
        temp_file.seek(0)
        
        response = HttpResponse(temp_file.read(), content_type='application/zip')
        response['Content-Disposition'] = f'attachment; filename="permits_bulk_{timezone.now().strftime("%Y%m%d_%H%M%S")}.zip"'
        
        temp_file.close()
        
        # Log timing
        duration_ms = int((time.monotonic() - start_time) * 1000)
        log_ptw_event(
            'bulk_export_pdf',
            user_id=request.user.id,
            project_id=getattr(request.user.project, 'id', None),
            permit_count=queryset.count(),
            duration_ms=duration_ms,
            outcome='success',
            export_type='pdf_zip'
        )
        
        return response

    @action(detail=False, methods=['post'], throttle_classes=[PTWBulkExportThrottle])
    def bulk_export_excel(self, request):
        """Bulk export permits as consolidated Excel - supports permit_ids OR filters"""
        start_time = time.monotonic()
        from .excel_utils import generate_excel_export
        
        if openpyxl is None:
            return Response(
                {'error': 'Excel export not available - openpyxl not installed'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get permit IDs from request OR use filters
        permit_ids = request.data.get('permit_ids', [])
        use_filters = request.data.get('use_filters', False)
        detailed = request.data.get('detailed', False)
        
        if use_filters or not permit_ids:
            # Apply filters from query params
            queryset = self.filter_queryset(self.get_queryset())
        else:
            # Use explicit permit IDs
            queryset = self.get_queryset().filter(id__in=permit_ids)
        
        # Enforce limit
        max_permits = getattr(settings, 'PTW_BULK_EXPORT_LIMIT', 200)
        if queryset.count() > max_permits:
            return Response(
                {'error': f'Too many permits. Maximum {max_permits} permits allowed per bulk export.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Optimize query
        queryset = queryset.select_related(
            'permit_type', 'project', 'created_by', 'issuer', 'receiver',
            'verifier', 'approved_by'
        ).prefetch_related(
            'isolation_points__point',
            'gas_readings',
            'closeout__template',
            'audit_logs'
        )
        
        if not queryset.exists():
            return Response(
                {'error': 'No permits found or you do not have permission to export them'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        wb = generate_excel_export(queryset, detailed=detailed)
        
        response = HttpResponse(
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        filename = f"permits_bulk_{'detailed_' if detailed else ''}{timezone.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        
        wb.save(response)
        
        # Log timing
        duration_ms = int((time.monotonic() - start_time) * 1000)
        log_ptw_event(
            'bulk_export_excel',
            user_id=request.user.id,
            project_id=getattr(request.user.project, 'id', None),
            permit_count=queryset.count(),
            detailed=detailed,
            duration_ms=duration_ms,
            outcome='success',
            export_type='excel'
        )
        
        return response

    @action(detail=True, methods=['get'])
    def closeout(self, request, pk=None):
        """Get closeout checklist for permit"""
        permit = self.get_object()
        
        # Get or create closeout record
        from .models import PermitCloseout, CloseoutChecklistTemplate
        from .serializers import PermitCloseoutSerializer
        
        closeout, created = PermitCloseout.objects.get_or_create(
            permit=permit,
            defaults={'template': self._get_closeout_template(permit)}
        )
        
        serializer = PermitCloseoutSerializer(closeout)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def update_closeout(self, request, pk=None):
        """Update closeout checklist items"""
        permit = self.get_object()
        
        from .models import PermitCloseout
        from .serializers import PermitCloseoutSerializer
        
        try:
            closeout = permit.closeout
        except PermitCloseout.DoesNotExist:
            closeout = PermitCloseout.objects.create(
                permit=permit,
                template=self._get_closeout_template(permit)
            )
        
        # Update checklist and remarks
        if 'checklist' in request.data:
            closeout.checklist = request.data['checklist']
        if 'remarks' in request.data:
            closeout.remarks = request.data['remarks']
        
        closeout.save()
        
        serializer = PermitCloseoutSerializer(closeout)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def complete_closeout(self, request, pk=None):
        """Mark closeout as completed"""
        permit = self.get_object()
        
        from .models import PermitCloseout
        from .serializers import PermitCloseoutSerializer
        
        try:
            closeout = permit.closeout
        except PermitCloseout.DoesNotExist:
            return Response(
                {'error': 'Closeout checklist not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Validate all required items are completed
        if not closeout.is_complete():
            missing = closeout.get_missing_required_items()
            return Response(
                {'error': f"Cannot complete closeout. Missing items: {', '.join(missing)}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Mark as completed
        closeout.completed = True
        closeout.completed_at = timezone.now()
        closeout.completed_by = request.user
        closeout.save()
        
        serializer = PermitCloseoutSerializer(closeout)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def readiness(self, request, pk=None):
        """Get permit readiness summary for transitions"""
        from .readiness import get_permit_readiness
        
        permit = self.get_object()
        readiness_data = get_permit_readiness(permit)
        
        return Response(readiness_data)
    
    def _get_closeout_template(self, permit):
        """Get appropriate closeout template for permit"""
        from .models import CloseoutChecklistTemplate
        
        # Try to find template matching permit_type and risk_level
        template = CloseoutChecklistTemplate.objects.filter(
            permit_type=permit.permit_type,
            risk_level=permit.risk_level,
            is_active=True
        ).first()
        
        # Fallback to permit_type only
        if not template:
            template = CloseoutChecklistTemplate.objects.filter(
                permit_type=permit.permit_type,
                risk_level__isnull=True,
                is_active=True
            ).first()
        
        return template
    
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated, CanManagePermits])
    def health(self, request):
        """PTW Health endpoint - admin only"""
        from .models import AppliedOfflineChange
        from django.db.models import Count
        from datetime import timedelta
        from .observability import PTWJobRun
        
        now = timezone.now()
        last_24h = now - timedelta(hours=24)
        
        # Sync stats from AppliedOfflineChange
        sync_stats = AppliedOfflineChange.objects.filter(
            applied_at__gte=last_24h
        ).values('entity').annotate(count=Count('id'))
        
        applied_last_24h = sum(item['count'] for item in sync_stats)
        
        # Workflow overdue counts
        queryset = self.get_queryset()
        overdue_verification = queryset.filter(
            status='submitted',
            created_at__lt=now - timedelta(hours=24)
        ).count()
        
        overdue_approval = queryset.filter(
            status='under_review',
            created_at__lt=now - timedelta(hours=48)
        ).count()
        
        # Job runs
        job_runs = PTWJobRun.get_runs()
        jobs_list = [
            {
                'name': name,
                'last_run_at': data.get('last_run_at'),
                'last_success_at': data.get('last_success_at'),
                'last_error': data.get('last_error'),
                'last_duration_ms': data.get('last_duration_ms')
            }
            for name, data in job_runs.items()
        ]
        
        return Response({
            'as_of': now.isoformat(),
            'sync': {
                'applied_last_24h': applied_last_24h,
                'conflicts_last_24h': 0,  # Would need separate tracking
                'rejected_last_24h': 0,  # Would need separate tracking
            },
            'exports': {
                'bulk_exports_last_24h': 0,  # Would need separate tracking
            },
            'workflow': {
                'overdue_verification': overdue_verification,
                'overdue_approval': overdue_approval,
            },
            'jobs': jobs_list
        })
    
    # Isolation Points Management
    
    @action(detail=False, methods=['get'])
    def reports_summary(self, request):
        """Get compliance report summary"""
        from .report_utils import get_report_summary
        from datetime import datetime
        
        queryset = self.filter_queryset(self.get_queryset())
        
        # Parse date params
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        
        if date_from:
            date_from = datetime.fromisoformat(date_from)
        if date_to:
            date_to = datetime.fromisoformat(date_to)
        
        summary = get_report_summary(queryset, date_from, date_to)
        return Response(summary)
    
    @action(detail=False, methods=['get'])
    def reports_exceptions(self, request):
        """Get compliance report exceptions"""
        from .report_utils import get_report_exceptions
        from datetime import datetime
        
        queryset = self.filter_queryset(self.get_queryset())
        
        # Parse date params
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        
        if date_from:
            date_from = datetime.fromisoformat(date_from)
        if date_to:
            date_to = datetime.fromisoformat(date_to)
        
        exceptions = get_report_exceptions(queryset, date_from, date_to)
        return Response(exceptions)
    @action(detail=True, methods=['get'])
    def isolation(self, request, pk=None):
        """Get isolation points for permit"""
        permit = self.get_object()
        from .models import PermitIsolationPoint
        from .serializers import PermitIsolationPointSerializer
        
        points = permit.isolation_points.all().select_related(
            'point', 'isolated_by', 'verified_by', 'deisolated_by'
        )
        serializer = PermitIsolationPointSerializer(points, many=True)
        
        # Summary stats
        total = points.count()
        required = points.filter(required=True).count()
        verified = points.filter(status='verified', required=True).count()
        deisolated = points.filter(status='deisolated', required=True).count()
        
        return Response({
            'points': serializer.data,
            'summary': {
                'total': total,
                'required': required,
                'verified': verified,
                'deisolated': deisolated,
                'pending_verification': required - verified
            }
        })
    
    @action(detail=True, methods=['post'])
    def assign_isolation(self, request, pk=None):
        """Assign isolation point(s) to permit"""
        permit = self.get_object()
        from .models import PermitIsolationPoint, IsolationPointLibrary
        from .serializers import PermitIsolationPointSerializer
        
        points_data = request.data if isinstance(request.data, list) else [request.data]
        created_points = []
        
        for point_data in points_data:
            point_id = point_data.get('point_id')
            
            if point_id:
                # Assign from library
                try:
                    library_point = IsolationPointLibrary.objects.get(id=point_id, is_active=True)
                    isolation_point = PermitIsolationPoint.objects.create(
                        permit=permit,
                        point=library_point,
                        required=point_data.get('required', True),
                        lock_count=library_point.default_lock_count,
                        order=point_data.get('order', 0)
                    )
                    created_points.append(isolation_point)
                except IsolationPointLibrary.DoesNotExist:
                    return Response(
                        {'error': f'Isolation point {point_id} not found'},
                        status=status.HTTP_404_NOT_FOUND
                    )
            else:
                # Create custom point
                isolation_point = PermitIsolationPoint.objects.create(
                    permit=permit,
                    custom_point_name=point_data.get('custom_point_name', ''),
                    custom_point_details=point_data.get('custom_point_details', ''),
                    required=point_data.get('required', True),
                    lock_count=point_data.get('lock_count', 1),
                    order=point_data.get('order', 0)
                )
                created_points.append(isolation_point)
        
        serializer = PermitIsolationPointSerializer(created_points, many=True)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['post'])
    def update_isolation(self, request, pk=None):
        """Update isolation point status (isolate/verify/deisolate)"""
        permit = self.get_object()
        from .models import PermitIsolationPoint
        from .serializers import PermitIsolationPointSerializer
        
        point_id = request.data.get('point_id')
        action_type = request.data.get('action')  # 'isolate', 'verify', 'deisolate'
        
        try:
            isolation_point = PermitIsolationPoint.objects.get(id=point_id, permit=permit)
        except PermitIsolationPoint.DoesNotExist:
            return Response(
                {'error': 'Isolation point not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        if action_type == 'isolate':
            isolation_point.status = 'isolated'
            isolation_point.lock_applied = request.data.get('lock_applied', True)
            isolation_point.lock_count = request.data.get('lock_count', isolation_point.lock_count)
            isolation_point.lock_ids = request.data.get('lock_ids', [])
            isolation_point.isolated_by = request.user
            isolation_point.isolated_at = timezone.now()
        
        elif action_type == 'verify':
            if isolation_point.status != 'isolated':
                return Response(
                    {'error': 'Point must be isolated before verification'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            isolation_point.status = 'verified'
            isolation_point.verified_by = request.user
            isolation_point.verified_at = timezone.now()
            isolation_point.verification_notes = request.data.get('verification_notes', '')
        
        elif action_type == 'deisolate':
            isolation_point.status = 'deisolated'
            isolation_point.deisolated_by = request.user
            isolation_point.deisolated_at = timezone.now()
            isolation_point.deisolated_notes = request.data.get('deisolated_notes', '')
        
        else:
            return Response(
                {'error': 'Invalid action. Use: isolate, verify, or deisolate'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        isolation_point.save()
        serializer = PermitIsolationPointSerializer(isolation_point)
        return Response(serializer.data)

    def get_client_ip(self, request):
        """Get client IP address"""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip

    def get_device_info(self, request):
        """Get device information"""
        return {
            'user_agent': request.META.get('HTTP_USER_AGENT', ''),
            'platform': request.META.get('HTTP_SEC_CH_UA_PLATFORM', ''),
            'mobile': request.META.get('HTTP_SEC_CH_UA_MOBILE', '') == '?1'
        }

# Additional ViewSets for related models
class PermitWorkerViewSet(PermitRelatedViewSet):
    queryset = PermitWorker.objects.all()
    serializer_class = PermitWorkerSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['permit', 'worker', 'role']
    
    def create(self, request, *args, **kwargs):
        # Restrict adding workers - only superadmin can add
        if not request.user.is_superuser:
            return Response(
                {'error': 'Adding workers to permits is restricted. Workers are assigned through external processes.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().create(request, *args, **kwargs)

class PermitApprovalViewSet(PermitRelatedViewSet):
    queryset = PermitApproval.objects.all()
    serializer_class = PermitApprovalSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['permit', 'approver', 'action', 'approval_level']

class PermitExtensionViewSet(PermitRelatedViewSet):
    queryset = PermitExtension.objects.all()
    serializer_class = PermitExtensionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['permit', 'status', 'requested_by']

class IsolationPointLibraryViewSet(PTWBaseViewSet):
    queryset = IsolationPointLibrary.objects.filter(is_active=True)
    serializer_class = IsolationPointLibrarySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['project', 'site', 'asset_tag', 'point_type', 'energy_type']
    search_fields = ['point_code', 'location', 'description', 'asset_tag']
    
    def get_queryset(self):
        queryset = super().get_queryset()
        # Filter by project if provided
        project = ensure_project(self.request)
        if project:
            queryset = queryset.filter(Q(project=project) | Q(project__isnull=True))
        return queryset

class PermitIsolationPointViewSet(PermitRelatedViewSet):
    queryset = PermitIsolationPoint.objects.all()
    serializer_class = PermitIsolationPointSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['permit', 'status', 'required']

# Removed WorkTimeExtensionViewSet - time management handled centrally

class PermitAuditViewSet(PTWReadOnlyViewSet):
    queryset = PermitAudit.objects.all()
    serializer_class = PermitAuditSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_class = PermitAuditFilter
    ordering = ['-timestamp']
    project_lookup = 'permit__project'
    # Pagination enabled by default

class GasReadingViewSet(PermitRelatedViewSet):
    queryset = GasReading.objects.all()
    serializer_class = GasReadingSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['permit', 'gas_type', 'status', 'tested_by']
    
    def get_queryset(self):
        queryset = super().get_queryset()
        # Project scoping: filter by user's project
        user_project = getattr(self.request.user, 'project', None)
        if user_project:
            queryset = queryset.filter(permit__project=user_project)
        return queryset
    
    def perform_create(self, serializer):
        # Ensure tested_by is current user
        serializer.save(tested_by=self.request.user)
    
    def update(self, request, *args, **kwargs):
        gas_reading = self.get_object()
        # Only allow updates if permit is not completed/cancelled/expired
        if gas_reading.permit.status in ['completed', 'cancelled', 'expired']:
            return Response(
                {'error': 'Cannot modify gas readings for completed permits'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().update(request, *args, **kwargs)
    
    def destroy(self, request, *args, **kwargs):
        gas_reading = self.get_object()
        # Only allow deletion if permit is not completed/cancelled/expired
        if gas_reading.permit.status in ['completed', 'cancelled', 'expired']:
            return Response(
                {'error': 'Cannot delete gas readings for completed permits'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().destroy(request, *args, **kwargs)

class PermitPhotoViewSet(PermitRelatedViewSet):
    queryset = PermitPhoto.objects.all()
    serializer_class = PermitPhotoSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['permit', 'photo_type', 'taken_by']

class DigitalSignatureViewSet(PTWReadOnlyViewSet):
    queryset = DigitalSignature.objects.all()
    serializer_class = DigitalSignatureSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['permit', 'signature_type', 'signatory']
    project_lookup = 'permit__project'

class WorkflowInstanceViewSet(PTWReadOnlyViewSet):
    queryset = WorkflowInstance.objects.all()
    serializer_class = WorkflowInstanceSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['permit', 'template', 'status']
    project_lookup = 'permit__project'

class SystemIntegrationViewSet(PTWBaseViewSet):
    queryset = SystemIntegration.objects.all()
    serializer_class = SystemIntegrationSerializer
    permission_classes = [IsAuthenticated, CanManagePermits]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['integration_type', 'status', 'is_active']
    project_required = False

    @action(detail=True, methods=['post'])
    def test_connection(self, request, pk=None):
        """Test integration connection"""
        integration = self.get_object()
        
        # Implementation for testing connection
        try:
            # Test connection logic here
            integration.status = 'connected'
            integration.last_sync = timezone.now()
            integration.save()
            
            return Response({'status': 'Connection successful'})
        except Exception as e:
            integration.status = 'error'
            integration.save()
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    def sync_data(self, request, pk=None):
        """Sync data with external system"""
        integration = self.get_object()
        
        try:
            integration.status = 'syncing'
            integration.save()
            
            # Sync logic here
            
            integration.status = 'connected'
            integration.last_sync = timezone.now()
            integration.save()
            
            return Response({'status': 'Sync completed successfully'})
        except Exception as e:
            integration.status = 'error'
            integration.save()
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

class ComplianceReportViewSet(PTWBaseViewSet):
    queryset = ComplianceReport.objects.all()
    serializer_class = ComplianceReportSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['report_type', 'generated_by']
    ordering = ['-generated_at']
    project_required = False

    def perform_create(self, serializer):
        """Generate compliance report"""
        report = serializer.save(generated_by=self.request.user)
        
        # Generate report data
        self.generate_report_data(report)

    def generate_report_data(self, report):
        """Generate report data based on type"""
        # Implementation for different report types
        pass

# API endpoints for mobile app
@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([PTWSyncThrottle])
def sync_offline_data(request):
    """Sync offline data with conflict resolution"""
    start_time = time.monotonic()
    from .conflict_utils import (
        check_idempotency, record_applied_change, detect_permit_conflicts,
        merge_permit_fields, validate_status_transition, get_server_state,
        detect_isolation_conflicts, merge_isolation_lock_ids,
        detect_closeout_conflicts, merge_closeout_checklist
    )
    from django.db.models import F
    
    try:
        ensure_tenant_context(request)
        enforce_collaboration_read_only(request, domain='ptw')
        user_project = ensure_project(request)
        
        device_id = request.data.get('device_id', 'unknown')
        changes = request.data.get('changes', [])
        
        applied = []
        conflicts = []
        rejected = []
        
        for change in changes:
            entity = change.get('entity')
            op = change.get('op')
            offline_id = change.get('offline_id')
            server_id = change.get('server_id')
            client_version = change.get('client_version')
            data = change.get('data', {})
            
            # Check idempotency
            existing = check_idempotency(device_id, offline_id, entity)
            if existing:
                applied.append({
                    'entity': entity,
                    'offline_id': offline_id,
                    'server_id': existing.server_id,
                    'status': 'already_applied'
                })
                continue
            
            try:
                with transaction.atomic():
                    if entity == 'permit':
                        if op == 'create':
                            serializer = PermitCreateUpdateSerializer(data=data)
                            if serializer.is_valid():
                                permit = serializer.save(
                                    created_by=request.user,
                                    project=user_project,
                                    offline_id=offline_id
                                )
                                record_applied_change(device_id, offline_id, entity, permit.id)
                                applied.append({
                                    'entity': entity,
                                    'offline_id': offline_id,
                                    'server_id': permit.id,
                                    'new_version': permit.version
                                })
                            else:
                                rejected.append({
                                    'entity': entity,
                                    'offline_id': offline_id,
                                    'reason': 'validation_error',
                                    'detail': serializer.errors
                                })
                        
                        elif op in ['update', 'update_status']:
                            if not server_id:
                                rejected.append({
                                    'entity': entity,
                                    'offline_id': offline_id,
                                    'reason': 'missing_server_id'
                                })
                                continue
                            
                            # Lock permit row for update
                            permit = Permit.objects.select_for_update().get(
                                id=server_id, project=user_project
                            )
                            
                            # Detect conflicts
                            conflict = detect_permit_conflicts(permit, data, client_version)
                            if conflict:
                                conflicts.append({
                                    'entity': entity,
                                    'offline_id': offline_id,
                                    'server_id': server_id,
                                    'reason': conflict['reason'],
                                    'client_version': client_version,
                                    'server_version': permit.version,
                                    'fields': conflict.get('fields', {}),
                                    'server_state': get_server_state(entity, server_id, project=user_project)
                                })
                                continue
                            
                            # Handle status update through canonical workflow manager
                            if op == 'update_status' and 'status' in data:
                                try:
                                    canonical_workflow_manager.transition(
                                        permit=permit,
                                        target_status=data['status'],
                                        actor=request.user,
                                        comments=data.get('comments', ''),
                                        context={'source': 'offline_sync'}
                                    )
                                    permit.refresh_from_db()
                                    record_applied_change(device_id, offline_id, entity, permit.id)
                                    applied.append({
                                        'entity': entity,
                                        'offline_id': offline_id,
                                        'server_id': permit.id,
                                        'new_version': permit.version
                                    })
                                except (PTWWorkflowError, PTWValidationError, PTWPermissionError) as e:
                                    conflicts.append({
                                        'entity': entity,
                                        'offline_id': offline_id,
                                        'server_id': server_id,
                                        'reason': 'workflow_error',
                                        'detail': e.message,
                                        'server_state': get_server_state(entity, server_id, project=user_project)
                                    })
                                    continue
                            else:
                                # Apply regular update
                                serializer = PermitCreateUpdateSerializer(permit, data=data, partial=True)
                                if serializer.is_valid():
                                    permit.version = F('version') + 1
                                    permit._current_user = request.user
                                    permit = serializer.save()
                                    permit.refresh_from_db()
                                    record_applied_change(device_id, offline_id, entity, permit.id)
                                    applied.append({
                                        'entity': entity,
                                        'offline_id': offline_id,
                                        'server_id': permit.id,
                                        'new_version': permit.version
                                    })
                                else:
                                    rejected.append({
                                        'entity': entity,
                                        'offline_id': offline_id,
                                        'reason': 'validation_error',
                                        'detail': serializer.errors
                                    })
                    
                    elif entity == 'isolation_point':
                        if op == 'update':
                            if not server_id:
                                rejected.append({
                                    'entity': entity,
                                    'offline_id': offline_id,
                                    'reason': 'missing_server_id'
                                })
                                continue
                            
                            # Lock isolation point for update
                            point = PermitIsolationPoint.objects.select_for_update().filter(
                                id=server_id,
                                permit__project=user_project
                            ).select_related('permit').first()
                            
                            if not point:
                                if PermitIsolationPoint.objects.filter(id=server_id).exists():
                                    rejected.append({
                                        'entity': entity,
                                        'offline_id': offline_id,
                                        'server_id': server_id,
                                        'reason': 'project_scope_violation'
                                    })
                                    continue
                                rejected.append({
                                    'entity': entity,
                                    'offline_id': offline_id,
                                    'server_id': server_id,
                                    'reason': 'isolation_point_not_found'
                                })
                                continue
                            
                            # Detect conflicts
                            conflict = detect_isolation_conflicts(point, data, client_version)
                            if conflict:
                                conflicts.append({
                                    'entity': entity,
                                    'offline_id': offline_id,
                                    'server_id': server_id,
                                    'reason': conflict['reason'],
                                    'client_version': client_version,
                                    'server_version': point.version,
                                    'fields': conflict.get('fields', {}),
                                    'detail': conflict.get('detail'),
                                    'server_state': get_server_state(entity, server_id, project=user_project)
                                })
                                continue
                            
                            # Apply update with version increment
                            for field, value in data.items():
                                if hasattr(point, field):
                                    setattr(point, field, value)
                            point.version = F('version') + 1
                            point.save()
                            point.refresh_from_db()
                            record_applied_change(device_id, offline_id, entity, point.id)
                            applied.append({
                                'entity': entity,
                                'offline_id': offline_id,
                                'server_id': point.id,
                                'new_version': point.version
                            })
                    
                    elif entity == 'closeout':
                        if op == 'update':
                            permit_id = data.get('permit_id') or server_id
                            if not permit_id:
                                rejected.append({
                                    'entity': entity,
                                    'offline_id': offline_id,
                                    'reason': 'missing_permit_id'
                                })
                                continue
                            
                            permit = Permit.objects.get(id=permit_id, project=user_project)
                            closeout, created = PermitCloseout.objects.get_or_create(permit=permit)
                            
                            if not created:
                                # Lock closeout for update
                                closeout = PermitCloseout.objects.select_for_update().get(id=closeout.id)
                                
                                # Detect conflicts
                                conflict = detect_closeout_conflicts(closeout, data, client_version)
                                if conflict:
                                    conflicts.append({
                                        'entity': entity,
                                        'offline_id': offline_id,
                                        'server_id': closeout.id,
                                        'reason': conflict['reason'],
                                        'client_version': client_version,
                                        'server_version': closeout.version,
                                        'fields': conflict.get('fields', {}),
                                        'server_state': get_server_state(entity, closeout.id, project=user_project)
                                    })
                                    continue
                            
                            # Apply update
                            if 'checklist' in data:
                                merge_closeout_checklist(closeout, data)
                            if 'remarks' in data:
                                closeout.remarks = data['remarks']
                            closeout.version = F('version') + 1
                            closeout.save()
                            closeout.refresh_from_db()
                            record_applied_change(device_id, offline_id, entity, closeout.id)
                            applied.append({
                                'entity': entity,
                                'offline_id': offline_id,
                                'server_id': closeout.id,
                                'new_version': closeout.version
                            })
            
            except Permit.DoesNotExist:
                rejected.append({
                    'entity': entity,
                    'offline_id': offline_id,
                    'reason': 'permit_not_found'
                })
            except PermitIsolationPoint.DoesNotExist:
                rejected.append({
                    'entity': entity,
                    'offline_id': offline_id,
                    'reason': 'isolation_point_not_found'
                })
            except Exception as e:
                rejected.append({
                    'entity': entity,
                    'offline_id': offline_id,
                    'reason': 'error',
                    'detail': str(e)
                })
        
        # Log timing and counts
        duration_ms = int((time.monotonic() - start_time) * 1000)
        log_ptw_event(
            'sync_offline_data',
            user_id=request.user.id,
            project_id=getattr(request.user.project, 'id', None),
            device_id=device_id,
            duration_ms=duration_ms,
            applied_count=len(applied),
            conflict_count=len(conflicts),
            rejected_count=len(rejected),
            outcome='success'
        )
        
        return Response({
            'applied': applied,
            'conflicts': conflicts,
            'rejected': rejected,
            'summary': {
                'total': len(changes),
                'applied': len(applied),
                'conflicts': len(conflicts),
                'rejected': len(rejected)
            }
        })
        
    except Exception as e:
        duration_ms = int((time.monotonic() - start_time) * 1000)
        log_ptw_event(
            'sync_offline_data',
            user_id=getattr(request.user, 'id', None),
            duration_ms=duration_ms,
            outcome='error',
            error_type=type(e).__name__
        )
        return Response(
            {'error': str(e)},
            status=status.HTTP_400_BAD_REQUEST
        )

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def qr_scan_permit(request, qr_code):
    """Get permit details from QR code with enhanced validation"""
    try:
        ensure_tenant_context(request)
        
        # Validate and decode QR code
        from .qr_utils import validate_qr_data
        qr_data, error = validate_qr_data(qr_code)
        
        if error:
            return Response(
                {'error': error},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        permit_id = qr_data.get('permit_id') or qr_data.get('id')
        
        if permit_id:
            permit = get_object_or_404(Permit, id=permit_id, project=ensure_project(request))
            
            # Create audit log for QR scan
            PermitAudit.objects.create(
                permit=permit,
                action='qr_scanned',
                user=request.user,
                comments='Permit accessed via QR code scan'
            )
            
            serializer = PermitSerializer(permit)
            response_data = serializer.data
            
            # Add QR metadata
            response_data['qr_metadata'] = {
                'scanned_at': timezone.now().isoformat(),
                'qr_version': qr_data.get('v', '1.0'),
                'offline_data_available': 'offline_data' in qr_data
            }
            
            # Include offline data if available
            if 'offline_data' in qr_data:
                response_data['offline_data'] = qr_data['offline_data']
            
            return Response(response_data)
        else:
            return Response(
                {'error': 'Invalid QR code - missing permit ID'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_400_BAD_REQUEST
        )

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def mobile_permit_view(request, permit_id):
    """Mobile-friendly permit view with enhanced offline support"""
    try:
        ensure_tenant_context(request)
        permit = get_object_or_404(Permit, id=permit_id, project=ensure_project(request))
        
        # Create audit log for mobile access
        PermitAudit.objects.create(
            permit=permit,
            action='mobile_viewed',
            user=request.user,
            comments='Permit viewed on mobile device'
        )
        
        # Enhanced permit data for mobile view
        permit_data = {
            'id': permit.id,
            'permit_number': permit.permit_number,
            'permit_type': {
                'name': permit.permit_type.name if permit.permit_type else 'Unknown',
                'category': permit.permit_type.category if permit.permit_type else '',
                'color_code': permit.permit_type.color_code if permit.permit_type else '#1890ff'
            },
            'status': permit.status,
            'location': permit.location,
            'description': permit.description,
            'planned_start_time': permit.planned_start_time.isoformat() if permit.planned_start_time else None,
            'planned_end_time': permit.planned_end_time.isoformat() if permit.planned_end_time else None,
            'actual_start_time': permit.actual_start_time.isoformat() if permit.actual_start_time else None,
            'actual_end_time': permit.actual_end_time.isoformat() if permit.actual_end_time else None,
            'risk_level': permit.risk_level,
            'risk_score': permit.risk_score,
            'created_by': {
                'username': permit.created_by.username if permit.created_by else 'Unknown',
                'full_name': permit.created_by.get_full_name() if permit.created_by else 'Unknown'
            },
            'created_at': permit.created_at.isoformat(),
            'control_measures': permit.control_measures,
            'ppe_requirements': permit.ppe_requirements,
            'special_instructions': permit.special_instructions,
            'work_nature': permit.work_nature,
            'work_hours_display': permit.get_work_hours_display(),
            'is_expired': permit.is_expired(),
            'duration_hours': permit.get_duration_hours(),
            
            # Additional mobile-specific data
            'issuer': {
                'name': permit.issuer.get_full_name() if permit.issuer else '',
                'designation': permit.issuer_designation,
                'contact': permit.issuer_contact
            },
            'receiver': {
                'name': permit.receiver.get_full_name() if permit.receiver else '',
                'designation': permit.receiver_designation,
                'contact': permit.receiver_contact
            },
            
            # Status indicators
            'status_indicators': {
                'is_active': permit.status == 'active',
                'is_overdue': permit.status == 'active' and permit.planned_end_time and timezone.now() > permit.planned_end_time,
                'requires_attention': permit.status in ['pending_verification', 'pending_approval'],
                'is_completed': permit.status == 'completed'
            },
            
            # Mobile metadata
            'mobile_metadata': {
                'last_updated': permit.updated_at.isoformat(),
                'version': permit.version,
                'can_update': request.user == permit.created_by or request.user == permit.receiver,
                'offline_capable': True
            }
        }
        
        # Add recent photos if any
        recent_photos = permit.photos.order_by('-taken_at')[:3]
        permit_data['recent_photos'] = [
            {
                'id': photo.id,
                'photo_type': photo.photo_type,
                'description': photo.description,
                'taken_at': photo.taken_at.isoformat(),
                'taken_by': photo.taken_by.username if photo.taken_by else ''
            }
            for photo in recent_photos
        ]
        
        # Add gas readings if any
        recent_readings = permit.gas_readings.order_by('-tested_at')[:3]
        permit_data['recent_gas_readings'] = [
            {
                'gas_type': reading.gas_type,
                'reading': reading.reading,
                'unit': reading.unit,
                'status': reading.status,
                'tested_at': reading.tested_at.isoformat()
            }
            for reading in recent_readings
        ]
        
        return Response(permit_data)
        
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_400_BAD_REQUEST
        )

# Work Hours Management API
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_work_time_settings(request):
    """Get current work time settings from master admin"""
    from .utils import get_work_time_settings
    
    settings = get_work_time_settings()
    
    return Response({
        'day_start': settings['day_start'].strftime('%H:%M'),
        'day_end': settings['day_end'].strftime('%H:%M'),
        'night_start': settings['night_start'].strftime('%H:%M'),
        'night_end': settings['night_end'].strftime('%H:%M'),
    })

# Online/Offline Status Management API
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def update_online_status(request):
    """Update user's online status for real-time collaboration"""
    try:
        ensure_tenant_context(request)
        
        status_type = request.data.get('status', 'online')  # online, offline, away
        device_info = request.data.get('device_info', {})
        location = request.data.get('location')
        
        # Update user's online status in cache
        cache_key = f"user_status_{request.user.id}"
        status_data = {
            'user_id': request.user.id,
            'username': request.user.username,
            'status': status_type,
            'last_seen': timezone.now().isoformat(),
            'device_info': device_info,
            'location': location
        }
        
        cache.set(cache_key, status_data, 300)  # 5 minutes
        
        return Response({
            'status': 'success',
            'user_status': status_data
        })
        
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_400_BAD_REQUEST
        )

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_online_users(request):
    """Get list of currently online users in the project"""
    try:
        ensure_tenant_context(request)
        project = ensure_project(request)
        
        # Get all users in the project
        project_users = project.users.all() if hasattr(project, 'users') else []
        
        online_users = []
        for user in project_users:
            cache_key = f"user_status_{user.id}"
            status_data = cache.get(cache_key)
            
            if status_data and status_data['status'] in ['online', 'away']:
                # Check if last seen is within 5 minutes
                last_seen = timezone.datetime.fromisoformat(status_data['last_seen'].replace('Z', '+00:00'))
                if (timezone.now() - last_seen).total_seconds() < 300:
                    online_users.append(status_data)
        
        return Response({
            'online_users': online_users,
            'total_online': len(online_users)
        })
        
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_400_BAD_REQUEST
        )

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_system_status(request):
    """Get system status for mobile app connectivity indicator"""
    try:
        from django.db import connection
        
        # Check database connectivity
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            db_status = 'healthy'
        
        # Check cache connectivity
        try:
            cache.set('health_check', 'ok', 10)
            cache_status = 'healthy' if cache.get('health_check') == 'ok' else 'unhealthy'
        except:
            cache_status = 'unhealthy'
        
        # Get server time
        server_time = timezone.now().isoformat()
        
        # Get basic stats
        user_project = getattr(request.user, 'project', None)
        if user_project:
            active_permits = Permit.objects.filter(
                project=user_project,
                status='active'
            ).count()
            pending_approvals = Permit.objects.filter(
                project=user_project,
                status__in=['pending_verification', 'pending_approval']
            ).count()
        else:
            active_permits = 0
            pending_approvals = 0
        
        return Response({
            'status': 'healthy',
            'server_time': server_time,
            'database': db_status,
            'cache': cache_status,
            'project_stats': {
                'active_permits': active_permits,
                'pending_approvals': pending_approvals
            },
            'user_info': {
                'id': request.user.id,
                'username': request.user.username,
                'project': user_project.name if user_project else None
            }
        })
        
    except Exception as e:
        return Response({
            'status': 'unhealthy',
            'error': str(e),
            'server_time': timezone.now().isoformat()
        }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
