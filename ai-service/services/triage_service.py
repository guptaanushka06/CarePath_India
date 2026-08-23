from core.schemas import TriageRequest, TriageResponse
from core.safety_rules import evaluate_risk

def run_triage(request: TriageRequest) -> TriageResponse:
    risk_level, red_flags, action, care_level = evaluate_risk(
        symptoms=request.symptoms,
        existing_conditions=request.existing_conditions,
        age=request.age,
        duration_days=request.duration_days
    )

    return TriageResponse(
        risk_level=risk_level,
        red_flags=red_flags,
        recommended_action=action,
        recommended_care_level=care_level
    )