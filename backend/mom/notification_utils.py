import logging

logger = logging.getLogger(__name__)


def _create_notification(user_id, title, message, notification_type, data=None, link=None, sender_id=None):
    """Create a DB notification record for the given user."""
    try:
        from authentication.models_notification import Notification
        Notification.objects.create(
            user_id=user_id,
            title=title,
            message=message,
            notification_type=notification_type,
            data=data or {},
            link=link or '',
            sender_id=sender_id,
        )
    except Exception as e:
        logger.warning(f"[MOM] Failed to create notification for user {user_id}: {e}")


def send_meeting_invitation_notification(participant_user_id, meeting_data, scheduler_user_id):
    meeting_id = meeting_data.get('id')
    title_text = meeting_data.get('title', 'Meeting')
    meeting_dt = meeting_data.get('meeting_datetime', '')
    location = meeting_data.get('location', '')

    _create_notification(
        user_id=participant_user_id,
        title='New Meeting Invitation',
        message=f'You have been invited to: {title_text} on {meeting_dt}' + (f' at {location}' if location else ''),
        notification_type='meeting_invitation',
        data={
            'momId': meeting_id,
            'title': title_text,
            'meeting_datetime': meeting_dt,
            'location': location,
            'agenda': meeting_data.get('agenda', ''),
        },
        link=f'/dashboard/mom/view/{meeting_id}',
        sender_id=scheduler_user_id,
    )


def send_meeting_response_notification(scheduler_user_id, participant_data, meeting_data, response_status, sender_id):
    participant_name = participant_data.get('name', 'A participant')
    meeting_title = meeting_data.get('title', 'Meeting')
    meeting_id = meeting_data.get('id')

    _create_notification(
        user_id=scheduler_user_id,
        title='Meeting Response Received',
        message=f'{participant_name} has {response_status} the invitation to: {meeting_title}',
        notification_type='meeting_response',
        data={
            'momId': meeting_id,
            'title': meeting_title,
            'response': response_status,
            'participant': participant_data,
        },
        link=f'/dashboard/mom/view/{meeting_id}',
        sender_id=sender_id,
    )


def send_meeting_completion_notification(participant_user_id, meeting_data, scheduler_user_id):
    meeting_id = meeting_data.get('id')
    title_text = meeting_data.get('title', 'Meeting')

    _create_notification(
        user_id=participant_user_id,
        title='Meeting Completed',
        message=f'The meeting "{title_text}" has been completed.',
        notification_type='meeting',
        data={
            'momId': meeting_id,
            'title': title_text,
            'completed_at': str(meeting_data.get('completed_at', '')),
            'duration_minutes': meeting_data.get('duration_minutes'),
        },
        link=f'/dashboard/mom/view/{meeting_id}',
        sender_id=scheduler_user_id,
    )


def send_task_assignment_notification(assigned_user_id, task_data, meeting_data, assigner_user_id):
    meeting_id = meeting_data.get('id')
    meeting_title = meeting_data.get('title', 'Meeting')

    _create_notification(
        user_id=assigned_user_id,
        title='Action Item Assigned',
        message=f'You have been assigned an action item from meeting: {meeting_title}',
        notification_type='action_item',
        data={
            'momId': meeting_id,
            'title': meeting_title,
            'task': task_data,
        },
        link=f'/dashboard/mom/view/{meeting_id}',
        sender_id=assigner_user_id,
    )


def send_meeting_reminder_notification(participant_user_id, meeting_data, scheduler_user_id):
    meeting_id = meeting_data.get('id')
    title_text = meeting_data.get('title', 'Meeting')
    meeting_dt = meeting_data.get('meeting_datetime', '')

    _create_notification(
        user_id=participant_user_id,
        title='Meeting Reminder',
        message=f'Reminder: "{title_text}" is scheduled for {meeting_dt}',
        notification_type='meeting',
        data={
            'momId': meeting_id,
            'title': title_text,
            'meeting_datetime': meeting_dt,
        },
        link=f'/dashboard/mom/view/{meeting_id}',
        sender_id=scheduler_user_id,
    )
