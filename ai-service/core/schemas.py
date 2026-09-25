from pydantic import BaseModel, Field
from typing import List, Optional, Literal

class VitalsInput(BaseModel):
    spo2: Optional[int] = Field(default=None, example=94, description="Oxygen saturation %, e.g. 94")
    temperature_celsius: Optional[float] = Field(default=None, example=38.5)
    heart_rate: Optional[int] = Field(default=None, example=88, description="Beats per minute")
    systolic_bp: Optional[int] = Field(default=None, example=160)
    diastolic_bp: Optional[int] = Field(default=None, example=95)

class TriageRequest(BaseModel):
    age: int = Field(..., ge=0, le=120, example=58)
    symptoms: List[str] = Field(..., example=["chest discomfort", "difficulty breathing"])
    existing_conditions: List[str] = Field(default=[], example=["diabetes", "hypertension"])
    duration_days: int = Field(default=1, ge=0, le=365, example=2)
    vitals: Optional[VitalsInput] = None

class TriageResponse(BaseModel):
    risk_level: Literal["unknown", "low", "medium", "high", "critical"]
    red_flags: List[str]
    vital_flags: List[str] = []
    recommended_action: str
    recommended_care_level: str
    disclaimer: str = "AI-assisted risk identification. This is not a medical diagnosis."
    triage_source: str = "rule_based_v1"
    uncertainty_note: Optional[str] = None

class SummaryRequest(BaseModel):
    age: int
    gender: str
    known_conditions: List[str] = []
    recent_symptoms: List[str] = []
    recent_vitals: dict = {}
    referral_reason: str = ""

class SummaryResponse(BaseModel):
    summary_text: str
    source: Literal["llm", "template_fallback"]

class TranslateRequest(BaseModel):
    text: str
    source_language: str
    target_language: str = "english"

class TranslateResponse(BaseModel):
    translated_text: str
    target_language: str = "english"
    original_text_preserved: str
    translation_source: Literal["dictionary", "llm", "untranslated_fallback", "unsupported_language"]

class VoiceTriageRequest(BaseModel):
    transcript: str = Field(..., example="mera chest mein do din se dard ho raha hai aur saans lene mein takleef hai")
    language: Literal["english", "hindi", "marathi"] = "english"
    age: Optional[int] = None
    existing_conditions: List[str] = []
    vitals: Optional[VitalsInput] = None

class VoiceTriageResponse(BaseModel):
    extracted_symptoms: List[str]
    extraction_source: Literal["llm", "keyword_fallback", "none"]
    extraction_note: str
    triage: TriageResponse