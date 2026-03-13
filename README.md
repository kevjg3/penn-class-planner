# Penn Class Planner

A full-stack degree planning tool for University of Pennsylvania students. Select your degree program, mark courses you've completed, and get personalized recommendations for what to take next — all powered by real data from the Penn Course Review API.

## Features

- **Multi-Program Support** — CIS BSE, CIS BAS, Economics, Math, Biology, PPE, Wharton Finance, and Wharton Business Analytics
- **Course Finder** — Search 2,000+ Penn courses by keyword, department, or attribute code with live filtering
- **Requirement Tracking** — Visual progress bars per requirement category; mark completed courses and see them auto-fill degree slots
- **Smart Recommendations** — 5-factor scoring engine (requirement fit, course quality, difficulty match, prerequisite readiness, popularity) ranks eligible courses
- **Auto-Assignment** — Greedy algorithm maps your completed courses to degree requirements optimally
- **Penn Course Review Integration** — Real course ratings, difficulty scores, and enrollment data

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React, Tailwind CSS, React Query |
| Backend | FastAPI, SQLAlchemy (async), Pydantic |
| Database | SQLite (aiosqlite) |
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

# Seed the course database from Penn Course Review (~2,300 courses)
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
│   │   ├── api/routes/       # FastAPI endpoints
│   │   ├── data/
│   │   │   ├── requirements/ # JSON degree requirement definitions
│   │   │   └── seed_catalog.py
│   │   ├── services/
│   │   │   ├── pcr_client.py           # Penn Course Review API client
│   │   │   ├── requirement_engine.py   # Degree audit logic
│   │   │   └── recommendation_engine.py
│   │   ├── models.py         # SQLAlchemy models
│   │   └── schemas.py        # Pydantic request/response models
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── app/              # Next.js pages (dashboard, courses, requirements, recommendations)
│       ├── components/       # Shared UI components
│       ├── hooks/            # React Query hooks
│       └── lib/              # API client, types, constants
└── README.md
```

## How It Works

1. **Select a degree program** from the sidebar
2. **Mark courses as completed** in the Course Finder or directly on the Requirement Map
3. The **requirement engine** matches your completed courses to degree slots using Penn's course attribute system (e.g., `EUHS` for SEAS Humanities, `EUMA` for Math Electives)
4. The **recommendation engine** scores unfilled requirements against eligible courses and ranks them by a weighted formula
5. **Dashboard** shows your overall progress at a glance

## Supported Programs

| School | Programs |
|--------|----------|
| SEAS | Computer Science BSE, Computer Science BAS |
| CAS | Economics, Mathematics, Biology, PPE |
| Wharton | Finance, Business Analytics |

## License

MIT
