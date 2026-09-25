import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.safety_rules import evaluate_risk
from core.schemas import VitalsInput


def test_critical_chest_pain():
    risk, red_flags, vital_flags, action, care, note = evaluate_risk(
        symptoms=["chest discomfort", "difficulty breathing"],
        existing_conditions=["diabetes", "hypertension"],
        age=58, duration_days=2
    )
    assert risk == "critical"
    assert "chest discomfort" in red_flags

def test_critical_severe_bleeding():
    risk, *_ = evaluate_risk(symptoms=["severe bleeding"], existing_conditions=[], age=30, duration_days=1)
    assert risk == "critical"

def test_critical_unconsciousness():
    risk, *_ = evaluate_risk(symptoms=["unconscious"], existing_conditions=[], age=25, duration_days=1)
    assert risk == "critical"

def test_high_risk_elderly_with_condition():
    risk, *_ = evaluate_risk(symptoms=["dizziness"], existing_conditions=["diabetes"], age=65, duration_days=1)
    assert risk == "high"

def test_medium_risk_cough():
    risk, *_ = evaluate_risk(symptoms=["cough"], existing_conditions=[], age=25, duration_days=1)
    assert risk == "medium"

def test_low_risk_unmatched_symptom():
    risk, *_ = evaluate_risk(symptoms=["mild skin rash"], existing_conditions=[], age=25, duration_days=1)
    assert risk == "low"

def test_empty_symptoms_returns_unknown():
    risk, red_flags, vital_flags, action, care, note = evaluate_risk(
        symptoms=[], existing_conditions=[], age=25, duration_days=1
    )
    assert risk == "unknown"
    assert note is not None

def test_vitals_low_spo2_escalates_to_critical():
    vitals = VitalsInput(spo2=88)
    risk, *_ = evaluate_risk(symptoms=["cough"], existing_conditions=[], age=45, duration_days=1, vitals=vitals)
    assert risk == "critical"

def test_vitals_high_fever_escalates_to_high():
    vitals = VitalsInput(temperature_celsius=39.0)
    risk, *_ = evaluate_risk(symptoms=["cough"], existing_conditions=[], age=30, duration_days=1, vitals=vitals)
    assert risk == "high"

def test_vitals_diastolic_bp_critical():
    vitals = VitalsInput(diastolic_bp=125)
    risk, *_ = evaluate_risk(symptoms=["cough"], existing_conditions=[], age=50, duration_days=1, vitals=vitals)
    assert risk == "critical"

def test_long_duration_escalates_to_medium():
    risk, *_ = evaluate_risk(symptoms=["mild skin rash"], existing_conditions=[], age=25, duration_days=6)
    assert risk == "medium"

def test_no_duplicate_red_flags():
    risk, red_flags, *_ = evaluate_risk(symptoms=["chest pain", "chest pain"], existing_conditions=[], age=40, duration_days=1)
    assert len(red_flags) == len(set(red_flags))