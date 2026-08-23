# Keywords that automatically force a HIGH or CRITICAL risk level,
# no matter what else is going on. This is the safety net.

CRITICAL_SYMPTOMS = [
    "chest pain", "chest discomfort", "difficulty breathing", "breathlessness",
    "unconscious", "unresponsive", "severe bleeding", "seizure",
    "sudden weakness", "slurred speech", "severe abdominal pain"
]

HIGH_RISK_SYMPTOMS = [
    "high fever", "persistent vomiting", "sweating", "dizziness",
    "rapid heartbeat", "confusion", "severe headache"
]

MODERATE_RISK_SYMPTOMS = [
    "fever", "cough", "body ache", "fatigue", "nausea", "mild headache"
]

HIGH_RISK_CONDITIONS = ["diabetes", "hypertension", "heart disease", "asthma", "kidney disease"]


def evaluate_risk(symptoms: list[str], existing_conditions: list[str], age: int, duration_days: int):
    """
    Returns (risk_level, red_flags, recommended_action, recommended_care_level)
    Pure rule-based. No LLM dependency, so this always works, even offline.
    """
    symptoms_lower = [s.lower().strip() for s in symptoms]
    conditions_lower = [c.lower().strip() for c in existing_conditions]

    red_flags = []

    # Check for critical symptoms first
    for symptom in symptoms_lower:
        for critical in CRITICAL_SYMPTOMS:
            if critical in symptom:
                red_flags.append(symptom)

    if red_flags:
        return (
            "critical",
            red_flags,
            "Immediate emergency evaluation required. Escalate now.",
            "district_hospital_or_emergency"
        )

    # Check high risk symptoms
    high_flags = [s for s in symptoms_lower if any(h in s for h in HIGH_RISK_SYMPTOMS)]

    # Age and existing condition modifiers
    has_risky_condition = any(c in conditions_lower for c in HIGH_RISK_CONDITIONS)
    is_elderly = age >= 60

    if high_flags or (has_risky_condition and is_elderly):
        return (
            "high",
            high_flags if high_flags else symptoms_lower,
            "Urgent evaluation recommended within 24 hours.",
            "district_hospital"
        )

    # Check moderate symptoms
    moderate_flags = [s for s in symptoms_lower if any(m in s for m in MODERATE_RISK_SYMPTOMS)]

    if moderate_flags or duration_days >= 5:
        return (
            "moderate",
            moderate_flags,
            "Schedule evaluation at nearest PHC within a few days.",
            "phc"
        )

    return (
        "low",
        [],
        "Monitor symptoms. Routine care sufficient.",
        "sub_centre"
    )