from pydantic import BaseModel
from typing import List

class TriageRequest(BaseModel):
    age: int
    symptoms: List[str]
    existing_conditions: List[str] = []
    duration_days: int = 1

class TriageResponse(BaseModel):
    risk_level: str
    red_flags: List[str]
    recommended_action: str
    recommended_care_level: str
    disclaimer: str = "AI-assisted risk identification. This is not a medical diagnosis."

class SummaryRequest(BaseModel):
    age: int
    gender: str
    known_conditions: List[str] = []
    recent_symptoms: List[str] = []
    recent_vitals: dict = {}
    referral_reason: str = ""

class SummaryResponse(BaseModel):
    summary_text: str

class TranslateRequest(BaseModel):
    text: str
    source_language: str   # "marathi", "hindi", "english"

class TranslateResponse(BaseModel):
    translated_text: str
    target_language: str = "english"