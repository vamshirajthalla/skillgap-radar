"""
SQLAlchemy models (Sprint 1: job-role + skill dataset).

Role       - a target job role a student wants (e.g. "Backend Developer")
Skill      - a single skill/technology (e.g. "PostgreSQL")
RoleSkill  - association table: which skills a role needs, and how important
             each one is (1 = nice-to-have ... 5 = must-have)
"""
from sqlalchemy import Column, Integer, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from .database import Base


class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(120), unique=True, nullable=False, index=True)
    category = Column(String(80), nullable=False)  # e.g. Engineering, Data, Design
    description = Column(String(500), nullable=True)

    role_skills = relationship(
        "RoleSkill", back_populates="role", cascade="all, delete-orphan"
    )


class Skill(Base):
    __tablename__ = "skills"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), unique=True, nullable=False, index=True)
    category = Column(String(80), nullable=False)  # Language, Framework, Tool, Soft Skill...

    role_skills = relationship(
        "RoleSkill", back_populates="skill", cascade="all, delete-orphan"
    )


class RoleSkill(Base):
    __tablename__ = "role_skills"
    __table_args__ = (UniqueConstraint("role_id", "skill_id", name="uq_role_skill"),)

    id = Column(Integer, primary_key=True, index=True)
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=False)
    skill_id = Column(Integer, ForeignKey("skills.id"), nullable=False)
    importance = Column(Integer, nullable=False, default=3)  # 1..5

    role = relationship("Role", back_populates="role_skills")
    skill = relationship("Skill", back_populates="role_skills")
