from core.safety_rules import CRITICAL_SYMPTOMS, HIGH_RISK_SYMPTOMS, MEDIUM_RISK_SYMPTOMS

KNOWN_SYMPTOMS = CRITICAL_SYMPTOMS + HIGH_RISK_SYMPTOMS + MEDIUM_RISK_SYMPTOMS

def build_extraction_prompt(transcript: str, language: str) -> str:
    symptom_list = ", ".join(KNOWN_SYMPTOMS)
    return f"""You are extracting medical symptoms from a spoken transcript in a rural Indian healthcare setting.
The transcript may be in English, Hindi, Marathi, or a mix (Hinglish).

Known standardized symptom terms you should map to (use ONLY these exact terms, in English):
{symptom_list}

Transcript language: {language}
Transcript: "{transcript}"

STRICT RULES:
- Only output symptoms that are clearly present in the transcript. Do not guess or add symptoms not mentioned.
- Map spoken symptoms to the closest matching term from the known list above. If nothing matches, omit it.
- Also extract duration_days as a number if the transcript mentions how long (e.g. "do din se" = 2 days). If not mentioned, use 1.
- Respond with ONLY valid JSON, no other text, in this exact shape:
{{"symptoms": ["term1", "term2"], "duration_days": 2}}"""