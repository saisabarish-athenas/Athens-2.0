from rest_framework import serializers
from .models import SafetyObservation, SafetyObservationFile, SafetyObservationAttachment

class SafetyObservationAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.username', read_only=True)
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = SafetyObservationAttachment
        fields = ['id', 'file', 'file_url', 'file_name', 'file_type', 'mime_type', 'size_bytes', 'uploaded_by', 'uploaded_by_name', 'created_at']
        read_only_fields = ['id', 'uploaded_by', 'uploaded_by_name', 'created_at']

    def get_file_url(self, obj):
        request = self.context.get('request')
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return None

class SafetyObservationFileSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.username', read_only=True)

    class Meta:
        model = SafetyObservationFile
        fields = ['id', 'file', 'file_name', 'file_type', 'uploaded_at', 'uploaded_by', 'uploaded_by_name']
        read_only_fields = ['uploaded_at', 'uploaded_by', 'uploaded_by_name']

class SafetyObservationSerializer(serializers.ModelSerializer):
    files = SafetyObservationFileSerializer(many=True, read_only=True)
    attachments = SafetyObservationAttachmentSerializer(many=True, read_only=True)
    attachment_count = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    days_until_due = serializers.IntegerField(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    is_due_soon = serializers.BooleanField(read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    
    # File upload fields
    beforePictures = serializers.ListField(
        child=serializers.FileField(max_length=1000000, allow_empty_file=False, use_url=False),
        write_only=True,
        required=False
    )

    class Meta:
        model = SafetyObservation
        fields = [
            'id', 'observationID', 'date', 'time', 'reportedBy', 'department',
            'workLocation', 'activityPerforming', 'contractorName',
            'typeOfObservation', 'classification', 'safetyObservationFound',
            'severity', 'likelihood', 'riskScore',
            'correctivePreventiveAction', 'correctiveActionAssignedTo', 'commitmentDate',
            'observationStatus', 'submitted_at', 'closed_at', 'closed_by', 'target_close_date', 'remarks',
            'is_environmental', 'env_incident_type',
            'created_at', 'updated_at', 'created_by', 'created_by_username',
            'files', 'attachments', 'attachment_count', 'can_edit', 'beforePictures',
            'days_until_due', 'is_overdue', 'is_due_soon'
        ]
        read_only_fields = ['id', 'observationID', 'riskScore', 'submitted_at', 'closed_at', 'closed_by', 'created_at', 'updated_at', 'created_by', 'created_by_username', 'files', 'attachments', 'attachment_count', 'can_edit', 'days_until_due', 'is_overdue', 'is_due_soon']

    def get_attachment_count(self, obj):
        return obj.attachments.count()

    def get_can_edit(self, obj):
        return obj.observationStatus != 'closed'

    def _normalize_classification(self, validated_data):
        if 'classification' not in validated_data:
            return

        classification = validated_data['classification']
        if isinstance(classification, str):
            try:
                import json
                validated_data['classification'] = json.loads(classification)
            except (json.JSONDecodeError, TypeError):
                validated_data['classification'] = [classification] if classification else []
        elif not isinstance(classification, list):
            validated_data['classification'] = [classification] if classification else []

    def create(self, validated_data):
        # Extract file data
        before_pictures = validated_data.pop('beforePictures', [])
        self._normalize_classification(validated_data)

        # Create the safety observation
        safety_observation = SafetyObservation.objects.create(**validated_data)

        # Handle file uploads
        for file in before_pictures:
            # Determine file type based on filename
            file_type = 'fixed' if 'fixed_' in file.name.lower() else 'before'

            SafetyObservationFile.objects.create(
                safety_observation=safety_observation,
                file=file,
                file_name=file.name,
                file_type=file_type,
                uploaded_by=self.context['request'].user
            )

        return safety_observation

    def update(self, instance, validated_data):
        # Extract file data
        before_pictures = validated_data.pop('beforePictures', [])
        
        # Remove observationID from validated_data as it should not be updated
        validated_data.pop('observationID', None)

        self._normalize_classification(validated_data)

        # Update only the provided fields (partial update support)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        # Only save if there are actual field updates or files to upload
        if validated_data or before_pictures:
            instance.save()

        # Handle new file uploads (append to existing files)
        for file in before_pictures:
            # Determine file type based on filename
            file_type = 'fixed' if 'fixed_' in file.name.lower() else 'before'

            SafetyObservationFile.objects.create(
                safety_observation=instance,
                file=file,
                file_name=file.name,
                file_type=file_type,
                uploaded_by=self.context['request'].user
            )

        return instance
