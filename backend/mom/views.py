from rest_framework import generics, permissions, status
from .models import Mom, ParticipantResponse, ParticipantAttendance, MeetingQRToken, MeetingAttendanceLog
from .serializers import MomSerializer, ParticipantResponseSerializer, ParticipantResponseCreateSerializer, ParticipantListSerializer, MomLiveSerializer
from authentication.models import CustomUser
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.utils.timezone import now
from permissions.decorators import require_permission
from django.utils._os import safe_join
from django.conf import settings
from .notification_utils import (
    send_meeting_invitation_notification,
    send_meeting_response_notification,
    send_meeting_completion_notification,
    send_task_assignment_notification
)
import os
import secrets
import qrcode
import qrcode.image.svg
import io
import base64
from django.utils import timezone
from datetime import timedelta
from django.db.models import Q

class IsAdminUser(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False

        user_type = getattr(request.user, 'user_type', None)
        admin_type = getattr(request.user, 'admin_type', None)

        if user_type == 'adminuser':
            return True

        if user_type == 'companyuser' and admin_type in ['client', 'epc', 'contractor', 'clientuser', 'epcuser', 'contractoruser']:
            return True

        return False

class CanScheduleMom(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user.is_authenticated:
            return False
        user_type = getattr(user, 'user_type', None)
        admin_type = getattr(user, 'admin_type', None)
        role_type = getattr(user, 'role_type', None)
        # Allow adminuser, all companyuser admin types, and role_type=user
        if user_type == 'adminuser':
            return True
        if user_type == 'companyuser':
            allowed = ['client', 'epc', 'contractor', 'clientuser', 'epcuser', 'contractoruser']
            if admin_type in allowed or role_type == 'user':
                return True
        return False

class MomCreateView(generics.CreateAPIView):
    queryset = Mom.objects.all()
    serializer_class = MomSerializer
    permission_classes = [permissions.IsAuthenticated, CanScheduleMom]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    def perform_create(self, serializer):
        try:
            project = self.request.user.project
        except Exception:
            project = None

        mom = serializer.save(
            scheduled_by=self.request.user,
            project=project
        )
        # CRITICAL: Always add creator as participant for visibility in their own list
        mom.participants.add(self.request.user)
        mom.save()  # Ensure M2M is committed

        participant_ids = list(mom.participants.values_list('id', flat=True))
        print(f"[MOM CREATE] id={mom.id} title='{mom.title}' "
              f"scheduled_by={self.request.user.id} project={project} "
              f"participants={participant_ids} creator_added={self.request.user.id in participant_ids}")

        meeting_data = {
            'id': mom.id,
            'title': mom.title,
            'meeting_datetime': mom.meeting_datetime.isoformat() if mom.meeting_datetime else None,
            'location': mom.location,
            'agenda': mom.agenda
        }

        # Notify all participants including the creator
        for participant in mom.participants.all():
            try:
                send_meeting_invitation_notification(
                    participant_user_id=participant.id,
                    meeting_data=meeting_data,
                    scheduler_user_id=self.request.user.id
                )
            except Exception:
                pass
        print(f"[MOM CREATE] notifications sent to {len(participant_ids)} users")

class MomUpdateView(generics.RetrieveUpdateAPIView):
    queryset = Mom.objects.select_related('scheduled_by', 'project').prefetch_related('participants')
    serializer_class = MomSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_serializer_context(self):
        """Pass request context to serializer for permission checks"""
        context = super().get_serializer_context()
        context['request'] = self.request
        return context
    
    def get_object(self):
        obj = super().get_object()
        print("Meeting ID:", self.kwargs.get('pk'))
        # Allow access if same project OR user has no project (project-admin without project)
        if user_project := getattr(self.request.user, 'project', None):
            if obj.project and obj.project != user_project:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("You can only access meetings from your project.")
        return obj
    
    def update(self, request, *args, **kwargs):
        obj = self.get_object()
        # Only the creator can edit the MOM
        if obj.scheduled_by != request.user:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only the meeting creator can edit this meeting.")
        return super().update(request, *args, **kwargs)
    
    def partial_update(self, request, *args, **kwargs):
        obj = self.get_object()
        # Only the creator can edit the MOM
        if obj.scheduled_by != request.user:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only the meeting creator can edit this meeting.")
        return super().partial_update(request, *args, **kwargs)

class MomListView(generics.ListAPIView):
    serializer_class = MomSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    def get_queryset(self):
        user = self.request.user
        print(f"[MOM LIST] user={user.id} user_type={getattr(user,'user_type',None)} "
              f"role_type={getattr(user,'role_type',None)} project_id={getattr(user,'project_id',None)}")

        from django.db.models import Q

        # Superuser / master admin sees everything
        if user.is_superuser or (hasattr(user, 'admin_type') and user.admin_type in ['master', 'masteradmin']):
            qs = Mom.objects.select_related('scheduled_by', 'project').prefetch_related('participants').order_by('-created_at')
            print(f"[MOM LIST] superadmin/master — total={qs.count()}")
            return qs

        # Visibility: creator OR participant (no project scoping — avoids FK mismatch)
        # scheduled_by covers meetings created by this user even if not in participants M2M
        queryset = (
            Mom.objects
            .select_related('scheduled_by', 'project')
            .prefetch_related('participants')
            .filter(Q(scheduled_by=user) | Q(participants__id=user.id))
            .distinct()
            .order_by('-created_at')
        )

        count = queryset.count()
        print(f"[MOM LIST] queryset count={count} for user={user.id}")
        return queryset

class MomDeleteView(generics.DestroyAPIView):
    queryset = Mom.objects.all()
    serializer_class = MomSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_object(self):
        obj = super().get_object()
        if user_project := getattr(self.request.user, 'project', None):
            if obj.project and obj.project != user_project:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("You can only access meetings from your project.")
        return obj
        return obj
    
    def destroy(self, request, *args, **kwargs):
        obj = self.get_object()
        # Only the creator can delete the MOM
        if obj.scheduled_by != request.user:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only the meeting creator can delete this meeting.")
        return super().destroy(request, *args, **kwargs)

class ParticipantResponseView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, mom_id, user_id):
        # Check if the requesting user is the same as the user_id in the URL
        if request.user.id != user_id:
            return Response({
                'error': 'You can only view your own response status',
                'code': 'UNAUTHORIZED_USER'
            }, status=status.HTTP_403_FORBIDDEN)

        # Check if the meeting exists
        try:
            mom = Mom.objects.get(id=mom_id)
        except Mom.DoesNotExist:
            return Response({
                'error': 'Meeting not found',
                'code': 'MEETING_NOT_FOUND'
            }, status=status.HTTP_404_NOT_FOUND)

        # Check if the user is actually a participant in this meeting
        if not mom.participants.filter(id=user_id).exists():
            return Response({
                'error': 'You are not a participant in this meeting',
                'code': 'NOT_A_PARTICIPANT',
                'meeting_title': mom.title,
                'meeting_datetime': mom.meeting_datetime.isoformat(),
                'message': f'You are not invited to the meeting "{mom.title}". Please contact the meeting organizer if you believe this is an error.'
            }, status=status.HTTP_403_FORBIDDEN)

        participant_response = ParticipantResponse.objects.filter(mom_id=mom_id, user_id=user_id).first()
        if participant_response:
            serializer = ParticipantResponseSerializer(participant_response)
            return Response(serializer.data)
        else:
            # If no response exists, return pending status with user info
            user = request.user
            return Response({
                'status': 'pending',
                'name': user.name or user.username,
                'email': user.email,
                'company_name': getattr(user, 'company_name', ''),
                'designation': getattr(user, 'designation', '')
            })

    def post(self, request, mom_id, user_id):
        # Get the meeting to check its status
        mom = get_object_or_404(Mom, id=mom_id)

        # Check if meeting is already live or completed
        if mom.status == Mom.MeetingStatus.LIVE:
            return Response({
                'error': 'Meeting is already live',
                'message': 'This meeting is currently in progress. You cannot respond to the invitation at this time.',
                'meeting_status': 'live'
            }, status=status.HTTP_400_BAD_REQUEST)

        if mom.status == Mom.MeetingStatus.COMPLETED:
            return Response({
                'error': 'Meeting has ended',
                'message': 'This meeting has already been completed. You cannot respond to the invitation.',
                'meeting_status': 'completed'
            }, status=status.HTTP_400_BAD_REQUEST)

        if mom.status == Mom.MeetingStatus.CANCELLED:
            return Response({
                'error': 'Meeting was cancelled',
                'message': 'This meeting has been cancelled.',
                'meeting_status': 'cancelled'
            }, status=status.HTTP_400_BAD_REQUEST)

        # Check if user is actually a participant
        if not mom.participants.filter(id=user_id).exists():
            return Response({
                'error': 'Not a participant',
                'message': 'You are not invited to this meeting.'
            }, status=status.HTTP_403_FORBIDDEN)

        participant_response, created = ParticipantResponse.objects.get_or_create(mom_id=mom_id, user_id=user_id)
        old_status = participant_response.status if not created else None

        serializer = ParticipantResponseCreateSerializer(participant_response, data=request.data)
        if serializer.is_valid():
            # Store original status for signal detection
            if not created:
                participant_response._original_status = old_status
            serializer.save()
            
            # Send response notification to scheduler
            try:
                participant_data = {
                    'name': request.user.name or request.user.username,
                    'email': request.user.email
                }
                meeting_data = {
                    'id': mom.id,
                    'title': mom.title
                }
                
                send_meeting_response_notification(
                    scheduler_user_id=mom.scheduled_by.id,
                    participant_data=participant_data,
                    meeting_data=meeting_data,
                    response_status=serializer.data['status'],
                    sender_id=request.user.id
                )
            except Exception as e:
                pass

            return Response({
                'status': serializer.data['status'],
                'message': f'You have {serializer.data["status"]} the meeting invitation.',
                'meeting_status': mom.status,
                'scheduled_by': mom.scheduled_by.id,
                'meeting_title': mom.title
            })
        else:
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ParticipantAcceptView(APIView):
    """Direct accept endpoint for notification links"""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, mom_id, user_id):
        # Reuse the logic from ParticipantResponseView
        view = ParticipantResponseView()
        view.request = request
        view.format_kwarg = None

        # Create a new request with 'accepted' status
        request.data = {'status': 'accepted'}
        return view.post(request, mom_id, user_id)

    def get(self, request, mom_id, user_id):
        """Handle GET requests from notification links"""
        return self.post(request, mom_id, user_id)


