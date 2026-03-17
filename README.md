# Penn Class Planner

A full-stack degree planning tool for University of Pennsylvania students. Select your degree program, track completed courses, build conflict-free schedules, and get personalized recommendations for what to take next — all powered by real data from the Penn Course Review API.

## Features

- **Multi-Program Support** — 8 degree programs across SEAS, CAS, and Wharton
- **Course Finder** — Search 6,000+ Penn courses by keyword, department, attribute, difficulty, and quality with live filtering and paginated results
- **Schedule Builder** — Interactive weekly calendar with section selection, time-conflict detection, and side-by-side overlapping block layout
- **Requirement Tracking** — Visual progress bars per requirement category; mark completed courses and see them auto-fill degree slots
- **Smart Recommendations** — 5-factor scoring engine (requirement fit, course quality, difficulty match, prerequisite readiness, popularity) ranks eligible courses
- **Auto-Assignment** — Greedy algorithm maps your completed courses to degree requirements optimally
- **Plan Generation** — One-click generation of a full degree completion plan based on unfilled requirements
- **Per-User Session Isolation** — Anonymous session IDs allow multiple users to maintain independent plans without authentication
- **Penn Course Review Integration** — Real course ratings, difficulty scores, instructor quality, and enrollment data

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, TanStack React Query, Recharts |
| Backend | FastAPI, SQLAlchemy 2.0 (async), Pydantic v2 |
| Database | SQLite (aiosqlite) |
| HTTP Client | httpx (async) |
| Data Source | [Penn Course Review API](https://penncoursereview.com) |

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- npm

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Seed the course database from Penn Course Review (~6,000 courses)
python -m penn_planner.data.seed_catalog

# Start the API server
uvicorn penn_planner.api.app:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev -- -p 3000
```

Open **http://localhost:3000** in your browser.

## Project Structure

```
penn-class-planner/
├── backend/
│   ├── penn_planner/
│   │   ├── api/
│   │   │   ├── app.py              # FastAPI setup, CORS, router registration
│   │   │   ├── deps.py             # Session ID extraction dependency
│   │   │   └── routes/
│   │   │       ├── courses.py      # Search, detail, sections
│   │   │       ├── plan.py         # Add/update/remove plan courses
│   │   │       ├── requirements.py # Progress, assignments, slot filling
│   │   │       ├── recommendations.py # AI-ranked suggestions
│   │   │       ├── profile.py      # Degree program selection
│   │   │       └── health.py       # Health check
│   │   ├── data/
│   │   │   ├── requirements/       # JSON degree requirement definitions (8 programs)
│   │   │   └── seed_catalog.py     # Populates DB from Penn Course Review API
│   │   ├── services/
│   │   │   ├── pcr_client.py           # Penn Course Review API client
│   │   │   ├── requirement_engine.py   # Degree audit & auto-assignment logic
│   │   │   └── recommendation_engine.py # Multi-factor course ranking
│   │   ├── models.py         # SQLAlchemy ORM models
│   │   ├── schemas.py        # Pydantic request/response schemas
│   │   └── db.py             # Database init & session management
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── page.tsx             # Dashboard
│       │   ├── courses/page.tsx     # Course Finder
│       │   ├── schedule/page.tsx    # Schedule Builder
│       │   ├── requirements/page.tsx # Requirement Map
│       │   └── recommendations/page.tsx # Recommendations
│       ├── components/
│       │   ├── shared/              # RatingBadge, DifficultyMeter, LoadingSpinner
│       │   └── layout/              # Navigation sidebar
│       ├── hooks/                   # React Query hooks (usePlan, useCourses, etc.)
│       └── lib/
│           ├── api.ts               # API client with session ID header
│           ├── types.ts             # TypeScript interfaces
│           └── constants.ts         # Status colors, semester formatting
└── README.md
```

## How It Works

1. **Select a degree program** from the sidebar
2. **Search and add courses** via the Course Finder — use hover controls to quickly mark courses as completed, in progress, or planned for a specific semester
3. The **requirement engine** matches your courses to degree slots using Penn's course attribute system (e.g., `EUHS` for SEAS Humanities, `EUMA` for Math Electives)
4. The **recommendation engine** scores unfilled requirements against eligible courses and ranks them by a weighted 5-factor formula
5. **Build your schedule** in the Schedule Builder — search courses, pick sections (lectures, labs, recitations), and see conflicts highlighted in real time
6. **Dashboard** shows your overall progress with stat cards and category-level progress bars

## Supported Programs

| School | Programs |
|--------|----------|
| SEAS | Computer Science BSE, Computer Science BAS |
| CAS | Economics, Mathematics, Biology, PPE |
| Wharton | Finance, Business Analytics |

## API Endpoints

| Route | Description |
|-------|-------------|
| `GET /api/v1/courses/search` | Search courses with filters (department, attribute, difficulty, quality) |
| `GET /api/v1/courses/{id}` | Course detail with ratings and sections |
| `GET /api/v1/plan/courses` | List user's plan courses |
| `POST /api/v1/plan/courses` | Add course to plan (triggers auto-assignment) |
| `GET /api/v1/requirements/progress` | Evaluate degree progress for selected program |
| `POST /api/v1/requirements/generate-plan` | Generate a full degree completion plan |
| `GET /api/v1/recommendations/` | Get ranked course recommendations |

## License

MIT
