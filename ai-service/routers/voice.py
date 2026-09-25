from fastapi import APIRouter
from core.schemas import VoiceTriageRequest, VoiceTriageResponse
from services.voice_service import run_voice_triage

router = APIRouter()

@router.post("/voice-triage", response_model=VoiceTriageResponse, tags=["Voice Assistant"],
             summary="Extract symptoms from a spoken transcript and run triage")
def voice_triage_endpoint(request: VoiceTriageRequest):
    """
    Takes a speech-to-text transcript (English/Hindi/Marathi), extracts symptoms,
    and runs them through the same triage engine as manual entry.
    Extracted symptoms must be confirmed by the health worker before being saved to a patient record.
    """
    return run_voice_triage(request)