class ParticipantRejectView(APIView):
    """Direct reject endpoint for notification links"""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, mom_id, user_id):
        # Reuse the logic from ParticipantResponseView
        view = ParticipantResponseView()
        view.request = request
        view.format_kwarg = None

        # Create a new request with 'rejected' status
        request.data = {'status': 'rejected'}
        return view.post(request, mom_id, user_id)

    def get(self, request, mom_id, user_id):
        """Handle GET requests from notification links"""
        return self.post(request, mom_id, user_id)


class ParticipantListView(generics.ListAPIView):
    serializer_class = ParticipantListSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        mom_id = self.kwargs['mom_id']
        return ParticipantResponse.objects.filter(mom_id=mom_id).select_related('user')


class MeetingInfoView(APIView):
    """
    Get basic meeting info without requiring participant status
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, mom_id):
        try:
            mom = Mom.objects.get(id=mom_id)

            # PROJECT ISOLATION: only enforce when both user and meeting have a project
            user_project = getattr(request.user, 'project', None)
            if user_project and mom.project and mom.project != user_project:
                return Response({
                    'error': 'You can only access meetings from your project'
                }, status=status.HTTP_403_FORBIDDEN)
            
            is_participant = mom.participants.filter(id=request.user.id).exists()
            is_creator = mom.scheduled_by == request.user
            can_view = is_creator or is_participant or mom.status == Mom.MeetingStatus.COMPLETED
            
            if not can_view:
                return Response({
                    'error': 'You do not have permission to view this meeting'
                }, status=status.HTTP_403_FORBIDDEN)

            return Response({
                'id': mom.id,
                'title': mom.title,
                'meeting_datetime': mom.meeting_datetime.isoformat(),
                'location': mom.location,
                'department': mom.department,
                'status': mom.status,
                'is_participant': is_participant,
                'is_creator': is_creator,
                'can_edit': is_creator,
                'can_delete': is_creator,
                'scheduled_by': {
                    'id': mom.scheduled_by.id,
                    'name': mom.scheduled_by.name or mom.scheduled_by.username,
                    'email': mom.scheduled_by.email
                }
            })
        except Mom.DoesNotExist:
            return Response({
                'error': 'Meeting not found'
            }, status=status.HTTP_404_NOT_FOUND)

# Existing Notification and Mom views omitted for brevity, keep them unchanged

class MomLiveView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        mom = get_object_or_404(Mom, pk=pk)

        # PROJECT ISOLATION: only enforce when both user and meeting have a project
        user_project = getattr(request.user, 'project', None)
        if user_project and mom.project and mom.project != user_project:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You can only access meetings from your project.")

        # Permission check: Only creator or participants can access live meeting
        if mom.scheduled_by != request.user and not mom.participants.filter(id=request.user.id).exists():
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only the meeting creator or participants can access the live meeting.")

        # Auto-transition scheduled → live when meeting time has passed
        if mom.status == Mom.MeetingStatus.SCHEDULED and mom.meeting_datetime <= timezone.now():
            mom.status = Mom.MeetingStatus.LIVE
            mom.save(update_fields=['status'])
            # Seed noresponse records for participants who haven't responded
            responded_ids = set(
                ParticipantResponse.objects.filter(mom=mom).values_list('user_id', flat=True)
            )
            for uid in mom.participants.values_list('id', flat=True):
                if uid not in responded_ids:
                    ParticipantResponse.objects.create(mom=mom, user_id=uid, status='noresponse')

        # Update pending → noresponse when meeting is live
        if mom.status == Mom.MeetingStatus.LIVE:
            self.update_no_response_status(mom)

        serializer = MomLiveSerializer(mom, context={'request': request})
        return Response(serializer.data)

    def update_no_response_status(self, mom):
        """Update pending responses to noresponse for live meetings"""
        # Get all participants who haven't responded
        pending_responses = ParticipantResponse.objects.filter(
            mom=mom,
            status='pending'
        )

        # Also create responses for participants who don't have any response record
        participants_with_responses = set(
            ParticipantResponse.objects.filter(mom=mom).values_list('user_id', flat=True)
        )
        all_participants = set(mom.participants.values_list('id', flat=True))
        participants_without_responses = all_participants - participants_with_responses

        # Create noresponse records for participants without any response
        for user_id in participants_without_responses:
            ParticipantResponse.objects.create(
                mom=mom,
                user_id=user_id,
                status='noresponse'
            )

        # Update pending responses to noresponse
        pending_responses.update(status='noresponse')

class MomLiveAttendanceUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def put(self, request, pk):
        mom = get_object_or_404(Mom, pk=pk)
        points_to_discuss = request.data.get('points_to_discuss', '')
        attendance_data = request.data.get('attendance', [])

        mom.points_to_discuss = points_to_discuss
        mom.save()

        tenant_id = getattr(request, 'athens_tenant_id', None) or getattr(request.user, 'athens_tenant_id', None)

        for att in attendance_data:
            user_id = att.get('id')
            attended = att.get('attended', False)
            if user_id is not None:
                pa, created = ParticipantAttendance.objects.get_or_create(mom=mom, user_id=user_id)
                pa.attended = attended
                pa.save()
                if attended:
                    participant = CustomUser.objects.filter(id=user_id).first()
                    if participant:
                        from attendance.services import create_attendance_event
                        create_attendance_event(tenant_id, participant, {
                            'client_event_id': f"mom-{mom.id}-user-{user_id}",
                            'module': 'MOM',
                            'module_ref_id': str(mom.id),
                            'event_type': 'CHECK_IN',
                            'occurred_at': now(),
                            'device_id': None,
                            'offline': False,
                            'method': 'HOST',
                            'location': None,
                            'payload': {'attended': True},
                        })

        return Response({'status': 'Attendance and points updated successfully'})

class MomCompleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def put(self, request, pk):
        mom = get_object_or_404(Mom, pk=pk)

        # PROJECT ISOLATION: only enforce when both user and meeting have a project
        user_project = getattr(request.user, 'project', None)
        if user_project and mom.project and mom.project != user_project:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You can only access meetings from your project.")

        # Only the creator (or superadmin/masteradmin) can complete the meeting
        user = request.user
        is_creator = mom.scheduled_by_id == user.id
        is_superadmin = user.is_superuser or getattr(user, 'admin_type', None) in ('master', 'masteradmin')
        if not is_creator and not is_superadmin:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only the meeting creator can complete this meeting.")
        
        # Data from MomLive.tsx
        mom.completed_at = request.data.get('completed_at')
        mom.duration_minutes = request.data.get('duration_minutes')
        mom.status = Mom.MeetingStatus.COMPLETED
        mom.save()
        
        # Send completion notifications to all participants
        for participant in mom.participants.all():
            try:
                meeting_data = {
                    'id': mom.id,
                    'title': mom.title,
                    'completed_at': mom.completed_at,
                    'duration_minutes': mom.duration_minutes
                }
                
                send_meeting_completion_notification(
                    participant_user_id=participant.id,
                    meeting_data=meeting_data,
                    scheduler_user_id=mom.scheduled_by.id
                )
            except Exception as e:
                pass

        return Response({'status': 'Meeting marked as completed'})

class MomStartView(APIView):
    """
    POST /api/v1/mom/<pk>/start/
    Creator-only: transition meeting from SCHEDULED → LIVE.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        mom = get_object_or_404(Mom, pk=pk)

        if mom.scheduled_by != request.user:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only the meeting creator can start this meeting.')

        if mom.status == Mom.MeetingStatus.COMPLETED:
            return Response({'error': 'Meeting is already completed.'}, status=status.HTTP_400_BAD_REQUEST)
        if mom.status == Mom.MeetingStatus.CANCELLED:
            return Response({'error': 'Meeting is cancelled.'}, status=status.HTTP_400_BAD_REQUEST)
        if mom.status == Mom.MeetingStatus.LIVE:
            return Response({'status': 'live', 'message': 'Meeting is already live.'})

        mom.status = Mom.MeetingStatus.LIVE
        mom.save(update_fields=['status'])

        # Seed noresponse records for all participants who haven't responded
        participants_with_responses = set(
            ParticipantResponse.objects.filter(mom=mom).values_list('user_id', flat=True)
        )
        for uid in mom.participants.values_list('id', flat=True):
            if uid not in participants_with_responses:
                ParticipantResponse.objects.create(mom=mom, user_id=uid, status='noresponse')

        serializer = MomLiveSerializer(mom, context={'request': request})
        return Response({'status': 'live', 'meeting': serializer.data})


class MomAddParticipantsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        mom = get_object_or_404(Mom, pk=pk)
        participant_ids = request.data.get('participant_ids', [])
        if not isinstance(participant_ids, list):
            return Response({'error': 'participant_ids must be a list'}, status=400)

        # Get existing participants to identify new ones
        existing_participant_ids = set(mom.participants.values_list('id', flat=True))
        new_participant_ids = []

        for user_id in participant_ids:
            try:
                user = CustomUser.objects.get(pk=user_id)
                if user_id not in existing_participant_ids:
                    new_participant_ids.append(user_id)
                    # Notification will be sent via WebSocket from frontend
                
                mom.participants.add(user)
                # Create or update ParticipantResponse with status 'accepted'
                participant_response, created = ParticipantResponse.objects.get_or_create(mom=mom, user=user)
                participant_response.status = 'accepted'
                participant_response.save()
            except CustomUser.DoesNotExist:
                continue

        mom.save()
        serializer = MomLiveSerializer(mom)
        return Response(serializer.data)

from rest_framework.generics import GenericAPIView, ListAPIView
from rest_framework.response import Response
from authentication.models import CustomUser
from .serializers import UserSerializer
from rest_framework.views import APIView
from rest_framework import status

class DepartmentsListView(GenericAPIView):
    permission_classes = [IsAdminUser]

    def get(self, request, *args, **kwargs):
        departments = CustomUser.objects.values_list('department', flat=True).distinct()
        departments = [dept for dept in departments if dept]  # filter out empty/null
        return Response(departments)

