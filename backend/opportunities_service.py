"""
Sprint 5: real internship & job opportunities for the student's target role.

WHY THIS IS BUILT THE WAY IT IS
-------------------------------
Real job postings expire. A hard-coded list of "current openings" would be
dead links within a week, which is worse than no feature at all. So this
module never invents or stores listings. It has two live sources:

1. LIVE API (preferred) - Adzuna's public job search API returns real,
   currently-open postings, each with a real `redirect_url` that lands on
   the employer's own application page. Free tier, no cost.
   Get free credentials at https://developer.adzuna.com/ and set:
       ADZUNA_APP_ID=...
       ADZUNA_APP_KEY=...

2. LIVE BOARD SEARCH (always-on fallback) - if no API key is configured or
   the API call fails, we build real, pre-filtered search URLs into the job
   boards students actually use (Internshala, LinkedIn, Naukri, Unstop,
   Indeed). These are genuine links: clicking one opens that board already
   filtered to the role, so the student sees whatever is open right now.
   They can never go stale, because the board does the searching.

Either way, every link the UI shows is a real destination - nothing is
fabricated, and nothing is cached into the database to rot.
"""
import os
from urllib.parse import quote_plus
from typing import List, Dict, Tuple

import requests

ADZUNA_APP_ID = os.getenv("ADZUNA_APP_ID", "").strip()
ADZUNA_APP_KEY = os.getenv("ADZUNA_APP_KEY", "").strip()
# Adzuna country code: in, us, gb, au ... default India for student users.
ADZUNA_COUNTRY = os.getenv("ADZUNA_COUNTRY", "in").strip().lower()
ADZUNA_URL = "https://api.adzuna.com/v1/api/jobs/{country}/search/1"

DEFAULT_LOCATION = os.getenv("JOB_LOCATION", "India").strip()


# Internshala organises internships under fixed CATEGORY slugs, not free-text
# role titles - so "backend-developer-internship" would 404. Map our roles onto
# real Internshala categories; anything unmapped falls back to their keyword
# search URL, which accepts arbitrary text.
INTERNSHALA_CATEGORY = {
    "Backend Developer": "backend-development",
    "Frontend Developer": "front-end-development",
    "Full Stack Developer": "full-stack-development",
    "Data Analyst": "data-analytics",
    "Data Scientist": "data-science",
    "Machine Learning Engineer": "machine-learning",
    "DevOps Engineer": "devops",
    "Cloud Engineer": "cloud-computing",
    "Cybersecurity Analyst": "cyber-security",
    "Mobile App Developer": "mobile-app-development",
    "QA / Test Engineer": "software-testing",
    "UI/UX Designer": "ui-ux-design",
}


def _internshala_url(role_title: str) -> str:
    """Real Internshala URL: category page when we have one, else keyword search."""
    category = INTERNSHALA_CATEGORY.get(role_title)
    if category:
        return f"https://internshala.com/internships/{category}-internship/"
    return f"https://internshala.com/internships/keywords-{quote_plus(role_title.lower())}/"


