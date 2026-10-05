# SkillGap Radar

**What Skills Are Missing Around You?**

Students learn random technologies without knowing which skills are actually
required for the roles they want. SkillGap Radar lets a student pick a target
role, enter the skills they already have, and instantly see what's missing —
plus a personalized plan for closing the gap.

**Stack:** Python + FastAPI · PostgreSQL (SQLite fallback for zero-setup dev) · LLM API (Anthropic) for recommendations · HTML/CSS/JavaScript.

---

## Project structure

```
skillgap-radar/
├── backend/
│   ├── main.py            # FastAPI app, mounts frontend + API
│   ├── database.py        # SQLAlchemy engine/session (Postgres or SQLite)
│   ├── models.py          # Role, Skill, RoleSkill  (Sprint 1)
│   ├── schemas.py         # Pydantic request/response models
│   ├── seed_data.py       # The job-role + skill dataset (Sprint 1)
│   ├── nlp_service.py     # LLM-powered learning plan generator (Sprint 4)
│   ├── routers/
│   │   ├── roles.py           # list/detail/compare roles (Sprint 1 & 2)
│   │   ├── skills.py          # skill search/autocomplete (Sprint 2)
│   │   ├── gap_analysis.py    # gap computation (Sprint 3)
│   │   └── recommendations.py # learning plan endpoint (Sprint 4)
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── index.html          # dashboard (Sprint 3 & 4 UI)
│   ├── css/style.css
│   └── js/
│       ├── app.js         (tabs, API calls, scan / opportunities / resume builder)
│       └── dashboard.js   (saved profile, Home dashboard, rings, charts, plan progress, toasts)
├── docker-compose.yml       # optional local PostgreSQL
└── README.md
```

## How the sprints map to the code

| Sprint | Deliverable | Where |
|---|---|---|
| 1 | Job-role + skill dataset | `models.py`, `seed_data.py` |
| 2 | Skill search and comparison | `routers/skills.py`, `routers/roles.py` (`/compare`), "Compare roles" tab |
| 3 | Skill-gap visualization | `routers/gap_analysis.py`, radar + bar charts in `dashboard.js` |
| 4 | Personalized recommendations + dashboard | `nlp_service.py`, `routers/recommendations.py`, full dashboard UI |

## Setup (VS Code)

1. Open the `skillgap-radar` folder in VS Code.
2. Create a virtual environment and install dependencies:

   ```bash
   python -m venv venv
   # Windows: venv\Scripts\activate
   source venv/bin/activate
   pip install -r backend/requirements.txt
   ```

3. Copy the environment template:

   ```bash
   cp backend/.env.example backend/.env
   ```

   By default this runs on a local SQLite file with **zero setup** — nothing
   else to configure. Leave `ANTHROPIC_API_KEY` blank and Sprint 4's
   recommendations still work, using built-in templated fallback logic.

4. Run the app from the project root:

   ```bash
   uvicorn backend.main:app --reload
   ```

5. Open **http://127.0.0.1:8000** — the dashboard is served directly by
   FastAPI. The database is created and auto-seeded with roles/skills on
   first run.

Interactive API docs are available at **http://127.0.0.1:8000/docs**.

## Switching to real PostgreSQL (matches the intended stack)

```bash
docker compose up -d
```

Then in `backend/.env`:

```
DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/skillgap
```

Restart `uvicorn` — tables are created and seeded automatically against Postgres.

## Enabling live LLM recommendations

Set in `backend/.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
LLM_MODEL=claude-sonnet-5
```

Sprint 4's "Build my learning plan" button will now call the LLM live instead
of using the offline fallback plan. If the call ever fails, the app silently
falls back to the templated plan so the feature never breaks.

## Extending the dataset

Add more roles/skills in `backend/seed_data.py`, then re-run:

```bash
python -m backend.seed_data
```

It's an idempotent upsert — safe to run repeatedly as you add data.

