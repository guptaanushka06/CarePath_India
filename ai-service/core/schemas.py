from pydantic import BaseModel, Field
from typing import List

class TriageRequest(BaseModel):
    age: int = Field(..., example=58)
    symptoms: List[str] = Field(..., example=["chest discomfort", "difficulty breathing"])
    existing_conditions: List[str] = Field(default=[], example=["diabetes", "hypertension"])
    duration_days: int = Field(default=1, example=2)

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
    source_language: str   # "english", "hindi", or "marathi"
    target_language: str = "english"   # "english", "hindi", or "marathi"

class TranslateResponse(BaseModel):
    translated_text: str
    target_language: str = "english"