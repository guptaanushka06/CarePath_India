from fastapi import FastAPI
from routers import triage, summary, translate

app = FastAPI(
    title="Rural CarePath AI Service",
    description="AI-assisted triage, medical summary, and translation for the Rural CarePath healthcare platform.",
    version="1.0.0"
)

app.include_router(triage.router)
app.include_router(summary.router)
app.include_router(translate.router)

@app.get("/", tags=["Health Check"])
def read_root():
    return {"message": "AI service is running!"}