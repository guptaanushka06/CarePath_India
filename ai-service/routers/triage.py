from fastapi import APIRouter
from core.schemas import TriageRequest, TriageResponse
from services.triage_service import run_triage

router = APIRouter()

@router.post("/triage", response_model=TriageResponse, tags=["Triage"])
def triage_endpoint(request: TriageRequest):
    return run_triage(request)