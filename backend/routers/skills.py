"""
Sprint 2: skill search (autocomplete-style) and full skill listing.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Skill
from ..schemas import SkillOut

router = APIRouter(prefix="/api/skills", tags=["skills"])


@router.get("", response_model=List[SkillOut])
def list_or_search_skills(
    query: Optional[str] = Query(None, description="Partial skill name to search for"),
    limit: int = Query(20, le=100),
    db: Session = Depends(get_db),
):
    q = db.query(Skill)
    if query:
        q = q.filter(Skill.name.ilike(f"%{query}%"))
    return q.order_by(Skill.name).limit(limit).all()
