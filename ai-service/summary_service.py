from schemas import SummaryRequest, SummaryResponse

def generate_summary(request: SummaryRequest) -> SummaryResponse:
    conditions_text = ", ".join(request.known_conditions) if request.known_conditions else "none reported"
    symptoms_text = ", ".join(request.recent_symptoms) if request.recent_symptoms else "none reported"
    vitals_text = ", ".join(f"{k}: {v}" for k, v in request.recent_vitals.items()) if request.recent_vitals else "not recorded"

    summary = (
        f"{request.age}-year-old {request.gender}. "
        f"Known conditions: {conditions_text}. "
        f"Recent symptoms: {symptoms_text}. "
        f"Recent vitals: {vitals_text}. "
        f"Referral reason: {request.referral_reason or 'not specified'}."
    )

    return SummaryResponse(summary_text=summary)