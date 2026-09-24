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
            model="gemini-2.5-flash",
            contents=prompt
        )

        text = response.text.strip()
        return text if text else None

    except Exception:
        return None