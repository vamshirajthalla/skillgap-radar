import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

"""
SkillGap Radar - FastAPI entrypoint.

Run with:
    uvicorn backend.main:app --reload

On startup: creates tables if missing, and seeds the role/skill dataset
the first time (if the roles table is empty) so the app is usable
immediately after `git clone` + `pip install`.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import pathlib

from .database import Base, engine, SessionLocal
from .models import Role
from .seed_data import seed
from .routers import roles, skills, gap_analysis, recommendations, opportunities, resume

app = FastAPI(title="SkillGap Radar API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(roles.router)
app.include_router(skills.router)
app.include_router(gap_analysis.router)
app.include_router(recommendations.router)
app.include_router(opportunities.router)
app.include_router(resume.router)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(Role).count() == 0:
            seed()
    finally:
        db.close()


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Serve the frontend (Sprint 3 & 4 dashboard) as static files.
FRONTEND_DIR = pathlib.Path(__file__).resolve().parent.parent / "frontend"
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