# ----------------------------------------------------------------------
# Source 2: live board deep-links (always available, never stale)
# ----------------------------------------------------------------------
def _board_links(role_title: str, kind: str, location: str) -> List[Dict]:
    """
    Build real, pre-filtered search URLs on major job boards.

    `kind` is "internship" or "job". Each board has its own URL shape, so
    these are written out per-board rather than generated from a template.
    """
    # "QA / Test Engineer" searches badly with a literal slash, so normalise
    # it to plain words for the keyword-based boards.
    role_clean = " ".join(role_title.replace("/", " ").split())
    role_q = quote_plus(role_clean)
    # collapse whitespace so "QA / Test Engineer" -> "qa-test-engineer",
    # not "qa---test-engineer"
    role_slug = "-".join(role_clean.lower().split())
    loc_q = quote_plus(location)

    if kind == "internship":
        return [
            {
                "source": "Internshala",
                "title": f"{role_title} internships",
                "description": "India's largest internship board, filtered to this role.",
                "url": _internshala_url(role_title),
            },
            {
                "source": "LinkedIn",
                "title": f"{role_title} internships",
                "description": "Internship-type postings, filtered to this role and location.",
                # f_E=1 restricts experience level to Internship
                "url": f"https://www.linkedin.com/jobs/search/?keywords={role_q}&location={loc_q}&f_E=1",
            },
            {
                "source": "Unstop",
                "title": f"{role_title} internships",
                "description": "Internships and campus opportunities for students.",
                "url": f"https://unstop.com/internships?searchTerm={role_q}",
            },
            {
                "source": "Naukri",
                "title": f"{role_title} internships",
                "description": "Internship listings across Indian companies.",
                "url": f"https://www.naukri.com/{role_slug}-internship-jobs",
            },
            {
                "source": "Indeed",
                "title": f"{role_title} internships",
                "description": "Aggregated internship postings from many employers.",
                "url": f"https://in.indeed.com/jobs?q={role_q}+intern&l={loc_q}",
            },
        ]

    return [
        {
            "source": "LinkedIn",
            "title": f"{role_title} jobs",
            "description": "Current openings for this role, filtered by location.",
            "url": f"https://www.linkedin.com/jobs/search/?keywords={role_q}&location={loc_q}",
        },
        {
            "source": "Naukri",
            "title": f"{role_title} jobs",
            "description": "India's largest job board, filtered to this role.",
            "url": f"https://www.naukri.com/{role_slug}-jobs",
        },
        {
            "source": "Indeed",
            "title": f"{role_title} jobs",
            "description": "Aggregated postings from thousands of employers.",
            "url": f"https://in.indeed.com/jobs?q={role_q}&l={loc_q}",
        },
        {
            "source": "Wellfound",
            "title": f"{role_title} roles at startups",
            "description": "Startup and early-stage company openings.",
            "url": f"https://wellfound.com/role/{role_slug}",
        },
        {
            "source": "Google Jobs",
            "title": f"{role_title} openings",
            "description": "Google's job aggregator across every major board.",
            "url": f"https://www.google.com/search?q={role_q}+jobs+{loc_q}&ibp=htl;jobs",
        },
    ]


# ----------------------------------------------------------------------
# Source 1: Adzuna live API (real individual postings)
# ----------------------------------------------------------------------
def _fetch_adzuna(role_title: str, kind: str, location: str, limit: int) -> List[Dict]:
    """
    Query Adzuna for real, currently-open postings.
    Returns [] on any failure so the caller can fall back cleanly.
    """
    if not (ADZUNA_APP_ID and ADZUNA_APP_KEY):
        return []

    what = f"{role_title} intern" if kind == "internship" else role_title
    try:
        resp = requests.get(
            ADZUNA_URL.format(country=ADZUNA_COUNTRY),
            params={
                "app_id": ADZUNA_APP_ID,
                "app_key": ADZUNA_APP_KEY,
                "results_per_page": limit,
                "what": what,
                "where": location,
                "content-type": "application/json",
            },
            timeout=10,
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
    except Exception:
        return []

    listings = []
    for r in results[:limit]:
        # redirect_url is Adzuna's real link through to the employer's
        # own application page - this is what the student clicks.
        url = r.get("redirect_url")
        if not url:
            continue
        company = (r.get("company") or {}).get("display_name") or "Company not listed"
        loc = (r.get("location") or {}).get("display_name") or location
        salary_min, salary_max = r.get("salary_min"), r.get("salary_max")
        salary = None
        if salary_min and salary_max:
            salary = f"{int(salary_min):,} - {int(salary_max):,}"

        listings.append({
            "source": "Adzuna",
            "title": r.get("title", role_title),
            "company": company,
            "location": loc,
            "salary": salary,
            "posted": (r.get("created") or "")[:10] or None,
            "url": url,
            "description": None,
        })
    return listings


# ----------------------------------------------------------------------
# Public entry point
# ----------------------------------------------------------------------
def get_opportunities(
    role_title: str,
    kind: str = "job",
    location: str = None,
    limit: int = 8,
) -> Tuple[List[Dict], str]:
    """
    Returns (listings, source) where source is:
      "live-api"    - real individual postings from Adzuna
      "board-links" - real pre-filtered searches on major job boards

    `kind` is "internship" or "job".
    """
    location = location or DEFAULT_LOCATION
    kind = "internship" if kind == "internship" else "job"

    live = _fetch_adzuna(role_title, kind, location, limit)
    if live:
        return live, "live-api"

    boards = _board_links(role_title, kind, location)
    # normalize board links to the same shape the UI renders
    normalized = [{
        "source": b["source"],
        "title": b["title"],
        "company": None,
        "location": location,
        "salary": None,
        "posted": None,
        "url": b["url"],
        "description": b["description"],
    } for b in boards]
    return normalized, "board-links"
