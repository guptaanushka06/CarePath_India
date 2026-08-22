from schemas import TranslateRequest, TranslateResponse

# Minimal demo dictionary. Expand this with more terms as needed.
MARATHI_TO_ENGLISH = {
    "ताप": "fever",
    "खोकला": "cough",
    "डोकेदुखी": "headache",
    "पोटदुखी": "stomach pain",
    "श्वास घ्यायला त्रास": "difficulty breathing",
    "छातीत दुखणे": "chest pain",
}

HINDI_TO_ENGLISH = {
    "बुखार": "fever",
    "खांसी": "cough",
    "सिरदर्द": "headache",
    "पेट दर्द": "stomach pain",
    "सांस लेने में तकलीफ": "difficulty breathing",
    "छाती में दर्द": "chest pain",
}

def translate_text(request: TranslateRequest) -> TranslateResponse:
    source = request.source_language.lower()
    text = request.text.strip()

    if source == "english":
        return TranslateResponse(translated_text=text)

    dictionary = MARATHI_TO_ENGLISH if source == "marathi" else HINDI_TO_ENGLISH if source == "hindi" else {}

    translated = dictionary.get(text, text)  # falls back to original text if not found
    return TranslateResponse(translated_text=translated)