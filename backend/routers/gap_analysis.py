"""
Sprint 3: skill-gap computation, which the frontend turns into the
radar-chart / matched-vs-missing visualization.
"""
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Role, RoleSkill
from ..schemas import GapAnalysisRequest, GapAnalysisResponse, GapSkill

router = APIRouter(prefix="/api/gap-analysis", tags=["gap-analysis"])


@router.post("", response_model=GapAnalysisResponse)
def analyze_gap(payload: GapAnalysisRequest, db: Session = Depends(get_db)):
    role = (
        db.query(Role)
        .options(joinedload(Role.role_skills).joinedload(RoleSkill.skill))
        .filter(Role.id == payload.role_id)
        .first()
    )
    if not role:
        raise HTTPException(404, "Role not found")

    known_normalized = {s.strip().lower() for s in payload.known_skills if s.strip()}

    matched, missing = [], []
    category_breakdown = defaultdict(lambda: {"matched": 0, "total": 0})

    for rs in sorted(role.role_skills, key=lambda x: -x.importance):
        skill_name = rs.skill.name
        category = rs.skill.category
        category_breakdown[category]["total"] += 1

        item = GapSkill(skill=skill_name, category=category, importance=rs.importance)
        if skill_name.strip().lower() in known_normalized:
            matched.append(item)
            category_breakdown[category]["matched"] += 1
        else:
            missing.append(item)

    required_names = {rs.skill.name.strip().lower() for rs in role.role_skills}
    extra_skills = sorted(
        s for s in payload.known_skills if s.strip().lower() not in required_names
    )

    total_required = len(role.role_skills)
    match_percentage = round(100 * len(matched) / total_required, 1) if total_required else 0.0

    return GapAnalysisResponse(
        role=role.title,
        total_required=total_required,
        matched=matched,
        missing=missing,
        extra_skills=extra_skills,
        match_percentage=match_percentage,
        category_breakdown=dict(category_breakdown),
    )
