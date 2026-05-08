from django.urls import path
from . import views

urlpatterns = [
    path('dashboard/', views.attendance_dashboard, name='admin-attendance-dashboard'),
    path('', views.attendance_list, name='admin-attendance-list'),
    path('manual/', views.mark_manual_attendance, name='admin-attendance-manual'),
    path('<int:pk>/correct/', views.correct_attendance, name='admin-attendance-correct'),
    path('<int:pk>/force-checkout/', views.force_checkout, name='admin-attendance-force-checkout'),
    path('export/', views.export_attendance, name='admin-attendance-export'),
]
