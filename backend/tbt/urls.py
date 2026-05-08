from django.urls import path
from .views import (
    ToolboxTalkViewSet, user_search, user_list,
    submit_attendance, trained_personnel, create_toolbox_talk,
    participants_search,
)

urlpatterns = [
    # User endpoints for dropdown
    path('users/list/', user_list, name='user-list'),
    path('users/search/', user_search, name='user-search'),

    # Participant search (users + workers combined)
    path('participants/search/', participants_search, name='participants-search'),

    # Attendance endpoint
    path('attendance/', submit_attendance, name='submit-attendance'),

    # Trained personnel
    path('trained-personnel/', trained_personnel, name='trained-personnel'),

    # Toolbox talk CRUD
    path('', ToolboxTalkViewSet.as_view({'get': 'list', 'post': 'create'}), name='toolboxtalk-root'),
    path('list/', ToolboxTalkViewSet.as_view({'get': 'list'}), name='toolboxtalk-list'),
    path('create/', create_toolbox_talk, name='toolboxtalk-create'),
    path('update/<int:pk>/', ToolboxTalkViewSet.as_view({'put': 'update', 'patch': 'partial_update'}), name='toolboxtalk-update'),
    path('delete/<int:pk>/', ToolboxTalkViewSet.as_view({'delete': 'destroy'}), name='toolboxtalk-delete'),
    path('<int:pk>/', ToolboxTalkViewSet.as_view({'get': 'retrieve'}), name='toolboxtalk-detail'),
    path('<int:pk>/attendance/', ToolboxTalkViewSet.as_view({'get': 'attendance', 'post': 'attendance'}), name='toolboxtalk-attendance'),

    # Workflow actions
    path('<int:pk>/complete/', ToolboxTalkViewSet.as_view({'post': 'complete'}), name='toolboxtalk-complete'),
    path('<int:pk>/generate_ptw/', ToolboxTalkViewSet.as_view({'post': 'generate_ptw'}), name='toolboxtalk-generate-ptw'),
]
