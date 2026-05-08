import json
import re
import time
import logging
import requests
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from django.conf import settings
from authentication.tenant_scoped_utils import ensure_tenant_context

logger = logging.getLogger(__name__)

# ─── Supported languages ──────────────────────────────────────────────────────

SUPPORTED_LANGUAGES = [
    {'code': 'en', 'name': 'English',    'speech_locale': 'en-IN'},
    {'code': 'ta', 'name': 'Tamil',      'speech_locale': 'ta-IN'},
    {'code': 'hi', 'name': 'Hindi',      'speech_locale': 'hi-IN'},
    {'code': 'ml', 'name': 'Malayalam',  'speech_locale': 'ml-IN'},
    {'code': 'te', 'name': 'Telugu',     'speech_locale': 'te-IN'},
    {'code': 'kn', 'name': 'Kannada',    'speech_locale': 'kn-IN'},
    {'code': 'bn', 'name': 'Bengali',    'speech_locale': 'bn-IN'},
    {'code': 'mr', 'name': 'Marathi',    'speech_locale': 'mr-IN'},
    {'code': 'gu', 'name': 'Gujarati',   'speech_locale': 'gu-IN'},
    {'code': 'pa', 'name': 'Punjabi',    'speech_locale': 'pa-IN'},
    {'code': 'ur', 'name': 'Urdu',       'speech_locale': 'ur-PK'},
    {'code': 'es', 'name': 'Spanish',    'speech_locale': 'es-ES'},
    {'code': 'fr', 'name': 'French',     'speech_locale': 'fr-FR'},
    {'code': 'de', 'name': 'German',     'speech_locale': 'de-DE'},
    {'code': 'zh', 'name': 'Chinese',    'speech_locale': 'zh-CN'},
    {'code': 'ja', 'name': 'Japanese',   'speech_locale': 'ja-JP'},
    {'code': 'ko', 'name': 'Korean',     'speech_locale': 'ko-KR'},
    {'code': 'ar', 'name': 'Arabic',     'speech_locale': 'ar-SA'},
    {'code': 'ru', 'name': 'Russian',    'speech_locale': 'ru-RU'},
    {'code': 'pt', 'name': 'Portuguese', 'speech_locale': 'pt-BR'},
    {'code': 'it', 'name': 'Italian',    'speech_locale': 'it-IT'},
    {'code': 'ms', 'name': 'Malay',      'speech_locale': 'ms-MY'},
    {'code': 'id', 'name': 'Indonesian', 'speech_locale': 'id-ID'},
]

LANG_MAP = {l['code']: l for l in SUPPORTED_LANGUAGES}

# ─── Industrial / EHS domain glossary ────────────────────────────────────────
# These are injected as pre-translation normalizations so the translation engine
# receives clean, standard English terms before translating.
# Format: { raw_phrase: normalized_phrase }

