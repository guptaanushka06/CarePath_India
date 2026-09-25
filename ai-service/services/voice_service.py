from core.schemas import VoiceTriageRequest, VoiceTriageResponse, TriageRequest
from core.llm_client import call_gemini_symptom_extraction
from core.prompts.symptom_extraction_prompt import build_extraction_prompt, KNOWN_SYMPTOMS
from data.medical_terms import MEDICAL_TERMS
from services.triage_service import run_triage


def _keyword_fallback_extraction(transcript: str, language: str) -> list[str]:
    """
    No-API fallback: scans transcript for known symptom words in the requested language,
    using your existing medical_terms dictionary plus direct English keyword matches.
    """
    text_lower = transcript.lower()
    found = []

    if language in ("hindi", "marathi"):
        for entry in MEDICAL_TERMS:
            local_term = entry.get(language, "")
            if local_term and local_term in transcript:
                if entry["english"] not in found:
                    found.append(entry["english"])

    for symptom in KNOWN_SYMPTOMS:
        if symptom in text_lower and symptom not in found:
            found.append(symptom)

    return found


def run_voice_triage(request: VoiceTriageRequest) -> VoiceTriageResponse:
    prompt = build_extraction_prompt(request.transcript, request.language)
    llm_result = call_gemini_symptom_extraction(prompt)

    if llm_result and llm_result.get("symptoms"):
        symptoms = llm_result["symptoms"]
        duration = llm_result.get("duration_days", 1)
        source = "llm"
        note = "Symptoms extracted using AI language understanding. Please verify before saving."
    else:
        symptoms = _keyword_fallback_extraction(request.transcript, request.language)
        duration = 1
        source = "keyword_fallback"
        note = "AI extraction unavailable — used basic keyword matching. Please verify carefully before saving."

    if not symptoms:
        source = "none"
        note = "No recognizable symptoms found in the transcript. Please ask the patient to describe symptoms again or enter manually."

    triage_request = TriageRequest(
        age=request.age or 30,
        symptoms=symptoms,
        existing_conditions=request.existing_conditions,
        duration_days=duration,
        vitals=request.vitals
    )
    triage_result = run_triage(triage_request)

    return VoiceTriageResponse(
        extracted_symptoms=symptoms,
        extraction_source=source,
        extraction_note=note,
        triage=triage_result
    )