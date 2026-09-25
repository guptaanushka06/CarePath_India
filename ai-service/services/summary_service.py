from core.schemas import SummaryRequest, SummaryResponse
from core.llm_client import call_gemini_summary
from core.prompts.summary_prompt import build_summary_prompt


def _template_summary(request: SummaryRequest) -> str:
    """Deterministic fallback — always works, no API dependency."""
    conditions_text = (
        ", ".join(request.known_conditions)
        if request.known_conditions
        else "none reported"
    )

    symptoms_text = (
        ", ".join(request.recent_symptoms)
        if request.recent_symptoms
        else "none reported"
    )

    vitals_text = (
        ", ".join(f"{k}: {v}" for k, v in request.recent_vitals.items())
        if request.recent_vitals
        else "not recorded"
    )

    return (
        f"{request.age}-year-old {request.gender}. "
        f"Known conditions: {conditions_text}. "
        f"Recent symptoms: {symptoms_text}. "
        f"Recent vitals: {vitals_text}. "
        f"Referral reason: {request.referral_reason or 'not specified'}."
    )


def generate_summary(request: SummaryRequest) -> SummaryResponse:
    prompt = build_summary_prompt(request)
    llm_result = call_gemini_summary(prompt)

    if llm_result:
        return SummaryResponse(
            summary_text=llm_result,
            source="llm"
        )

    return SummaryResponse(
        summary_text=_template_summary(request),
        source="template_fallback"
    )