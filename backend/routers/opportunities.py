"""
Sprint 5: internship & job opportunities for a target role.

Two endpoints, same shape:
    GET /api/opportunities/internships?role_id=3&location=India
    GET /api/opportunities/jobs?role_id=3&location=India

Both return real, clickable destinations - either live individual postings
from the Adzuna API (when credentials are configured) or real pre-filtered
searches on the major job boards. See backend/opportunities_service.py for
why nothing is hard-coded or cached.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Role
from ..schemas import Opportunity, OpportunityResponse
from ..opportunities_service import get_opportunities, DEFAULT_LOCATION

router = APIRouter(prefix="/api/opportunities", tags=["opportunities"])


def _build(role_id: int, kind: str, location: str, limit: int, db: Session):
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(404, "Role not found")

    listings, source = get_opportunities(
        role_title=role.title, kind=kind, location=location, limit=limit
    )
    return OpportunityResponse(
        role=role.title,
        kind=kind,
        source=source,
        location=location,
        count=len(listings),
        opportunities=[Opportunity(**item) for item in listings],
    )


@router.get("/internships", response_model=OpportunityResponse)
def internships(
    role_id: int = Query(..., description="Target role id"),
    location: str = Query(DEFAULT_LOCATION),
    limit: int = Query(8, ge=1, le=20),
    db: Session = Depends(get_db),
):
    return _build(role_id, "internship", location, limit, db)


@router.get("/jobs", response_model=OpportunityResponse)
def jobs(
    role_id: int = Query(..., description="Target role id"),
    location: str = Query(DEFAULT_LOCATION),
    limit: int = Query(8, ge=1, le=20),
    db: Session = Depends(get_db),
):
    return _build(role_id, "job", location, limit, db)
