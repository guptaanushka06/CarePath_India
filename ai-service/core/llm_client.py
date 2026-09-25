import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if GEMINI_API_KEY:
    client = genai.Client(api_key=GEMINI_API_KEY)
    GEMINI_READY = True
else:
    client = None
    GEMINI_READY = False


def call_gemini_summary(prompt: str) -> str | None:
    """
    Returns generated text, or None if Gemini is unavailable/fails.
    Callers should always have a fallback ready.
    """
    if not GEMINI_READY or client is None:
        return None

    try:
        response = client.models.generate_content(
            model="gemini-3.8-flash",
            contents=prompt
        )

        text = response.text.strip()
        return text if text else None

    except Exception as e:
        print("GEMINI ERROR:", e)
        return None

def call_gemini_translation(text: str, source_lang: str, target_lang: str) -> str | None:
    """General-purpose translation for text outside the verified medical dictionary."""
    if not GEMINI_READY or client is None:
        return None
    try:
        prompt = f"""Translate this text from {source_lang} to {target_lang}. This is for a rural healthcare context in India.
Only output the translated text, nothing else, no explanation.

Text: "{text}\""""
        response = client.models.generate_content(
            model="gemini-3.8-flash",
            contents=prompt
        )
        result = response.text.strip() if response.text else ""
        return result if result else None
    except Exception as e:
        print(f"GEMINI ERROR (translation):", e)
        return None


def call_gemini_symptom_extraction(prompt: str) -> dict | None:
    """Returns {'symptoms': [...], 'duration_days': int} or None if unavailable/fails."""
    if not GEMINI_READY or client is None:
        return None
    try:
        response = client.models.generate_content(
            model="gemini-3.8-flash",
            contents=prompt
        )
        text = response.text.strip() if response.text else ""
        text = text.replace("```json", "").replace("```", "").strip()
        import json
        parsed = json.loads(text)
        if "symptoms" not in parsed:
            return None
        return parsed
    except Exception as e:
        print(f"GEMINI ERROR (extraction):", e)
        return None