DOMAIN_GLOSSARY_EN = {
    # PTW / Permit to Work
    'ptw': 'permit to work',
    'permit to work': 'permit to work',
    'hot work permit': 'hot work permit',
    'cold work permit': 'cold work permit',
    'confined space permit': 'confined space entry permit',
    'cse': 'confined space entry',
    'loto': 'lockout tagout',
    'lock out tag out': 'lockout tagout',
    'lockout tagout': 'lockout tagout',
    'electrical isolation': 'electrical isolation',
    'energy isolation': 'energy isolation',
    'work at height': 'work at height permit',
    'wah': 'work at height',
    'excavation permit': 'excavation permit',
    'radiography permit': 'radiography permit',

    # Safety
    'ppe': 'personal protective equipment',
    'personal protective equipment': 'personal protective equipment',
    'safety helmet': 'safety helmet',
    'hard hat': 'safety helmet',
    'safety harness': 'safety harness',
    'fall arrest': 'fall arrest system',
    'safety boots': 'safety boots',
    'safety glasses': 'safety glasses',
    'face shield': 'face shield',
    'ear protection': 'ear protection',
    'respirator': 'respirator',
    'gas mask': 'gas mask',
    'fire extinguisher': 'fire extinguisher',
    'muster point': 'muster point',
    'assembly point': 'assembly point',
    'emergency evacuation': 'emergency evacuation',
    'first aid': 'first aid',
    'near miss': 'near miss incident',
    'unsafe act': 'unsafe act',
    'unsafe condition': 'unsafe condition',
    'hazard': 'hazard',
    'risk assessment': 'risk assessment',
    'jsa': 'job safety analysis',
    'job safety analysis': 'job safety analysis',
    'msds': 'material safety data sheet',
    'sds': 'safety data sheet',
    'toolbox talk': 'toolbox talk',
    'tbt': 'toolbox talk',
    'safety induction': 'safety induction',
    'safety briefing': 'safety briefing',
    'incident report': 'incident report',
    'accident report': 'accident report',
    'safety observation': 'safety observation',

    # Construction / Site
    'scaffold': 'scaffolding',
    'scaffolding': 'scaffolding',
    'scaffold inspection': 'scaffolding inspection',
    'formwork': 'formwork',
    'shuttering': 'formwork shuttering',
    'rebar': 'reinforcement bar',
    'reinforcement bar': 'reinforcement bar',
    'concrete pour': 'concrete pouring',
    'crane lift': 'crane lifting operation',
    'rigging': 'rigging operation',
    'sling': 'lifting sling',
    'shackle': 'shackle',
    'banksman': 'banksman signaller',
    'rigger': 'rigger',
    'welder': 'welder',
    'grinder': 'angle grinder',
    'excavation': 'excavation',
    'trench': 'trench excavation',
    'barricade': 'safety barricade',
    'caution tape': 'caution tape',
    'safety net': 'safety net',
    'toe board': 'toe board',
    'handrail': 'handrail',

    # Workforce / HR
    'attendance': 'attendance',
    'check in': 'check in',
    'check out': 'check out',
    'overtime': 'overtime',
    'shift': 'work shift',
    'day shift': 'day shift',
    'night shift': 'night shift',
    'leave': 'leave application',
    'absent': 'absent',
    'present': 'present',
    'payroll': 'payroll',
    'salary': 'salary',
    'wages': 'wages',
    'contractor': 'contractor',
    'subcontractor': 'subcontractor',
    'labour': 'labour',
    'worker': 'worker',
    'supervisor': 'supervisor',
    'foreman': 'foreman',
    'site engineer': 'site engineer',
    'safety officer': 'safety officer',
    'project manager': 'project manager',

    # Inspection
    'inspection': 'inspection',
    'audit': 'safety audit',
    'checklist': 'inspection checklist',
    'non conformance': 'non-conformance report',
    'ncr': 'non-conformance report',
    'punch list': 'punch list',
    'snag list': 'snag list',
    'quality check': 'quality check',
    'qc': 'quality control',
}

# Tamil domain terms (common site phrases spoken in Tamil)
DOMAIN_GLOSSARY_TA_TO_EN = {
    'அனுமதி': 'permit',
    'பாதுகாப்பு': 'safety',
    'ஆபத்து': 'hazard',
    'விபத்து': 'accident',
    'ஆய்வு': 'inspection',
    'தொழிலாளர்': 'worker',
    'மேற்பார்வையாளர்': 'supervisor',
    'கட்டுமானம்': 'construction',
    'தீ': 'fire',
    'மின்சாரம்': 'electricity',
    'உயரம்': 'height',
    'அவசரநிலை': 'emergency',
    'முதலுதவி': 'first aid',
    'ஓய்வு': 'leave',
    'சம்பளம்': 'salary',
    'வருகை': 'attendance',
}

# Hindi domain terms
DOMAIN_GLOSSARY_HI_TO_EN = {
    'अनुमति': 'permit',
    'सुरक्षा': 'safety',
    'खतरा': 'hazard',
    'दुर्घटना': 'accident',
    'निरीक्षण': 'inspection',
    'मजदूर': 'worker',
    'पर्यवेक्षक': 'supervisor',
    'निर्माण': 'construction',
    'आग': 'fire',
    'बिजली': 'electricity',
    'ऊंचाई': 'height',
    'आपातकाल': 'emergency',
    'प्राथमिक चिकित्सा': 'first aid',
    'छुट्टी': 'leave',
    'वेतन': 'salary',
    'उपस्थिति': 'attendance',
}


def _normalize_domain_text(text: str, from_lang: str) -> str:
    """Apply domain glossary normalization before translation."""
    normalized = text.strip()

    # For Tamil source: replace known Tamil domain terms with English equivalents
    if from_lang == 'ta':
        for ta_term, en_term in DOMAIN_GLOSSARY_TA_TO_EN.items():
            normalized = normalized.replace(ta_term, en_term)

    # For Hindi source
    elif from_lang == 'hi':
        for hi_term, en_term in DOMAIN_GLOSSARY_HI_TO_EN.items():
            normalized = normalized.replace(hi_term, en_term)

    # For English source: normalize abbreviations and slang
    elif from_lang == 'en':
        lower = normalized.lower()
        for raw, clean in DOMAIN_GLOSSARY_EN.items():
            # Word-boundary replacement (case-insensitive)
            pattern = r'\b' + re.escape(raw) + r'\b'
            lower = re.sub(pattern, clean, lower, flags=re.IGNORECASE)
        # Preserve original casing for first char
        if normalized and lower:
            normalized = lower[0].upper() + lower[1:] if normalized[0].isupper() else lower

    return normalized


