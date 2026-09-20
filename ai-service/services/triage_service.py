from core.schemas import TriageRequest, TriageResponse
from core.safety_rules import evaluate_risk, RULES_VERSION

def run_triage(request: TriageRequest) -> TriageResponse:
    risk_level, red_flags, vital_flags, action, care_level, uncertainty_note = evaluate_risk(
        symptoms=request.symptoms,
        existing_conditions=request.existing_conditions,
        age=request.age,
        duration_days=request.duration_days,
        vitals=request.vitals
    )

    return TriageResponse(
        risk_level=risk_level,
        red_flags=red_flags,
        vital_flags=vital_flags,
        recommended_action=action,
        recommended_care_level=care_level,
        triage_source=f"rule_based_{RULES_VERSION}",
        uncertainty_note=uncertainty_note
    )