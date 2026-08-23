from core.schemas import TranslateRequest, TranslateResponse
from data.medical_terms import MEDICAL_TERMS

SUPPORTED_LANGUAGES = ["english", "hindi", "marathi"]

def translate_text(request: TranslateRequest) -> TranslateResponse:
    source = request.source_language.lower().strip()
    target = request.target_language.lower().strip()
    text = request.text.strip()

    if source not in SUPPORTED_LANGUAGES or target not in SUPPORTED_LANGUAGES:
        return TranslateResponse(translated_text=text, target_language=target)

    if source == target:
        return TranslateResponse(translated_text=text, target_language=target)

    # Look through the term list for a match in the source language
    for entry in MEDICAL_TERMS:
        if entry[source] == text:
            return TranslateResponse(translated_text=entry[target], target_language=target)

    # No match found — return the original text unchanged rather than guessing
    return TranslateResponse(translated_text=text, target_language=target)