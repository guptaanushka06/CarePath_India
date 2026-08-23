from fastapi import APIRouter
from core.schemas import TranslateRequest, TranslateResponse
from services.translation_service import translate_text

router = APIRouter()

@router.post("/translate", response_model=TranslateResponse, tags=["Translation"], summary="Translate medical terms")
def translate_endpoint(request: TranslateRequest):
    """Translates common medical terms between English, Hindi and Marathi."""
    return translate_text(request)