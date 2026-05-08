from django.urls import path
from .views import (
    list_notifications,
    create_notification,
    mark_notifications_read,
    notification_stats,
)

urlpatterns = [
    path('', list_notifications, name='notif-list'),
    path('create/', create_notification, name='notif-create'),
    path('mark-read/', mark_notifications_read, name='notif-mark-read'),
    path('stats/', notification_stats, name='notif-stats'),
]
