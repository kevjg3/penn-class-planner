from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from penn_planner.config import settings
from penn_planner.db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Penn Class Planner", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from penn_planner.api.routes import health, courses, plan, requirements, recommendations, profile

    app.include_router(health.router, prefix="/api/v1")
    app.include_router(courses.router, prefix="/api/v1")
    app.include_router(plan.router, prefix="/api/v1")
    app.include_router(requirements.router, prefix="/api/v1")
    app.include_router(recommendations.router, prefix="/api/v1")
    app.include_router(profile.router, prefix="/api/v1")

    return app


app = create_app()
