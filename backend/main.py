import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from routes import router

logger = logging.getLogger("noxar-backend.main")

# Initialize production-grade FastAPI instance
app = FastAPI(
    title="NOXAR Edge Agent Backend",
    description="Autonomous diagnostics engine router",
    version="1.0.0"
)

# Register CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routes
app.include_router(router)

# Register global exception handlers for production stability
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled exception captured at endpoint {request.url.path}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error occurred.", "error": str(exc)}
    )
