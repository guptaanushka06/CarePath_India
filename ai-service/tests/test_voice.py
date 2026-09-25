import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.schemas import VoiceTriageRequest
from services.voice_service import run_voice_triage, _keyword_fallback_extraction

def test_keyword_fallback_extracts_english_symptom():
    symptoms = _keyword_fallback_extraction("i have chest pain", "english")
    assert "chest pain" in symptoms

def test_full_voice_pipeline_produces_triage():
    req = VoiceTriageRequest(
        transcript="chest pain and difficulty breathing",
        language="english", age=58, existing_conditions=["diabetes"]
    )
    result = run_voice_triage(req)
    assert result.triage.risk_level in ("critical", "high")
    assert len(result.extracted_symptoms) > 0