def _detect_language(text: str) -> dict:
    """
    Lightweight language detection using character set analysis.
    Returns {'code': 'xx', 'confidence': 0.0-1.0, 'method': 'charset'}
    """
    if not text or not text.strip():
        return {'code': 'en', 'confidence': 0.5, 'method': 'default'}

    # Unicode range checks
    tamil_chars    = len(re.findall(r'[\u0B80-\u0BFF]', text))
    hindi_chars    = len(re.findall(r'[\u0900-\u097F]', text))
    malayalam_chars= len(re.findall(r'[\u0D00-\u0D7F]', text))
    telugu_chars   = len(re.findall(r'[\u0C00-\u0C7F]', text))
    kannada_chars  = len(re.findall(r'[\u0C80-\u0CFF]', text))
    arabic_chars   = len(re.findall(r'[\u0600-\u06FF]', text))
    chinese_chars  = len(re.findall(r'[\u4E00-\u9FFF]', text))
    cyrillic_chars = len(re.findall(r'[\u0400-\u04FF]', text))
    latin_chars    = len(re.findall(r'[a-zA-Z]', text))
    total = max(len(text.strip()), 1)

    scores = {
        'ta': tamil_chars / total,
        'hi': hindi_chars / total,
        'ml': malayalam_chars / total,
        'te': telugu_chars / total,
        'kn': kannada_chars / total,
        'ar': arabic_chars / total,
        'zh': chinese_chars / total,
        'ru': cyrillic_chars / total,
        'en': latin_chars / total,
    }

    best_lang = max(scores, key=scores.get)
    best_score = scores[best_lang]

    # Mixed language: if Latin chars dominate but some Indian script present
    if best_lang == 'en' and best_score < 0.7:
        # Could be code-mixed — return en with lower confidence
        return {'code': 'en', 'confidence': round(best_score, 2), 'method': 'charset_mixed'}

    return {'code': best_lang, 'confidence': round(min(best_score * 1.2, 1.0), 2), 'method': 'charset'}


def _translate_mymemory(text: str, from_lang: str, to_lang: str, timeout: int = 8) -> dict:
    """
    MyMemory translation API.
    Free tier: 500 words/day anonymous, 10000 words/day with email key.
    Returns {'text': str, 'confidence': float, 'engine': 'mymemory'}
    """
    # MyMemory uses full locale codes for Indian languages
    lang_map = {
        'ta': 'ta-IN', 'hi': 'hi-IN', 'ml': 'ml-IN',
        'te': 'te-IN', 'kn': 'kn-IN', 'bn': 'bn-IN',
        'mr': 'mr-IN', 'gu': 'gu-IN', 'pa': 'pa-IN',
        'en': 'en-GB', 'zh': 'zh-CN', 'pt': 'pt-BR',
    }
    src = lang_map.get(from_lang, from_lang)
    tgt = lang_map.get(to_lang, to_lang)

    params = {
        'q': text,
        'langpair': f'{src}|{tgt}',
        'de': getattr(settings, 'MYMEMORY_EMAIL', ''),
    }
    # Remove empty email param
    if not params['de']:
        del params['de']

    resp = requests.get(
        'https://api.mymemory.translated.net/get',
        params=params,
        timeout=timeout
    )
    resp.raise_for_status()
    data = resp.json()

    if data.get('responseStatus') != 200:
        raise ValueError(f"MyMemory error: {data.get('responseDetails', 'unknown')}")

    translated = data['responseData']['translatedText']
    # MyMemory returns match score 0-1
    match = float(data['responseData'].get('match', 0.5))

    # Detect QUERY IN DIFFERENT LANGUAGE warning
    if 'QUERY LENGTH LIMIT' in translated or translated.upper() == text.upper():
        raise ValueError("MyMemory returned unchanged text")

    return {
        'text': translated,
        'confidence': round(match, 2),
        'engine': 'mymemory',
    }


def _translate_lingva(text: str, from_lang: str, to_lang: str, timeout: int = 8) -> dict:
    """
    Lingva Translate — free, open-source Google Translate frontend.
    Public instance: lingva.ml
    Returns {'text': str, 'confidence': float, 'engine': 'lingva'}
    """
    # Lingva uses standard ISO codes
    url = f'https://lingva.ml/api/v1/{from_lang}/{to_lang}/{requests.utils.quote(text)}'
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()
    translated = data.get('translation', '')
    if not translated:
        raise ValueError("Lingva returned empty translation")
    return {
        'text': translated,
        'confidence': 0.75,  # Lingva doesn't provide confidence
        'engine': 'lingva',
    }


