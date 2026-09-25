import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.schemas import SummaryRequest
from services.summary_service import _template_summary, generate_summary

def test_template_includes_given_facts():
    req = SummaryRequest(age=58, gender="male", known_conditions=["diabetes"],
                          recent_symptoms=["chest pain"], recent_vitals={"BP": "160/95"},
                          referral_reason="high-risk")
    text = _template_summary(req)
    assert "58" in text and "diabetes" in text and "chest pain" in text

def test_missing_data_shown_explicitly_not_fabricated():
    req = SummaryRequest(age=30, gender="female")
    text = _template_summary(req)
    assert "none reported" in text or "not recorded" in text or "not specified" in text

def test_generate_summary_returns_valid_source_tag():
    req = SummaryRequest(age=40, gender="male", recent_symptoms=["fever"])
    result = generate_summary(req)
    assert result.source in ("llm", "template_fallback")