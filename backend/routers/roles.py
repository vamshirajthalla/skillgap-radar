"""
Sprint 1 & 2: list roles, view a role's required skills, and compare roles.
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Role, RoleSkill
from ..schemas import RoleOut, RoleDetailOut, RoleSkillOut, RoleCompareOut

router = APIRouter(prefix="/api/roles", tags=["roles"])


@router.get("", response_model=List[RoleOut])
def list_roles(db: Session = Depends(get_db)):
    return db.query(Role).order_by(Role.title).all()


@router.get("/compare", response_model=RoleCompareOut)
def compare_roles(role_ids: str = Query(..., description="Comma-separated role ids, e.g. 1,2"),
                   db: Session = Depends(get_db)):
    try:
        ids = [int(x) for x in role_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(400, "role_ids must be a comma-separated list of integers")

    roles = (
        db.query(Role)
        .options(joinedload(Role.role_skills).joinedload(RoleSkill.skill))
        .filter(Role.id.in_(ids))
        .all()
    )
    if len(roles) < 2:
        raise HTTPException(404, "Need at least two valid role ids to compare")

    skill_sets = {r.title: {rs.skill.name for rs in r.role_skills} for r in roles}
    common = set.intersection(*skill_sets.values())
    unique = {title: sorted(skills - common) for title, skills in skill_sets.items()}

    return RoleCompareOut(
        roles=[r.title for r in roles],
        common_skills=sorted(common),
        unique_skills=unique,
    )


@router.get("/{role_id}", response_model=RoleDetailOut)
def get_role(role_id: int, db: Session = Depends(get_db)):
    role = (
        db.query(Role)
        .options(joinedload(Role.role_skills).joinedload(RoleSkill.skill))
        .filter(Role.id == role_id)
        .first()
    )
    if not role:
        raise HTTPException(404, "Role not found")

    required = [
        RoleSkillOut(skill=rs.skill.name, category=rs.skill.category, importance=rs.importance)
        for rs in sorted(role.role_skills, key=lambda x: -x.importance)
    ]
    return RoleDetailOut(
        id=role.id, title=role.title, category=role.category,
        description=role.description, required_skills=required,
    )
