"""
Resume checker: POST /api/resume/score with the resume text and an
optional target role_id to measure keyword coverage against.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Role, RoleSkill
from ..schemas import ResumeScoreRequest, ResumeScoreResponse
from ..resume_service import score_resume, llm_review

router = APIRouter(prefix="/api/resume", tags=["resume"])


@router.post("/score", response_model=ResumeScoreResponse)
def score(payload: ResumeScoreRequest, db: Session = Depends(get_db)):
    target_skills, role_title = None, None
    if payload.role_id is not None:
        role = (
            db.query(Role)
            .options(joinedload(Role.role_skills).joinedload(RoleSkill.skill))
            .filter(Role.id == payload.role_id)
            .first()
        )
        if not role:
            raise HTTPException(404, "Role not found")
        role_title = role.title
        target_skills = [rs.skill.name for rs in sorted(role.role_skills, key=lambda x: -x.importance)]

    result = score_resume(payload.text, target_skills)
    result["role"] = role_title
    review = llm_review(payload.text, role_title)
    result["review"] = review
    result["review_source"] = "llm" if review else "none"
    return result
