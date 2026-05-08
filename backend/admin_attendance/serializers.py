from rest_framework import serializers
from .models import AdminAttendance
from authentication.models import User


class AdminAttendanceSerializer(serializers.ModelSerializer):
    admin_email = serializers.EmailField(source='admin.email', read_only=True)
    admin_name = serializers.SerializerMethodField()
    check_in_location = serializers.SerializerMethodField()
    check_out_location = serializers.SerializerMethodField()

    class Meta:
        model = AdminAttendance
        fields = [
            'id', 'admin', 'admin_email', 'admin_name',
            'admin_role', 'organization', 'project_name',
            'attendance_date', 'check_in_time', 'check_out_time',
            'total_hours', 'status',
            'check_in_lat', 'check_in_lng', 'check_out_lat', 'check_out_lng',
            'check_in_location', 'check_out_location',
            'is_manual', 'correction_note', 'corrected_by', 'corrected_at',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'total_hours', 'corrected_at', 'created_at', 'updated_at']

    def get_admin_name(self, obj):
        u = obj.admin
        parts = [u.first_name, u.last_name]
        name = ' '.join(p for p in parts if p).strip()
        return name or u.email.split('@')[0]

    def get_check_in_location(self, obj):
        if obj.check_in_lat is not None and obj.check_in_lng is not None:
            return {'lat': obj.check_in_lat, 'lng': obj.check_in_lng}
        return None

    def get_check_out_location(self, obj):
        if obj.check_out_lat is not None and obj.check_out_lng is not None:
            return {'lat': obj.check_out_lat, 'lng': obj.check_out_lng}
        return None


class ManualAttendanceSerializer(serializers.Serializer):
    admin_id = serializers.IntegerField()
    attendance_date = serializers.DateField()
    check_in_time = serializers.DateTimeField(required=False, allow_null=True)
    check_out_time = serializers.DateTimeField(required=False, allow_null=True)
    status = serializers.ChoiceField(choices=AdminAttendance.STATUS_CHOICES, required=False)
    correction_note = serializers.CharField(required=False, allow_blank=True)
    check_in_lat = serializers.FloatField(required=False, allow_null=True)
    check_in_lng = serializers.FloatField(required=False, allow_null=True)


class AttendanceCorrectionSerializer(serializers.Serializer):
    check_in_time = serializers.DateTimeField(required=False, allow_null=True)
    check_out_time = serializers.DateTimeField(required=False, allow_null=True)
    status = serializers.ChoiceField(choices=AdminAttendance.STATUS_CHOICES, required=False)
    correction_note = serializers.CharField(required=False, allow_blank=True)


class ForceCheckoutSerializer(serializers.Serializer):
    correction_note = serializers.CharField(required=False, allow_blank=True, default='Force checkout by Master Admin')
