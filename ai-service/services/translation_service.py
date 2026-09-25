from core.schemas import TranslateRequest, TranslateResponse
from core.llm_client import call_gemini_translation
from data.medical_terms import MEDICAL_TERMS

SUPPORTED_LANGUAGES = ["english", "hindi", "marathi"]

def translate_text(request: TranslateRequest) -> TranslateResponse:
    source = request.source_language.lower().strip()
    target = request.target_language.lower().strip()
    text = request.text.strip()

    if source not in SUPPORTED_LANGUAGES or target not in SUPPORTED_LANGUAGES:
        return TranslateResponse(
            translated_text=text, target_language=target,
            original_text_preserved=text, translation_source="unsupported_language"
        )

    if source == target:
        return TranslateResponse(
            translated_text=text, target_language=target,
            original_text_preserved=text, translation_source="dictionary"
        )

    # 1. Try the verified medical dictionary first — deterministic, safest for known terms
    for entry in MEDICAL_TERMS:
        if entry[source] == text:
            return TranslateResponse(
                translated_text=entry[target], target_language=target,
                original_text_preserved=text, translation_source="dictionary"
            )

    # 2. Not a known medical term — fall back to LLM for general translation
    llm_result = call_gemini_translation(text, source, target)
    if llm_result:
        return TranslateResponse(
            translated_text=llm_result, target_language=target,
            original_text_preserved=text, translation_source="llm"
        )

    # 3. LLM unavailable too — never silently lose the original text
    return TranslateResponse(
        translated_text=text, target_language=target,
        original_text_preserved=text, translation_source="untranslated_fallback"
    )