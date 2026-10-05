"""
Sprint 4: personalized learning recommendations for a student's missing skills.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Role
from ..schemas import RecommendationRequest, RecommendationResponse, SkillRecommendation
from ..nlp_service import generate_learning_plan

router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])


@router.post("", response_model=RecommendationResponse)
def recommend(payload: RecommendationRequest, db: Session = Depends(get_db)):
    role = db.query(Role).filter(Role.id == payload.role_id).first()
    if not role:
        raise HTTPException(404, "Role not found")

    if not payload.missing_skills:
        return RecommendationResponse(role=role.title, source="fallback", plan=[])

    plan, source = generate_learning_plan(role.title, payload.missing_skills)
    return RecommendationResponse(
        role=role.title,
        source=source,
        plan=[SkillRecommendation(**item) for item in plan],
    )
