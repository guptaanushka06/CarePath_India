import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.schemas import TranslateRequest
from services.translation_service import translate_text

def test_dictionary_hindi_to_english():
    result = translate_text(TranslateRequest(text="बुखार", source_language="hindi", target_language="english"))
    assert result.translated_text == "fever"
    assert result.translation_source == "dictionary"

def test_hindi_to_marathi_direct():
    result = translate_text(TranslateRequest(text="बुखार", source_language="hindi", target_language="marathi"))
    assert result.translated_text == "ताप"

def test_unsupported_language_rejected_explicitly():
    result = translate_text(TranslateRequest(text="hello", source_language="french", target_language="english"))
    assert result.translation_source == "unsupported_language"

def test_same_language_passthrough():
    result = translate_text(TranslateRequest(text="fever", source_language="english", target_language="english"))
    assert result.translated_text == "fever"

def test_original_text_always_preserved():
    result = translate_text(TranslateRequest(text="बुखार", source_language="hindi", target_language="english"))
    assert result.original_text_preserved == "बुखार"