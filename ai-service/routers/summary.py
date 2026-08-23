from fastapi import APIRouter
from core.schemas import SummaryRequest, SummaryResponse
from services.summary_service import generate_summary

router = APIRouter()

@router.post("/summarize", response_model=SummaryResponse, tags=["Summary"], summary="Generate patient summary")
def summarize_endpoint(request: SummaryRequest):
    """Condenses patient history into a short paragraph for the treating doctor."""
    return generate_summary(request)