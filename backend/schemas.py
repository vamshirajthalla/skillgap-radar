"""
Pydantic request/response schemas shared by all routers.
"""
from typing import List, Optional
from pydantic import BaseModel, Field


# ---------- Roles & Skills (Sprint 1 & 2) ----------

class SkillOut(BaseModel):
    id: int
    name: str
    category: str

    class Config:
        from_attributes = True


class RoleSkillOut(BaseModel):
    skill: str
    category: str
    importance: int


class RoleOut(BaseModel):
    id: int
    title: str
    category: str
    description: Optional[str] = None

    class Config:
        from_attributes = True


class RoleDetailOut(RoleOut):
    required_skills: List[RoleSkillOut]


class RoleCompareOut(BaseModel):
    roles: List[str]
    common_skills: List[str]
    unique_skills: dict  # role title -> list[str]


# ---------- Gap analysis (Sprint 3) ----------

class GapAnalysisRequest(BaseModel):
    role_id: int
    known_skills: List[str] = Field(default_factory=list)


class GapSkill(BaseModel):
    skill: str
    category: str
    importance: int


class GapAnalysisResponse(BaseModel):
    role: str
    total_required: int
    matched: List[GapSkill]
    missing: List[GapSkill]
    extra_skills: List[str]
    match_percentage: float
    category_breakdown: dict  # category -> {matched: int, total: int}


# ---------- Recommendations (Sprint 4) ----------

class RecommendationRequest(BaseModel):
    role_id: int
    missing_skills: List[str] = Field(default_factory=list)


class SkillRecommendation(BaseModel):
    skill: str
    order: int
    why_it_matters: str
    how_to_start: str
    resources: List[str]


class RecommendationResponse(BaseModel):
    role: str
    source: str  # "llm" or "fallback"
    plan: List[SkillRecommendation]


# ---------- Opportunities: internships & jobs (Sprint 5) ----------

class Opportunity(BaseModel):
    source: str                      # Adzuna / LinkedIn / Internshala / ...
    title: str
    company: Optional[str] = None
    location: Optional[str] = None
    salary: Optional[str] = None
    posted: Optional[str] = None     # ISO date, when the API provides it
    url: str                         # real link the student clicks to apply
    description: Optional[str] = None


class OpportunityResponse(BaseModel):
    role: str
    kind: str                        # "internship" or "job"
    source: str                      # "live-api" or "board-links"
    location: str
    count: int
    opportunities: List[Opportunity]


# ---------- Resume checker ----------

class ResumeScoreRequest(BaseModel):
    text: str = Field(min_length=1)
    role_id: Optional[int] = None


class ResumeDimension(BaseModel):
    name: str
    score: int
    max: int


class ResumeTip(BaseModel):
    area: str
    tip: str


class ResumeScoreResponse(BaseModel):
    score: int
    grade: str
    word_count: int
    role: Optional[str] = None
    breakdown: List[ResumeDimension]
    keywords_found: List[str]
    keywords_missing: List[str]
    tips: List[ResumeTip]
    review: Optional[str] = None      # written review, only when an LLM key is set
    review_source: str = "none"       # "llm" or "none"
