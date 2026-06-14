import random
import asyncio
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from backend.services import DiagnosticsService

router = APIRouter()

class DiagnoseRequest(BaseModel):
    problem_text: str
    code: str = ""
    selectedModel: str = "Fast"

class ProblemPayload(BaseModel):
    text: str
    code: str = ""
    selectedModel: str = "Fast"

@router.post("/diagnose")
async def diagnose(request: DiagnoseRequest):
    return StreamingResponse(
        DiagnosticsService.generate_diagnostics_stream(
            problem_text=request.problem_text,
            code=request.code,
            selected_model=request.selectedModel
        ),
        media_type="text/event-stream"
    )

@router.post("/api/analyze")
async def api_analyze(payload: ProblemPayload):
    return StreamingResponse(
        DiagnosticsService.generate_diagnostics_stream(
            problem_text=payload.text,
            code=payload.code,
            selected_model=payload.selectedModel
        ),
        media_type="text/event-stream"
    )

@router.get("/health")
async def health():
    instructions_found = DiagnosticsService.load_skill_instructions() is not None
    return {
        "status": "healthy",
        "instructions_found": instructions_found
    }
