from rest_framework import viewsets, permissions, status, filters
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db import models as db_models
from django.contrib.auth import get_user_model
from django.utils import timezone
from .models import ToolboxTalk, ToolboxTalkAttendance
from .serializers import ToolboxTalkSerializer, ToolboxTalkAttendanceSerializer, UserMinimalSerializer
from .permissions import IsCreatorOrReadOnly
from worker.models import Worker
from worker.serializers import WorkerSerializer
from authentication.tenant_scoped_utils import ensure_tenant_context, ensure_project, enforce_collaboration_read_only
from authentication.tenant_scoped import TenantScopedViewSet
import logging
import base64
from django.core.files.base import ContentFile

User = get_user_model()
logger = logging.getLogger(__name__)


def _send_tbt_notification(tbt, event, user_ids):
    """Send in-app notifications to participants."""
    try:
        from authentication.models_notification import Notification
        messages = {
            'created': f'TBT "{tbt.title}" has been created and scheduled.',
            'scheduled': f'TBT "{tbt.title}" is scheduled for {tbt.date}.',
            'completed': f'TBT "{tbt.title}" has been completed.',
            'ptw_generated': f'PTW has been generated from TBT "{tbt.title}".',
        }
        msg = messages.get(event, f'TBT "{tbt.title}" update: {event}')
        for uid in user_ids:
            try:
                Notification.objects.create(
                    user_id=uid,
                    title=f'TBT {event.replace("_", " ").title()}',
                    message=msg,
                    notification_type='tbt',
                    related_object_id=tbt.id,
                    related_object_type='toolboxtalk',
                )
            except Exception:
                pass
    except Exception as e:
        logger.warning(f"TBT notification failed: {e}")


def _get_participant_user_ids(tbt):
    """Return all user IDs to notify (creator + user_participants)."""
    ids = set()
    ids.add(tbt.created_by_id)
    ids.update(tbt.user_participants.values_list('id', flat=True))
    return list(ids)