## API summary

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/roles` | List all roles |
| GET | `/api/roles/{id}` | Role detail + required skills |
| GET | `/api/roles/compare?role_ids=1,2` | Compare two (or more) roles |
| GET | `/api/skills?query=py` | Search skills (autocomplete) |
| POST | `/api/gap-analysis` | `{role_id, known_skills[]}` → matched/missing/% |
| POST | `/api/recommendations` | `{role_id, missing_skills[]}` → learning plan |

---

## Sprint 5 — Internships & Jobs

A third tab, **Internships & Jobs**, turns the skill gap into something
actionable: real openings the student can apply to for their target role.

### How "real" is handled

Job postings expire, so nothing is hard-coded or cached — a stored list of
"current openings" would be dead links within a week. Instead there are two
live sources, and the UI labels which one produced the results:

| Badge | Source | What you get |
|---|---|---|
| `LIVE POSTINGS` | Adzuna API | Individual openings — company, location, salary, posted date. Each links to the employer's own application page. |
| `LIVE BOARD SEARCH` | Job boards | Pre-filtered searches on Internshala, LinkedIn, Naukri, Unstop, Indeed, Wellfound. Each opens that board already filtered to the role. |

The board-search mode is the default and always works with no API key. It
can't go stale because the board does the searching at click time.

To enable live individual postings, get free credentials at
[developer.adzuna.com](https://developer.adzuna.com/) and set `ADZUNA_APP_ID`
and `ADZUNA_APP_KEY` in `backend/.env`. If the key is missing *or the call
fails*, it falls back to board search automatically.

### Endpoints

```
GET /api/opportunities/internships?role_id=1&location=India&limit=8
GET /api/opportunities/jobs?role_id=1&location=Hyderabad&limit=8
```

Both return the same shape:

```json
{
  "role": "Backend Developer",
  "kind": "internship",
  "source": "board-links",
  "location": "India",
  "count": 5,
  "opportunities": [
    {
      "source": "Internshala",
      "title": "Backend Developer internships",
      "company": null,
      "location": "India",
      "salary": null,
      "posted": null,
      "url": "https://internshala.com/internships/backend-development-internship/",
      "description": "India's largest internship board, filtered to this role."
    }
  ]
}
```

### Files added

| File | Purpose |
|---|---|
| `backend/opportunities_service.py` | Both live sources + the role→board URL mapping |
| `backend/routers/opportunities.py` | The two endpoints |
| `backend/schemas.py` | `Opportunity`, `OpportunityResponse` (appended) |
| `frontend/index.html` | New tab + panel |
| `frontend/js/app.js` | Tabs, API calls, scan, Internships/Jobs, resume builder and checker |
| `frontend/js/dashboard.js` | Loaded after `app.js`: localStorage profile, Home dashboard, score rings, charts, learning-plan progress, sample data |
| `frontend/css/style.css` | Card and badge styling |


## Resume builder & checker

A new **Resume** tab:

- **Build**: fill in a form (your skills carry over from the Scan tab), get a clean preview, then print or save as PDF.
- **Check**: paste resume text, optionally pick a target role, and get a score out of 100 across structure, impact, skills match, length and proof, plus a list of concrete fixes.

API: `POST /api/resume/score` with `{"text": "...", "role_id": 1}` (`role_id` optional). Rule-based, so no API key is needed.

If `ANTHROPIC_API_KEY` is set, the resume check also returns a short written review from Claude. Without a key it returns the rule-based score only.

### Resume builder options
- **Layouts:** Modern (banner), Sidebar, Classic.
- **Accent colors:** six swatches.
- **Background templates:** White, Soft tint, Gradient, Dots, Grid, Stripes, Corners, Dark.
- **Photo (optional):** chosen from your device, center-cropped to a square, circle or square shape. It stays in the browser and is never uploaded.
- Print / save as PDF keeps colors (tick "Background graphics" in the print dialog if they look washed out).

### Stylish templates
The Resume builder has a template gallery:
- **Modern**, **Sidebar**, **Classic**
- **Swoosh Dark** and **Swoosh Light**: a designer-style page with sweeping colored ribbons, a photo (or initials monogram) in a ringed circle, a dark or tinted side panel, and contact icons. The page grows past A4 height if the content is long.

Extra fields: job title, location, languages, references. In Experience and Projects, put the role and `Company | dates` on plain lines and start bullets with `-`; in Education and References, separate entries with a blank line.
