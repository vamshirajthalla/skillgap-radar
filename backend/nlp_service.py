"""
Sprint 4: personalized learning recommendations via an LLM API.

If ANTHROPIC_API_KEY is set, we ask Claude to produce a structured,
prioritized learning plan for the student's missing skills. If no key is
configured (or the call fails for any reason), we fall back to a built-in
templated plan so the feature still works end-to-end offline.
"""
import os
import json
import re
import requests

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
LLM_MODEL = os.getenv("LLM_MODEL", "claude-sonnet-5")
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"

# Generic, skill-agnostic starting points used by the offline fallback.
_FALLBACK_RESOURCES = [
    "Search '{skill} crash course' on YouTube for a fast overview",
    "Official {skill} documentation / getting-started guide",
    "A small hands-on project that forces you to use {skill}",
]


def _fallback_plan(missing_skills):
    plan = []
    for i, skill in enumerate(missing_skills, start=1):
        plan.append({
            "skill": skill,
            "order": i,
            "why_it_matters": (
                f"{skill} shows up repeatedly in job postings for this role, "
                "so employers expect at least working familiarity with it."
            ),
            "how_to_start": (
                f"Spend your first few sessions on the fundamentals of {skill}, "
                "then rebuild something you already know using it."
            ),
            "resources": [r.format(skill=skill) for r in _FALLBACK_RESOURCES],
        })
    return plan


def _build_prompt(role_title, missing_skills):
    skills_list = ", ".join(missing_skills)
    return f"""A student wants to become a {role_title}. They are missing these skills: {skills_list}.

Return ONLY valid JSON (no markdown fences, no commentary) — an array where each item has:
- "skill": the skill name (must exactly match one from the missing list)
- "order": a suggested learning order starting at 1 (put foundational skills first)
- "why_it_matters": one sentence on why this skill matters for a {role_title}
- "how_to_start": one practical sentence on the first concrete step to take
- "resources": an array of exactly 3 short strings naming a type of resource or search term to look for (do not invent specific URLs)

Return exactly {len(missing_skills)} items, one per missing skill."""


def _call_anthropic(prompt):
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    body = {
        "model": LLM_MODEL,
        "max_tokens": 1500,
        "messages": [{"role": "user", "content": prompt}],
    }
    resp = requests.post(ANTHROPIC_URL, headers=headers, json=body, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    text_blocks = [b["text"] for b in data.get("content", []) if b.get("type") == "text"]
    return "\n".join(text_blocks)


def _extract_json(text):
    text = text.strip()
    text = re.sub(r"^```(json)?|```$", "", text, flags=re.MULTILINE).strip()
    return json.loads(text)


def generate_learning_plan(role_title, missing_skills):
    """
    Returns (plan: list[dict], source: "llm" | "fallback")
    """
    if not missing_skills:
        return [], "fallback"

    if not ANTHROPIC_API_KEY:
        return _fallback_plan(missing_skills), "fallback"

    try:
        prompt = _build_prompt(role_title, missing_skills)
        raw = _call_anthropic(prompt)
        parsed = _extract_json(raw)

        # Basic shape validation; fall back if the model didn't cooperate.
        if not isinstance(parsed, list) or not parsed:
            raise ValueError("LLM did not return a JSON array")

        plan = []
        for i, item in enumerate(parsed, start=1):
            plan.append({
                "skill": str(item.get("skill", missing_skills[min(i - 1, len(missing_skills) - 1)])),
                "order": int(item.get("order", i)),
                "why_it_matters": str(item.get("why_it_matters", "")).strip() or "Frequently required for this role.",
                "how_to_start": str(item.get("how_to_start", "")).strip() or "Start with an official beginner tutorial.",
                "resources": list(item.get("resources", []))[:3] or ["Official documentation"],
            })
        return plan, "llm"

    except Exception:
        # Any network/parsing failure -> quietly degrade to the fallback plan
        return _fallback_plan(missing_skills), "fallback"