class UsersByDepartmentListView(ListAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        """PROJECT ISOLATION: Only show users from the same project"""
        user = self.request.user
        
        # PROJECT ISOLATION: Filter by user's project
        if not user.project:
            return CustomUser.objects.none()
        
        department_name = self.request.query_params.get('department_name')
        queryset = CustomUser.objects.filter(
            admin_type__in=['client', 'contractor', 'epc', 'clientuser', 'contractoruser', 'epcuser'],
            project=user.project  # Same project only
        )
        
        if department_name:
            queryset = queryset.filter(department=department_name)
        
        # Exclude the logged-in user from the participant list
        if user.is_authenticated:
            queryset = queryset.exclude(id=user.id)
        
        return queryset

# Removed NotificationSendView - now using WebSocket notifications via signals

# Removed old notification views - now using authentication app notification system
# All notification management is handled through /auth/notifications/ endpoints

from rest_framework.permissions import AllowAny
from django.views.decorators.csrf import ensure_csrf_cookie
from django.utils.decorators import method_decorator
from rest_framework.views import APIView
from django.http import JsonResponse

@method_decorator(ensure_csrf_cookie, name='dispatch')
class CsrfTokenView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, *args, **kwargs):
        return JsonResponse({'detail': 'CSRF cookie set'})