class ToolboxTalkViewSet(TenantScopedViewSet):
    serializer_class = ToolboxTalkSerializer
    permission_classes = [permissions.IsAuthenticated, IsCreatorOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'date', 'created_by', 'training_type']
    search_fields = ['title', 'location', 'conducted_by']
    ordering_fields = ['date', 'title', 'created_at', 'status']
    ordering = ['-date']
    model = ToolboxTalk
    collaboration_enabled = True
    collaboration_domain = 'tbt'

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return ToolboxTalk.objects.none()
        if user.is_superuser:
            return ToolboxTalk.objects.all()
        return super().get_queryset()

    def perform_create(self, serializer):
        project = self.get_user_project()
        tbt = serializer.save(created_by=self.request.user, project=project)
        logger.info("TBT created: ID=%s Title=%s User=%s", tbt.id, tbt.title, self.request.user.id)
        _send_tbt_notification(tbt, 'created', _get_participant_user_ids(tbt))

    def perform_update(self, serializer):
        tbt = serializer.save()
        logger.info("TBT updated: ID=%s Status=%s", tbt.id, tbt.status)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Mark TBT as completed, save attendance and discussion, then notify."""
        tbt = self.get_object()
        enforce_collaboration_read_only(request, domain='tbt')

        if tbt.status in ('ptw_generated', 'cancelled'):
            return Response(
                {'error': f'Cannot complete a TBT with status "{tbt.status}"'},
                status=status.HTTP_400_BAD_REQUEST
            )

        completion_notes = request.data.get('completion_notes', '')
        discussion_points = request.data.get('discussion_points')
        attendance_data = request.data.get('attendance', [])

        if discussion_points is not None:
            tbt.discussion_points = discussion_points

        tbt.status = 'completed'
        tbt.completion_notes = completion_notes
        tbt.completed_at = timezone.now()
        tbt.completed_by = request.user
        tbt.save()

        # Save attendance records
        created_count = 0
        for record in attendance_data:
            participant_type = record.get('participant_type', 'worker')
            pid = record.get('participant_id') or record.get('worker_id')
            att_status = record.get('status', 'present')
            if not pid:
                continue
            try:
                if participant_type == 'worker':
                    worker = Worker.objects.get(id=pid)
                    ToolboxTalkAttendance.objects.update_or_create(
                        toolbox_talk=tbt, worker=worker,
                        defaults={'status': att_status, 'athens_tenant_id': tbt.athens_tenant_id}
                    )
                else:
                    user = User.objects.get(id=pid)
                    ToolboxTalkAttendance.objects.update_or_create(
                        toolbox_talk=tbt, user_participant=user,
                        defaults={'status': att_status, 'athens_tenant_id': tbt.athens_tenant_id}
                    )
                created_count += 1
            except Exception as e:
                logger.warning("Attendance save failed for pid=%s: %s", pid, e)

        _send_tbt_notification(tbt, 'completed', _get_participant_user_ids(tbt))
        serializer = self.get_serializer(tbt)
        return Response({
            'message': 'TBT completed successfully',
            'attendance_saved': created_count,
            'tbt': serializer.data,
        })

    @action(detail=True, methods=['post'])
    def generate_ptw(self, request, pk=None):
        """Auto-generate a PTW from completed TBT data."""
        tbt = self.get_object()
        enforce_collaboration_read_only(request, domain='tbt')

        if tbt.status not in ('completed', 'ptw_generated'):
            return Response(
                {'error': 'TBT must be completed before generating a PTW'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if tbt.generated_ptw_id:
            return Response({
                'message': 'PTW already generated',
                'ptw_id': tbt.generated_ptw_id,
            })

        try:
            from ptw.models import Permit, PermitType, PermitWorker
            from ptw.serializers import PermitCreateUpdateSerializer

            # Pick first active permit type (General/Construction fallback)
            permit_type = (
                PermitType.objects.filter(is_active=True, category='construction').first()
                or PermitType.objects.filter(is_active=True).first()
            )
            if not permit_type:
                return Response(
                    {'error': 'No active permit type found. Please create a permit type first.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Build description from discussion points
            def _extract(dp_type):
                return '\n'.join(
                    d.get('content', '') for d in tbt.discussion_points
                    if d.get('type') == dp_type and d.get('content')
                )

            work_desc = _extract('work_description') or tbt.description or tbt.title
            hazard_text = _extract('hazard') or ''
            precautions = _extract('precautions') or ''
            ppe_text = _extract('ppe') or ''
            emergency_text = _extract('emergency') or ''

            control_measures = '\n'.join(filter(None, [precautions, emergency_text]))
            ppe_list = [p.strip() for p in ppe_text.split('\n') if p.strip()] if ppe_text else []

            # Timing
            from django.utils import timezone as tz
            import datetime
            tbt_date = tbt.date
            start_dt = tz.make_aware(datetime.datetime.combine(
                tbt_date,
                tbt.start_time or datetime.time(8, 0)
            ))
            end_dt = tz.make_aware(datetime.datetime.combine(
                tbt_date,
                tbt.end_time or datetime.time(17, 0)
            ))

            permit = Permit.objects.create(
                permit_type=permit_type,
                title=tbt.title,
                description=work_desc,
                location=tbt.work_area or tbt.location,
                planned_start_time=start_dt,
                planned_end_time=end_dt,
                control_measures=control_measures,
                ppe_requirements=ppe_list,
                special_instructions=hazard_text,
                created_by=request.user,
                project=tbt.project,
                status='draft',
            )
            permit._current_user = request.user

            # Assign TBT user participants as PTW workers (via PermitWorker)
            for u in tbt.user_participants.all():
                try:
                    PermitWorker.objects.create(
                        permit=permit,
                        worker=None,
                        assigned_by=request.user,
                        role='authorized_worker',
                    )
                except Exception:
                    pass

            # Link TBT → PTW
            tbt.generated_ptw_id = permit.id
            tbt.status = 'ptw_generated'
            tbt.save(update_fields=['generated_ptw_id', 'status'])

            _send_tbt_notification(tbt, 'ptw_generated', _get_participant_user_ids(tbt))

            logger.info("PTW generated from TBT: TBT=%s PTW=%s", tbt.id, permit.id)
            return Response({
                'message': 'PTW generated successfully from TBT',
                'ptw_id': permit.id,
                'permit_number': permit.permit_number,
                'tbt_id': tbt.id,
                'generated_from_tbt': True,
                'source_tbt_id': tbt.id,
            }, status=status.HTTP_201_CREATED)

        except Exception as e:
            logger.error("PTW generation failed for TBT %s: %s", tbt.id, e, exc_info=True)
            return Response(
                {'error': f'PTW generation failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['get', 'post'])
    def attendance(self, request, pk=None):
        tbt = self.get_object()

        if request.method == 'GET':
            records = ToolboxTalkAttendance.objects.filter(toolbox_talk=tbt)
            serializer = ToolboxTalkAttendanceSerializer(records, many=True)
            return Response(serializer.data)

        # POST
        enforce_collaboration_read_only(request, domain='tbt')
        attendance_records = request.data.get('attendance_records', [])
        evidence_photo = request.data.get('evidence_photo')

        if not attendance_records:
            return Response({'error': 'No attendance records provided'}, status=status.HTTP_400_BAD_REQUEST)

        ToolboxTalkAttendance.objects.filter(toolbox_talk=tbt).delete()
        created = []
        failed = []

        for record in attendance_records:
            participant_type = record.get('participant_type', 'worker')
            pid = record.get('participant_id') or record.get('worker_id')
            att_photo = record.get('attendance_photo', '')
            if not pid:
                failed.append({'record': record, 'error': 'Missing participant_id'})
                continue
            try:
                if participant_type == 'worker':
                    worker = Worker.objects.get(id=pid, project=request.user.project)
                    att = ToolboxTalkAttendance.objects.create(
                        toolbox_talk=tbt, worker=worker, status='present',
                        athens_tenant_id=tbt.athens_tenant_id
                    )
                else:
                    user = User.objects.get(id=pid)
                    att = ToolboxTalkAttendance.objects.create(
                        toolbox_talk=tbt, user_participant=user, status='present',
                        athens_tenant_id=tbt.athens_tenant_id
                    )
                if att_photo and att_photo.startswith('data:image'):
                    fmt, imgstr = att_photo.split(';base64,')
                    ext = fmt.split('/')[-1]
                    att.attendance_photo = ContentFile(
                        base64.b64decode(imgstr),
                        name=f"att_{pid}_{tbt.id}.{ext}"
                    )
                    att.save()
                created.append(att)
            except Exception as e:
                failed.append({'record': record, 'error': str(e)})

        if evidence_photo and evidence_photo.startswith('data:image'):
            fmt, imgstr = evidence_photo.split(';base64,')
            ext = fmt.split('/')[-1]
            tbt.evidence_photo = ContentFile(base64.b64decode(imgstr), name=f"ev_{tbt.id}.{ext}")
        tbt.status = 'completed'
        tbt.save()

        return Response({
            'message': 'Attendance submitted successfully',
            'records_created': len(created),
            'failed_records': failed,
        }, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_toolbox_talk(request):
    """Standalone create endpoint."""
    ensure_tenant_context(request)
    enforce_collaboration_read_only(request, domain='tbt')
    project = ensure_project(request)

    logger.info("TBT create: title=%s status=%s user=%s",
                request.data.get('title'), request.data.get('status'), request.user.id)

    serializer = ToolboxTalkSerializer(data=request.data, context={'request': request})
    if serializer.is_valid():
        tbt = serializer.save(created_by=request.user, project=project)
        logger.info("TBT created: ID=%s", tbt.id)
        _send_tbt_notification(tbt, 'created', _get_participant_user_ids(tbt))
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    logger.warning("TBT creation failed: %s", serializer.errors)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def participants_search(request):
    """Search users and workers for participant selection."""
    ensure_tenant_context(request)
    user_project = ensure_project(request)
    query = request.query_params.get('q', '').strip()
    department = request.query_params.get('department', '').strip()

    results = []

    # Users (admins, supervisors, employees)
    users_qs = User.objects.filter(project=user_project, is_active=True)
    if query:
        users_qs = users_qs.filter(
            db_models.Q(name__icontains=query) |
            db_models.Q(surname__icontains=query) |
            db_models.Q(email__icontains=query) |
            db_models.Q(username__icontains=query)
        )
    if department:
        users_qs = users_qs.filter(department__icontains=department)

    for u in users_qs[:20]:
        photo_url = None
        try:
            if hasattr(u, 'user_detail') and u.user_detail and u.user_detail.photo:
                photo_url = request.build_absolute_uri(u.user_detail.photo.url)
        except Exception:
            pass
        results.append({
            'id': u.id,
            'name': f"{u.name or ''} {u.surname or ''}".strip() or u.username,
            'email': u.email or '',
            'department': u.department or '',
            'designation': u.designation or '',
            'participant_type': 'user',
            'photo': photo_url,
        })

    # Workers
    workers_qs = Worker.objects.filter(project=user_project)
    if query:
        workers_qs = workers_qs.filter(
            db_models.Q(name__icontains=query) |
            db_models.Q(surname__icontains=query)
        )
    if department:
        workers_qs = workers_qs.filter(department__icontains=department)

    for w in workers_qs[:20]:
        photo_url = None
        try:
            if w.photo:
                photo_url = request.build_absolute_uri(w.photo.url)
        except Exception:
            pass
        results.append({
            'id': w.id,
            'name': f"{w.name} {w.surname or ''}".strip(),
            'email': getattr(w, 'email', '') or '',
            'department': getattr(w, 'department', '') or '',
            'designation': getattr(w, 'designation', '') or '',
            'participant_type': 'worker',
            'photo': photo_url,
        })

    return Response({'results': results, 'count': len(results)})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def user_list(request):
    ensure_tenant_context(request)
    user_project = ensure_project(request)
    users = User.objects.filter(user_type='adminuser', project=user_project)
    data = [{
        'id': u.id,
        'username': u.username,
        'name': f"{getattr(u, 'name', '')} {getattr(u, 'surname', '')}".strip() or u.username,
        'email': u.email or ''
    } for u in users]
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def user_search(request):
    ensure_tenant_context(request)
    user_project = ensure_project(request)
    query = request.query_params.get('q', '')
    users_qs = User.objects.filter(project=user_project)
    if hasattr(User, 'user_type'):
        users_qs = users_qs.filter(user_type='adminuser')
    if query:
        users_qs = users_qs.filter(
            db_models.Q(username__icontains=query) |
            db_models.Q(email__icontains=query) |
            db_models.Q(name__icontains=query) |
            db_models.Q(surname__icontains=query)
        )
    data = [{
        'id': u.id,
        'username': u.username,
        'name': f"{getattr(u, 'name', '')} {getattr(u, 'surname', '')}".strip() or u.username,
        'email': getattr(u, 'email', '') or ''
    } for u in users_qs[:10]]
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def trained_personnel(request):
    try:
        from inductiontraining.models import InductionAttendance, InductionTraining
        ensure_tenant_context(request)
        user_project = ensure_project(request)

        project_inductions = InductionTraining.objects.filter(project=user_project, status='completed')
        trained_attendance = InductionAttendance.objects.filter(
            induction__in=project_inductions, status='present'
        ).select_related('induction').order_by('-induction__date', 'worker_name')

        worker_records = trained_attendance.filter(participant_type='worker', worker_id__gt=0)
        user_records = trained_attendance.filter(participant_type='user', worker_id__lt=0)

        trained_worker_ids = list(worker_records.values_list('worker_id', flat=True).distinct())
        trained_user_ids = [-i for i in user_records.values_list('worker_id', flat=True).distinct()]

        trained_workers = Worker.objects.filter(id__in=trained_worker_ids, project=user_project)
        trained_users = User.objects.filter(id__in=trained_user_ids, project=user_project)

        workers_data = []
        for w in trained_workers:
            wd = WorkerSerializer(w, context={'request': request}).data
            wd['participant_type'] = 'worker'
            wd['participant_id'] = w.id
            if wd.get('photo') and not wd['photo'].startswith('http'):
                wd['photo'] = request.build_absolute_uri(wd['photo'])
            workers_data.append(wd)

        users_data = []
        for u in trained_users:
            ud = {
                'id': u.id, 'name': u.name or '', 'surname': u.surname or '',
                'email': u.email or '', 'username': u.username,
                'department': getattr(u, 'department', ''),
                'designation': getattr(u, 'designation', ''),
                'participant_type': 'user', 'participant_id': u.id,
            }
            try:
                if hasattr(u, 'user_detail') and u.user_detail and u.user_detail.photo:
                    ud['photo'] = request.build_absolute_uri(u.user_detail.photo.url)
            except Exception:
                ud['photo'] = None
            users_data.append(ud)

        all_trained = workers_data + users_data
        return Response({
            'count': len(all_trained),
            'workers': workers_data,
            'users': users_data,
            'all_participants': all_trained,
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def submit_attendance(request):
    ensure_tenant_context(request)
    enforce_collaboration_read_only(request, domain='tbt')
    tbt_id = request.data.get('toolbox_talk_id')
    attendance_records = request.data.get('attendance_records', [])

    if not tbt_id:
        return Response({'error': 'Toolbox talk ID is required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        tbt = ToolboxTalk.objects.get(id=tbt_id)
    except ToolboxTalk.DoesNotExist:
        return Response({'error': 'Toolbox talk not found'}, status=status.HTTP_404_NOT_FOUND)

    ToolboxTalkAttendance.objects.filter(toolbox_talk=tbt).delete()
    created, failed = [], []

    for record in attendance_records:
        participant_type = record.get('participant_type', 'worker')
        pid = record.get('participant_id') or record.get('worker_id')
        if not pid:
            failed.append({'record': record, 'error': 'Missing participant_id'})
            continue
        try:
            if participant_type == 'worker':
                worker = Worker.objects.get(id=pid)
                att = ToolboxTalkAttendance.objects.create(
                    toolbox_talk=tbt, worker=worker, status='present',
                    athens_tenant_id=tbt.athens_tenant_id
                )
            else:
                user = User.objects.get(id=pid)
                att = ToolboxTalkAttendance.objects.create(
                    toolbox_talk=tbt, user_participant=user, status='present',
                    athens_tenant_id=tbt.athens_tenant_id
                )
            created.append(att)
        except Exception as e:
            failed.append({'record': record, 'error': str(e)})

    tbt.status = 'completed'
    tbt.save()

    return Response({
        'message': 'Attendance submitted successfully',
        'records_created': len(created),
        'failed_records': failed,
    }, status=status.HTTP_201_CREATED)
