from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from routers import triage, summary, translate, voice 
from core.safety_rules import RULES_VERSION

app = FastAPI(
    title="Rural CarePath AI Service",
    description="AI-assisted triage, medical summary, and translation for the Rural CarePath healthcare platform.",
    version="1.0.0"
)

app.include_router(triage.router)
app.include_router(summary.router)
app.include_router(translate.router)
app.include_router(voice.router)

@app.get("/", tags=["Health Check"])
def read_root():
    return {"message": "AI service is running!"}

@app.get("/health", tags=["Health Check"])
def health_check():
    """Used by the backend to confirm this service is reachable before relying on it."""
    return {"status": "ok"}

@app.get("/version", tags=["Health Check"])
def version_info():
    return {
        "service_version": "1.0.0",
        "triage_rules_version": RULES_VERSION
    }

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Turns raw Pydantic errors into a clean, predictable shape for the Node backend to check."""
    return JSONResponse(
        status_code=422,
        content={"error": "validation_error", "detail": exc.errors()},
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """Catch-all so a crash never leaks a raw Python stack trace to the frontend."""
    return JSONResponse(
        status_code=500,
        content={"error": "internal_error", "detail": "Something went wrong processing this request."},
    )