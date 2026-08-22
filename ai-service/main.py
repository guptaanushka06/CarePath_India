from fastapi import FastAPI
from schemas import TriageRequest, TriageResponse, SummaryRequest, SummaryResponse, TranslateRequest, TranslateResponse
from triage_service import run_triage
from summary_service import generate_summary
from translate_service import translate_text

app = FastAPI(title="Rural CareLink AI Service")

@app.get("/")
def read_root():
    return {"message": "AI service is running!"}

@app.post("/triage", response_model=TriageResponse)
def triage_endpoint(request: TriageRequest):
    return run_triage(request)

@app.post("/summarize", response_model=SummaryResponse)
def summarize_endpoint(request: SummaryRequest):
    return generate_summary(request)

@app.post("/translate", response_model=TranslateResponse)
def translate_endpoint(request: TranslateRequest):
    return translate_text(request)