def _translate_with_fallback(text: str, from_lang: str, to_lang: str) -> dict:
    """
    Try translation engines in order, return first success.
    Chain: MyMemory → Lingva → domain dict fallback
    """
    errors = []

    # Engine 1: MyMemory
    try:
        result = _translate_mymemory(text, from_lang, to_lang)
        result['fallback_used'] = False
        return result
    except Exception as e:
        errors.append(f"MyMemory: {e}")
        logger.warning("MyMemory failed: %s", e)

    # Engine 2: Lingva
    try:
        result = _translate_lingva(text, from_lang, to_lang)
        result['fallback_used'] = True
        return result
    except Exception as e:
        errors.append(f"Lingva: {e}")
        logger.warning("Lingva failed: %s", e)

    # Engine 3: Domain dictionary exact match (en→ta/hi only)
    if from_lang == 'en':
        lower = text.lower().strip()
        from voice_translator.views import COMMON_TRANSLATIONS  # self-import safe
        if to_lang in COMMON_TRANSLATIONS.get('en', {}):
            if lower in COMMON_TRANSLATIONS['en'][to_lang]:
                return {
                    'text': COMMON_TRANSLATIONS['en'][to_lang][lower],
                    'confidence': 1.0,
                    'engine': 'dictionary',
                    'fallback_used': True,
                }

    raise RuntimeError(f"All translation engines failed: {'; '.join(errors)}")


# ─── Domain dictionary (kept for fallback) ───────────────────────────────────

COMMON_TRANSLATIONS = {
    'en': {
        'ta': {
            'hello': 'வணக்கம்', 'hi': 'வணக்கம்', 'thank you': 'நன்றி',
            'thanks': 'நன்றி', 'good morning': 'காலை வணக்கம்',
            'good evening': 'மாலை வணக்கம்', 'how are you': 'நீங்கள் எப்படி இருக்கிறீர்கள்?',
            'yes': 'ஆம்', 'no': 'இல்லை', 'please': 'தயவுசெய்து',
            'sorry': 'மன்னிக்கவும்', 'goodbye': 'பிரியாவிடை',
            'safety': 'பாதுகாப்பு', 'hazard': 'ஆபத்து',
            'permit': 'அனுமதி', 'inspection': 'ஆய்வு',
            'worker': 'தொழிலாளர்', 'supervisor': 'மேற்பார்வையாளர்',
            'emergency': 'அவசரநிலை', 'fire': 'தீ',
            'accident': 'விபத்து', 'first aid': 'முதலுதவி',
        },
        'hi': {
            'hello': 'नमस्ते', 'hi': 'नमस्ते', 'thank you': 'धन्यवाद',
            'thanks': 'धन्यवाद', 'good morning': 'सुप्रभात',
            'how are you': 'आप कैसे हैं?', 'yes': 'हाँ', 'no': 'नहीं',
            'safety': 'सुरक्षा', 'hazard': 'खतरा',
            'permit': 'अनुमति', 'inspection': 'निरीक्षण',
            'worker': 'मजदूर', 'supervisor': 'पर्यवेक्षक',
            'emergency': 'आपातकाल', 'fire': 'आग',
            'accident': 'दुर्घटना', 'first aid': 'प्राथमिक चिकित्सा',
        },
    }
}


