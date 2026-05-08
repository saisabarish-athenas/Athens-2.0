from rest_framework import serializers
from .models import ToolboxTalk, ToolboxTalkAttendance
from django.contrib.auth import get_user_model
from worker.models import Worker
from worker.serializers import WorkerSerializer

User = get_user_model()


class UserMinimalSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'name', 'surname', 'department', 'designation', 'full_name']

    def get_full_name(self, obj):
        return f"{obj.name or ''} {obj.surname or ''}".strip() or obj.username


class ToolboxTalkAttendanceSerializer(serializers.ModelSerializer):
    worker_name = serializers.SerializerMethodField()
    worker_photo = serializers.SerializerMethodField()
    participant_type = serializers.SerializerMethodField()

    class Meta:
        model = ToolboxTalkAttendance
        fields = [
            'id', 'toolbox_talk_id', 'worker_id', 'user_participant_id',
            'worker_name', 'worker_photo', 'participant_type',
            'attendance_photo', 'status', 'match_score', 'timestamp'
        ]
        read_only_fields = ['timestamp']

    def get_worker_name(self, obj):
        if obj.worker:
            return f"{obj.worker.name} {obj.worker.surname or ''}".strip()
        if obj.user_participant:
            return f"{obj.user_participant.name or ''} {obj.user_participant.surname or ''}".strip() or obj.user_participant.username
        return ''

    def get_worker_photo(self, obj):
        if obj.worker and obj.worker.photo:
            return obj.worker.photo.url
        return None

    def get_participant_type(self, obj):
        return 'worker' if obj.worker_id else 'user'


class ToolboxTalkSerializer(serializers.ModelSerializer):
    attendance_records = ToolboxTalkAttendanceSerializer(many=True, read_only=True)
    created_by_details = UserMinimalSerializer(source='created_by', read_only=True)
    completed_by_details = UserMinimalSerializer(source='completed_by', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    user_participants_details = UserMinimalSerializer(source='user_participants', many=True, read_only=True)
    user_participant_ids = serializers.PrimaryKeyRelatedField(
        source='user_participants',
        queryset=User.objects.all(),
        many=True,
        required=False,
        write_only=True
    )
    trainingType = serializers.ChoiceField(
        source='training_type',
        choices=ToolboxTalk.TRAINING_TYPE_CHOICES,
        required=False,
        write_only=True,
    )
    attendance_count = serializers.SerializerMethodField()
    has_ptw = serializers.SerializerMethodField()

    class Meta:
        model = ToolboxTalk
        fields = [
            'id', 'title', 'description', 'date', 'duration', 'duration_unit',
            'training_type', 'trainingType',
            'location', 'work_area', 'start_time', 'end_time',
            'conducted_by', 'status',
            'discussion_points',
            'user_participant_ids', 'user_participants_details',
            'completion_notes', 'completed_at', 'completed_by', 'completed_by_details',
            'generated_ptw_id', 'has_ptw',
            'created_by', 'created_by_username', 'created_by_details',
            'created_at', 'updated_at',
            'attendance_records', 'attendance_count',
            'evidence_photo', 'join_code', 'qr_token', 'qr_expires_at',
            'project',
        ]
        read_only_fields = [
            'created_at', 'updated_at', 'created_by', 'created_by_username',
            'created_by_details', 'join_code', 'qr_token', 'qr_expires_at',
            'completed_at', 'completed_by',
        ]

    def get_attendance_count(self, obj):
        return obj.attendance_records.filter(status='present').count()

    def get_has_ptw(self, obj):
        return obj.generated_ptw_id is not None

    def create(self, validated_data):
        participants = validated_data.pop('user_participants', [])
        validated_data['created_by'] = self.context['request'].user
        instance = super().create(validated_data)
        if participants:
            instance.user_participants.set(participants)
        return instance

    def update(self, instance, validated_data):
        participants = validated_data.pop('user_participants', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if not instance.project and hasattr(self.context.get('request'), 'user'):
            user = self.context['request'].user
            if user.project:
                instance.project = user.project
        instance.save()
        if participants is not None:
            instance.user_participants.set(participants)
        return instance

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        representation['trainingType'] = instance.training_type
        if not representation.get('duration'):
            representation['duration'] = instance.duration or 30
        if not representation.get('duration_unit'):
            representation['duration_unit'] = instance.duration_unit or 'minutes'
        return representation


class ParticipantSearchSerializer(serializers.Serializer):
    """Used for participant search results combining users and workers."""
    id = serializers.IntegerField()
    name = serializers.CharField()
    email = serializers.CharField(allow_blank=True)
    department = serializers.CharField(allow_blank=True)
    designation = serializers.CharField(allow_blank=True)
    participant_type = serializers.CharField()  # 'user' or 'worker'
    photo = serializers.CharField(allow_null=True)
