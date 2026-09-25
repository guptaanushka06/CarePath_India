def build_summary_prompt(request) -> str:
    conditions = ", ".join(request.known_conditions) if request.known_conditions else "none reported"
    symptoms = ", ".join(request.recent_symptoms) if request.recent_symptoms else "none reported"
    vitals = ", ".join(f"{k}: {v}" for k, v in request.recent_vitals.items()) if request.recent_vitals else "not recorded"

    return f"""You are summarizing a patient record for a doctor in a rural Indian public healthcare setting.

STRICT RULES:
- Use ONLY the facts given below. Do not invent, assume, or add any clinical detail not explicitly provided.
- Do not suggest a diagnosis.
- Write 3-4 short, clear sentences suitable for a doctor to quickly read before a consultation.
- Do not use markdown formatting, just plain sentences.

Patient facts:
- Age: {request.age}
- Gender: {request.gender}
- Known conditions: {conditions}
- Recent symptoms: {symptoms}
- Recent vitals: {vitals}
- Referral reason: {request.referral_reason or "not specified"}

Write the summary now:"""