import os
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routes import (
    health,
    duplicates,
    dashboard,
    agents,
    training,
    console,
    schema as schema_route,
    exports,
)
from db import init_db

app = FastAPI(
    title="Duplicate Payment Detection API",
    description="AI-powered duplicate payment detection system",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    init_db()

app.include_router(health.router, prefix="/py-api")
app.include_router(duplicates.router, prefix="/py-api/duplicates", tags=["duplicates"])
app.include_router(dashboard.router, prefix="/py-api/dashboard", tags=["dashboard"])
app.include_router(agents.router, prefix="/py-api/agents", tags=["agents"])
app.include_router(training.router, prefix="/py-api/training", tags=["training"])
app.include_router(console.router, prefix="/py-api/console", tags=["console"])
app.include_router(schema_route.router, prefix="/py-api/schema", tags=["schema"])
app.include_router(exports.router, prefix="/py-api/exports", tags=["exports"])


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
