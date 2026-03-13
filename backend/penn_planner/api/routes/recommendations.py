from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from penn_planner.db import get_session
from penn_planner.models import Course, CourseAttribute, PlanCourse
from penn_planner.schemas import (
    CourseListSchema,
    RecommendationSchema,
    ScoreBreakdownSchema,
)
from penn_planner.services.recommendation_engine import RecommendationEngine
from penn_planner.services.requirement_engine import RequirementEngine

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.get("/", response_model=list[RecommendationSchema])
async def get_recommendations(
    n: int = Query(default=10, le=50),
    category: str | None = None,
    max_difficulty: float | None = None,
    min_quality: float | None = None,
    prefer_easy: bool = True,
    program: str = "seas_cs_bse",
    attribute: str | None = None,
    session: AsyncSession = Depends(get_session),
):
    """Get personalized course recommendations."""
    req_engine = RequirementEngine(program)
    rec_engine = RecommendationEngine(req_engine)

    # Load plan courses
    result = await session.execute(
        select(PlanCourse).options(selectinload(PlanCourse.assignments))
    )
    plan_courses = result.scalars().all()

    # Build course -> attributes mapping and assignment mapping
    completed_courses: dict[str, list[str]] = {}
    assignments: dict[str, str] = {}
    completed_ids: set[str] = set()
    planned_ids: set[str] = set()

    for pc in plan_courses:
        attrs_result = await session.execute(
            select(CourseAttribute).where(CourseAttribute.course_id == pc.course_id)
        )
        attr_codes = [a.attribute_code for a in attrs_result.scalars()]
        completed_courses[pc.course_id] = attr_codes
        if pc.status == "completed":
            completed_ids.add(pc.course_id)
        planned_ids.add(pc.course_id)
        for a in pc.assignments:
            assignments[a.requirement_id] = pc.course_id

    unfulfilled = req_engine.get_unfulfilled_requirements(assignments)

    # Get candidate courses from DB
    stmt = select(Course).options(selectinload(Course.attributes))
    if max_difficulty is not None:
        stmt = stmt.where(
            (Course.difficulty <= max_difficulty) | (Course.difficulty.is_(None))
        )
    if min_quality is not None:
        stmt = stmt.where(Course.course_quality >= min_quality)
    if attribute:
        attr_codes = [a.strip() for a in attribute.split("|")]
        stmt = stmt.join(CourseAttribute).where(
            CourseAttribute.attribute_code.in_(attr_codes)
        ).distinct()

    result = await session.execute(stmt)
    all_courses = result.scalars().all()

    preferences = {
        "prefer_low_difficulty": prefer_easy,
        "target_difficulty": 1.5 if prefer_easy else 2.5,
    }

    ranked = rec_engine.rank_candidates(
        candidates=all_courses,
        unfulfilled=unfulfilled,
        completed_course_ids=completed_ids,
        planned_course_ids=planned_ids,
        preferences=preferences,
        n=n,
        category_filter=category,
    )

    return [
        RecommendationSchema(
            course=CourseListSchema.model_validate(r["course"]),
            score=r["score"],
            reasons=r["reasons"],
            fulfills_requirements=r["fulfills_requirements"],
            score_breakdown=ScoreBreakdownSchema(**r["score_breakdown"]),
        )
        for r in ranked
    ]
