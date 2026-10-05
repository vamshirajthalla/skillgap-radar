"""
Resume checker: scores a resume out of 100 across five dimensions and
returns concrete, fixable feedback.

Pure rule-based (no API key needed), so it always works offline. If a
target role's required skills are supplied, keyword coverage is measured
against them; otherwise that dimension is scored on skills presence alone.
"""
import os
import re

ACTION_VERBS = {
    "built", "designed", "developed", "implemented", "created", "led", "launched",
    "improved", "optimized", "reduced", "increased", "automated", "deployed",
    "architected", "analyzed", "delivered", "migrated", "integrated", "managed",
    "organized", "founded", "engineered", "trained", "researched", "wrote",
}
WEAK_OPENERS = (
    "responsible for", "worked on", "helped with", "helped to", "assisted in",
    "involved in", "participated in", "duties included", "tasked with",
)
SECTION_ALIASES = {
    "contact": ["email", "phone", "linkedin", "github", "@"],
    "summary": ["summary", "objective", "profile", "about me"],
    "education": ["education", "university", "college", "b.tech", "b.e.", "bachelor", "master", "degree"],
    "experience": ["experience", "internship", "work history", "employment"],
    "projects": ["projects", "project"],
    "skills": ["skills", "technologies", "tech stack", "tools"],
}
_METRIC = re.compile(r"(\d+\s*%|\$\s*\d|₹\s*\d|\b\d{2,}\b|\b\d+x\b|\b\d+\+)")
_BULLET = re.compile(r"^\s*(?:[-•*▪●◦]|\d+[.)])\s+(.*)$")
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_PHONE = re.compile(r"(?:\+?\d[\d\s().-]{8,}\d)")


def _bullets(text):
    found = []
    for line in text.splitlines():
        m = _BULLET.match(line)
        if m:
            found.append(m.group(1).strip())
    if found:
        return found
    # Prose-style fallback: treat reasonably long lines as experience statements.
    return [l.strip() for l in text.splitlines() if len(l.split()) >= 6]


def _sections_present(low):
    return {name: any(k in low for k in keys) for name, keys in SECTION_ALIASES.items()}


def score_resume(text, target_skills=None):
    text = (text or "").strip()
    low = text.lower()
    words = re.findall(r"[A-Za-z0-9+#.']+", text)
    bullets = _bullets(text)
    tips = []

    # 1. Structure (25)
    present = _sections_present(low)
    has_contact = bool(_EMAIL.search(text)) and bool(_PHONE.search(text))
    present["contact"] = present["contact"] and has_contact
    core = ["contact", "education", "skills", "projects", "experience"]
    structure = round(25 * sum(present[s] for s in core) / len(core))
    for s in core:
        if not present[s]:
            label = "an email and phone number" if s == "contact" else f"a {s} section"
            tips.append({"area": "Structure", "tip": f"Add {label}."})

    # 2. Impact (25): action verbs + quantified results, no weak openers
    if bullets:
        starts = [b.lower().split()[0].strip(".,;:") if b.split() else "" for b in bullets]
        verb_ratio = sum(1 for s in starts if s in ACTION_VERBS) / len(bullets)
        metric_ratio = sum(1 for b in bullets if _METRIC.search(b)) / len(bullets)
        weak = sum(1 for b in bullets if b.lower().startswith(WEAK_OPENERS))
        weak_ratio = weak / len(bullets)
    else:
        verb_ratio = metric_ratio = weak_ratio = 0.0
    impact = round(25 * (0.4 * verb_ratio + 0.5 * min(1, metric_ratio * 2) + 0.1) * (1 - 0.6 * weak_ratio))
    if verb_ratio < 0.6:
        tips.append({"area": "Impact", "tip": "Start more bullets with strong action verbs (built, reduced, led, deployed)."})
    if metric_ratio < 0.4:
        tips.append({"area": "Impact", "tip": "Quantify results: users, % improvement, time saved, dataset size."})
    if weak_ratio > 0:
        tips.append({"area": "Impact", "tip": "Replace weak openers like 'Responsible for' or 'Worked on' with what you actually achieved."})

    # 3. Skills match (30)
    if target_skills:
        wanted = [s.strip() for s in target_skills if s.strip()]
        hits = [s for s in wanted if re.search(r"(?<![\w+#])" + re.escape(s.lower()) + r"(?![\w+#])", low)]
        missing = [s for s in wanted if s not in hits]
        coverage = len(hits) / len(wanted) if wanted else 0
        skills_score = round(30 * coverage)
        if missing:
            tips.append({"area": "Skills match", "tip": "Role keywords not found: " + ", ".join(missing[:8]) + ". Add them only where you genuinely have the skill."})
    else:
        hits, missing = [], []
        skills_score = 18 if present["skills"] else 6
        tips.append({"area": "Skills match", "tip": "Pick a target role to measure keyword coverage against real job requirements."})

    # 4. Length & concision (10)
    n = len(words)
    if 250 <= n <= 700:
        length = 10
    elif 150 <= n < 250 or 700 < n <= 900:
        length = 6
    else:
        length = 2
    if n < 250:
        tips.append({"area": "Length", "tip": f"Only {n} words; add detail on projects and outcomes (aim for 300-600)."})
    elif n > 700:
        tips.append({"area": "Length", "tip": f"{n} words is long; trim to one page (aim for 300-600)."})

    # 5. Links & proof (10)
    proof = 0
    if "github.com" in low:
        proof += 4
    elif "github" in low:
        proof += 2
    if "linkedin" in low:
        proof += 3
    if re.search(r"https?://|\b\w+\.(?:io|dev|app|com)/", low):
        proof += 3
    if proof < 7:
        tips.append({"area": "Proof", "tip": "Link your GitHub, LinkedIn and at least one live project or portfolio."})
    proof = min(10, proof)

    total = structure + impact + skills_score + length + proof
    grade = "Strong" if total >= 80 else "Solid" if total >= 60 else "Needs work" if total >= 40 else "Weak"
    return {
        "score": total,
        "grade": grade,
        "word_count": n,
        "breakdown": [
            {"name": "Structure", "score": structure, "max": 25},
            {"name": "Impact", "score": impact, "max": 25},
            {"name": "Skills match", "score": skills_score, "max": 30},
            {"name": "Length", "score": length, "max": 10},
            {"name": "Proof", "score": proof, "max": 10},
        ],
        "keywords_found": hits,
        "keywords_missing": missing,
        "tips": tips,
    }


def llm_review(text, role_title=None):
    """
    Optional written review from the Claude API. Returns a short string, or
    None when no ANTHROPIC_API_KEY is set or the call fails, so the rule-based
    score above always works on its own.
    """
    key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not key:
        return None
    try:
        import requests
        target = f" for a {role_title} role" if role_title else ""
        prompt = (
            f"Review this student resume{target}. In under 150 words, give the 3 most "
            "valuable improvements, most important first. Be specific and honest, "
            "no praise padding, no markdown.\n\nRESUME:\n" + text[:6000]
        )
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": os.getenv("LLM_MODEL", "claude-sonnet-5"), "max_tokens": 400,
                  "messages": [{"role": "user", "content": prompt}]},
            timeout=30,
        )
        resp.raise_for_status()
        blocks = [b["text"] for b in resp.json().get("content", []) if b.get("type") == "text"]
        return "\n".join(blocks).strip() or None
    except Exception:
        return None
