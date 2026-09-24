RULES_VERSION = "v1.1-vitals"

CRITICAL_SYMPTOMS = [
    "chest pain", "chest discomfort", "difficulty breathing", "breathlessness",
    "unconscious", "unresponsive", "severe bleeding", "seizure",
    "sudden weakness", "slurred speech", "severe abdominal pain"
]

HIGH_RISK_SYMPTOMS = [
    "high fever", "persistent vomiting", "sweating", "dizziness",
    "rapid heartbeat", "confusion", "severe headache"
]

MEDIUM_RISK_SYMPTOMS = [
    "fever", "cough", "body ache", "fatigue", "nausea", "mild headache"
]

HIGH_RISK_CONDITIONS = ["diabetes", "hypertension", "heart disease", "asthma", "kidney disease"]

# Vital sign thresholds — based on standard adult early-warning ranges.
# These are deliberately conservative for a rural triage context.
def evaluate_vitals(vitals) -> tuple[str, list[str]]:
    """
    Returns (severity, vital_flags). severity is one of: none, medium, high, critical.
    If vitals is None or all fields are None, returns ('none', []).
    """
    if vitals is None:
        return ("none", [])

    flags = []
    severity_rank = {"none": 0, "medium": 1, "high": 2, "critical": 3}
    worst = "none"

    def escalate(level, reason):
        nonlocal worst
        flags.append(reason)
        if severity_rank[level] > severity_rank[worst]:
            worst = level

    if vitals.spo2 is not None:
        if vitals.spo2 < 90:
            escalate("critical", f"SpO2 critically low ({vitals.spo2}%)")
        elif vitals.spo2 < 94:
            escalate("high", f"SpO2 low ({vitals.spo2}%)")

    if vitals.temperature_celsius is not None:
        if vitals.temperature_celsius >= 40.0:
            escalate("critical", f"Very high fever ({vitals.temperature_celsius}°C)")
        elif vitals.temperature_celsius >= 38.5:
            escalate("high", f"High fever ({vitals.temperature_celsius}°C)")
        elif vitals.temperature_celsius >= 37.5:
            escalate("medium", f"Mild fever ({vitals.temperature_celsius}°C)")

    if vitals.heart_rate is not None:
        if vitals.heart_rate > 130 or vitals.heart_rate < 40:
            escalate("critical", f"Heart rate critically abnormal ({vitals.heart_rate} bpm)")
        elif vitals.heart_rate > 110 or vitals.heart_rate < 50:
            escalate("high", f"Heart rate abnormal ({vitals.heart_rate} bpm)")

    if vitals.systolic_bp is not None:
        if vitals.systolic_bp > 180 or vitals.systolic_bp < 90:
            escalate("critical", f"Blood pressure critically abnormal ({vitals.systolic_bp} systolic)")
        elif vitals.systolic_bp > 160:
            escalate("high", f"Blood pressure high ({vitals.systolic_bp} systolic)")

    if vitals.diastolic_bp is not None:
        if vitals.diastolic_bp > 120 or vitals.diastolic_bp < 60:
            escalate("critical", f"Diastolic BP critically abnormal ({vitals.diastolic_bp})")
        elif vitals.diastolic_bp > 100:
            escalate("high", f"Diastolic BP high ({vitals.diastolic_bp})")        

    return (worst, flags)


def evaluate_risk(symptoms, existing_conditions, age, duration_days, vitals=None):
    """
    Returns (risk_level, red_flags, vital_flags, recommended_action, recommended_care_level, uncertainty_note)
    risk_level is one of: unknown, low, medium, high, critical.
    """
    # Explicit handling for missing/empty input — do not guess.
    if not symptoms or all(not s.strip() for s in symptoms):
        return (
            "unknown", [], [],
            "Insufficient information provided. Please record symptoms before triage.",
            "phc",
            "No symptoms were provided — this result should not be treated as a real assessment."
        )

    symptoms_lower = [s.lower().strip() for s in symptoms]
    conditions_lower = [c.lower().strip() for c in existing_conditions]

    red_flags = []
    for symptom in symptoms_lower:
        for critical in CRITICAL_SYMPTOMS:
            if critical in symptom and symptom not in red_flags:
                red_flags.append(symptom)

    vital_severity, vital_flags = evaluate_vitals(vitals)

    # Critical: either symptom-based or vitals-based critical triggers it
    if red_flags or vital_severity == "critical":
        return (
            "critical",
            red_flags,
            vital_flags,
            "Immediate emergency evaluation required. Escalate now.",
            "district_hospital_or_emergency",
            None
        )
    
    high_flags = list(dict.fromkeys(s for s in symptoms_lower if any(h in s for h in HIGH_RISK_SYMPTOMS)))
    has_risky_condition = any(c in conditions_lower for c in HIGH_RISK_CONDITIONS)
    is_elderly = age >= 60

    if high_flags or vital_severity == "high" or (has_risky_condition and is_elderly):
        return (
            "high",
            high_flags,
            vital_flags,
            "Urgent evaluation recommended within 24 hours.",
            "district_hospital",
            None
        )

    medium_flags = [s for s in symptoms_lower if any(m in s for m in MEDIUM_RISK_SYMPTOMS)]

    if medium_flags or vital_severity == "medium" or duration_days >= 5:
        return (
            "medium",
            medium_flags,
            vital_flags,
            "Schedule evaluation at nearest PHC within a few days.",
            "phc",
            None
        )

    return (
        "low",
        [],
        vital_flags,
        "Monitor symptoms. Routine care sufficient.",
        "sub_centre",
        None
    )