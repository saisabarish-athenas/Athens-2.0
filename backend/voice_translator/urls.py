from django.urls import path
from . import views

urlpatterns = [
    path('translate/',        views.translate_text,      name='translate_text'),
    path('detect/',           views.detect_language,     name='detect_language'),
    path('languages/',        views.supported_languages, name='supported_languages'),
    path('glossary/',         views.domain_glossary,     name='domain_glossary'),
    path('batch-translate/',  views.batch_translate,     name='batch_translate'),
]