# ─── API Views ────────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def translate_text(request):
    """
    Translate text with domain normalization, multi-engine fallback,
    confidence scoring, and language detection.
    """
    start_time = time.time()
    try:
        ensure_tenant_context(request)
        data = request.data

        text = data.get('text', '').strip()
        from_lang = data.get('from', 'en').strip().lower()
        to_lang = data.get('to', 'ta').strip().lower()
        context = data.get('context', 'general')  # 'general' | 'safety' | 'construction' | 'hr'

        logger.info("Translate request: from=%s to=%s context=%s len=%d",
                    from_lang, to_lang, context, len(text))

        if not text:
            return JsonResponse({'error': 'Text is required'}, status=400)

        if len(text) > 2000:
            return JsonResponse({'error': 'Text too long (max 2000 characters)'}, status=400)

        # Same language — return as-is
        if from_lang == to_lang:
            return JsonResponse({
                'translatedText': text,
                'originalText': text,
                'fromLanguage': from_lang,
                'toLanguage': to_lang,
                'confidence': 1.0,
                'engine': 'passthrough',
                'latencyMs': 0,
                'detectedLanguage': None,
            })

        # Auto-detect language if from_lang is 'auto'
        detected_lang = None
        if from_lang == 'auto':
            detection = _detect_language(text)
            from_lang = detection['code']
            detected_lang = detection
            logger.info("Auto-detected language: %s (confidence=%.2f)", from_lang, detection['confidence'])

        # Domain normalization
        normalized_text = _normalize_domain_text(text, from_lang)
        if normalized_text != text:
            logger.info("Domain normalization applied: '%s' → '%s'", text[:50], normalized_text[:50])

        # Translate
        result = _translate_with_fallback(normalized_text, from_lang, to_lang)

        latency_ms = int((time.time() - start_time) * 1000)
        logger.info("Translation complete: engine=%s confidence=%.2f latency=%dms",
                    result['engine'], result['confidence'], latency_ms)

        return JsonResponse({
            'translatedText': result['text'],
            'originalText': text,
            'normalizedText': normalized_text if normalized_text != text else None,
            'fromLanguage': from_lang,
            'toLanguage': to_lang,
            'confidence': result['confidence'],
            'engine': result['engine'],
            'fallbackUsed': result.get('fallback_used', False),
            'detectedLanguage': detected_lang,
            'latencyMs': latency_ms,
            'context': context,
        })

    except RuntimeError as e:
        logger.error("All translation engines failed: %s", e)
        return JsonResponse({
            'error': 'Translation service temporarily unavailable. Please try again.',
            'detail': str(e),
        }, status=503)
    except Exception as e:
        logger.error("Unexpected error in translate_text: %s", e, exc_info=True)
        return JsonResponse({'error': 'Internal server error'}, status=500)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def detect_language(request):
    """Detect language of given text."""
    try:
        ensure_tenant_context(request)
        text = request.data.get('text', '').strip()
        if not text:
            return JsonResponse({'error': 'Text is required'}, status=400)

        result = _detect_language(text)
        lang_info = LANG_MAP.get(result['code'], {})
        return JsonResponse({
            'detectedLanguage': result['code'],
            'languageName': lang_info.get('name', result['code']),
            'confidence': result['confidence'],
            'method': result['method'],
        })
    except Exception as e:
        logger.error("Language detection error: %s", e)
        return JsonResponse({'error': 'Detection failed'}, status=500)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def supported_languages(request):
    """Return list of supported languages with speech locale codes."""
    ensure_tenant_context(request)
    return JsonResponse({'languages': SUPPORTED_LANGUAGES})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def domain_glossary(request):
    """Return domain glossary for client-side display."""
    ensure_tenant_context(request)
    lang = request.query_params.get('lang', 'en')
    if lang == 'en':
        glossary = [{'term': k, 'normalized': v} for k, v in DOMAIN_GLOSSARY_EN.items()]
    elif lang == 'ta':
        glossary = [{'term': k, 'normalized': v} for k, v in DOMAIN_GLOSSARY_TA_TO_EN.items()]
    elif lang == 'hi':
        glossary = [{'term': k, 'normalized': v} for k, v in DOMAIN_GLOSSARY_HI_TO_EN.items()]
    else:
        glossary = []
    return JsonResponse({'glossary': glossary, 'count': len(glossary)})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def batch_translate(request):
    """
    Translate multiple texts in one request.
    Body: { texts: [str], from: str, to: str }
    """
    try:
        ensure_tenant_context(request)
        texts = request.data.get('texts', [])
        from_lang = request.data.get('from', 'en')
        to_lang = request.data.get('to', 'ta')

        if not texts or not isinstance(texts, list):
            return JsonResponse({'error': 'texts array is required'}, status=400)
        if len(texts) > 20:
            return JsonResponse({'error': 'Max 20 texts per batch'}, status=400)

        results = []
        for text in texts:
            text = str(text).strip()
            if not text:
                results.append({'text': '', 'confidence': 0, 'error': 'empty'})
                continue
            try:
                normalized = _normalize_domain_text(text, from_lang)
                result = _translate_with_fallback(normalized, from_lang, to_lang)
                results.append({
                    'original': text,
                    'translated': result['text'],
                    'confidence': result['confidence'],
                    'engine': result['engine'],
                })
            except Exception as e:
                results.append({'original': text, 'error': str(e), 'confidence': 0})

        return JsonResponse({'results': results, 'count': len(results)})

    except Exception as e:
        logger.error("Batch translate error: %s", e)
        return JsonResponse({'error': 'Batch translation failed'}, status=500)