# ─────────────────────────────────────────────────────────────────────────────
# QR ATTENDANCE VIEWS
# ─────────────────────────────────────────────────────────────────────────────

class MeetingQRGenerateView(APIView):
    """
    GET /api/v1/mom/<pk>/qr/
    Creator-only: generate (or refresh) a QR token for a live meeting.
    Returns a base64-encoded PNG QR image + token metadata.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        mom = get_object_or_404(Mom, pk=pk)

        if mom.scheduled_by != request.user:
            return Response({'error': 'Only the meeting creator can generate the QR code.'},
                            status=status.HTTP_403_FORBIDDEN)

        if mom.status == Mom.MeetingStatus.COMPLETED:
            return Response({'error': 'Meeting is already completed.'}, status=status.HTTP_400_BAD_REQUEST)
        if mom.status == Mom.MeetingStatus.CANCELLED:
            return Response({'error': 'Meeting is cancelled.'}, status=status.HTTP_400_BAD_REQUEST)

        # Auto-set meeting to LIVE when QR is generated
        if mom.status == Mom.MeetingStatus.SCHEDULED:
            mom.status = Mom.MeetingStatus.LIVE
            mom.save(update_fields=['status'])

        # Create or refresh token (valid for 8 hours)
        token_value = secrets.token_urlsafe(48)
        expires_at = timezone.now() + timedelta(hours=8)

        qr_token, _ = MeetingQRToken.objects.update_or_create(
            mom=mom,
            defaults={'token': token_value, 'expires_at': expires_at}
        )

        # Build QR payload URL — frontend scans this and calls the mark-attendance endpoint
        payload = f"{token_value}"

        # Generate PNG QR code as base64
        qr = qrcode.QRCode(version=1, box_size=8, border=2)
        qr.add_data(payload)
        qr.make(fit=True)
        img = qr.make_image(fill_color='black', back_color='white')
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        qr_b64 = base64.b64encode(buf.getvalue()).decode()

        return Response({
            'token': token_value,
            'expires_at': expires_at.isoformat(),
            'meeting_id': mom.id,
            'meeting_title': mom.title,
            'qr_image': f'data:image/png;base64,{qr_b64}',
        })


class MeetingAttendanceByQRView(APIView):
    """
    POST /api/v1/mom/attendance/qr/
    Participant scans QR → sends token → attendance marked.
    Body: { "token": "...", "latitude": 12.9, "longitude": 77.6 }
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        token_value = request.data.get('token', '').strip()
        if not token_value:
            return Response({'error': 'Token is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            qr_token = MeetingQRToken.objects.select_related('mom').get(token=token_value)
        except MeetingQRToken.DoesNotExist:
            return Response({'error': 'Invalid QR code.'}, status=status.HTTP_400_BAD_REQUEST)

        if not qr_token.is_valid():
            return Response({'error': 'QR code has expired.'}, status=status.HTTP_400_BAD_REQUEST)

        mom = qr_token.mom
        return self._mark_attendance(
            request, mom,
            marked_via=MeetingAttendanceLog.MARKED_VIA_QR,
            latitude=request.data.get('latitude'),
            longitude=request.data.get('longitude'),
        )


class MeetingAttendanceByCodeView(APIView):
    """
    POST /api/v1/mom/<pk>/attendance/code/
    Participant enters employee code → attendance marked.
    Body: { "employee_code": "sethu_09" }
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        mom = get_object_or_404(Mom, pk=pk)
        employee_code = request.data.get('employee_code', '').strip()
        if not employee_code:
            return Response({'error': 'Employee code is required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Look up user by username (used as employee code) or email
        user = CustomUser.objects.filter(
            is_active=True
        ).filter(
            Q(username__iexact=employee_code) | Q(email__iexact=employee_code)
        ).first()

        if not user:
            return Response({'error': 'Employee not found.'}, status=status.HTTP_404_NOT_FOUND)

        return self._mark_attendance(
            request, mom,
            target_user=user,
            marked_via=MeetingAttendanceLog.MARKED_VIA_CODE,
        )

    def _mark_attendance(self, request, mom, marked_via, target_user=None,
                         latitude=None, longitude=None):
        return _do_mark_attendance(request, mom, marked_via, target_user, latitude, longitude)


class MeetingAttendanceLogView(APIView):
    """
    GET /api/v1/mom/<pk>/attendance/log/
    Creator sees full attendance log with marked_via, time, etc.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        mom = get_object_or_404(Mom, pk=pk)
        if mom.scheduled_by != request.user and not request.user.is_superuser:
            return Response({'error': 'Only the meeting creator can view the attendance log.'},
                            status=status.HTTP_403_FORBIDDEN)

        logs = MeetingAttendanceLog.objects.filter(mom=mom).select_related('user').order_by('attendance_time')
        all_participant_ids = set(mom.participants.values_list('id', flat=True))
        attended_ids = set(logs.values_list('user_id', flat=True))

        attended = []
        for log in logs:
            attended.append({
                'user_id': log.user_id,
                'name': log.user.name or log.user.username or log.user.email,
                'email': log.user.email,
                'marked_via': log.marked_via,
                'attendance_time': log.attendance_time.isoformat(),
                'latitude': log.latitude,
                'longitude': log.longitude,
            })

        absent_users = CustomUser.objects.filter(
            id__in=all_participant_ids - attended_ids
        ).values('id', 'name', 'username', 'email')

        absent = [{
            'user_id': u['id'],
            'name': u['name'] or u['username'] or u['email'],
            'email': u['email'],
        } for u in absent_users]

        total = len(all_participant_ids)
        return Response({
            'meeting_id': mom.id,
            'meeting_title': mom.title,
            'total_invited': total,
            'total_attended': len(attended),
            'attendance_pct': round(len(attended) / total * 100) if total else 0,
            'attended': attended,
            'absent': absent,
        })


def _do_mark_attendance(request, mom, marked_via, target_user=None,
                        latitude=None, longitude=None):
    """Shared logic for QR and code-based attendance marking."""
    if mom.status != Mom.MeetingStatus.LIVE:
        return Response(
            {'error': 'Attendance is only allowed during a live meeting.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    user = target_user or request.user

    # Must be an invited participant
    if not mom.participants.filter(id=user.id).exists():
        return Response(
            {'error': f'{user.name or user.username} is not invited to this meeting.'},
            status=status.HTTP_403_FORBIDDEN
        )

    # Duplicate attendance is idempotent: the participant is already marked,
    # so return a normal response instead of surfacing a noisy 409 in the UI.
    existing_log = MeetingAttendanceLog.objects.filter(mom=mom, user=user).first()
    if existing_log:
        return Response(
            {
                'success': True,
                'already_registered': True,
                'message': 'Attendance already registered for this participant.',
                'user_id': user.id,
                'name': user.name or user.username,
                'marked_via': existing_log.marked_via,
            }
        )

    # Write attendance log
    MeetingAttendanceLog.objects.create(
        mom=mom,
        user=user,
        marked_via=marked_via,
        latitude=latitude,
        longitude=longitude,
        device_info=request.META.get('HTTP_USER_AGENT', '')[:255],
    )

    # Also update the legacy ParticipantAttendance table
    pa, _ = ParticipantAttendance.objects.get_or_create(mom=mom, user=user)
    pa.attended = True
    pa.save(update_fields=['attended'])

    return Response({
        'success': True,
        'message': f'Attendance marked for {user.name or user.username}.',
        'user_id': user.id,
        'name': user.name or user.username,
        'marked_via': marked_via,
    })
