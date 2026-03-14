import json

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from penn_planner.db import get_session
from penn_planner.models import Course, CourseAttribute
from penn_planner.schemas import CourseDetailSchema, CourseListSchema, AttributeSchema, CourseSectionsSchema
from penn_planner.services.pcr_client import PCRClient

router = APIRouter(prefix="/courses", tags=["courses"])


@router.get("/departments")
async def list_departments(
    session: AsyncSession = Depends(get_session),
):
    """List all distinct departments in the DB with course counts."""
    from sqlalchemy import func

    stmt = (
        select(
            func.substr(Course.id, 1, func.instr(Course.id, "-") - 1).label("dept"),
            func.count(Course.id),
        )
        .group_by("dept")
        .order_by("dept")
    )
    result = await session.execute(stmt)
    return [
        {"code": row[0], "count": row[1]}
        for row in result.all()
        if row[0]
    ]


@router.get("/attributes")
async def list_attributes(
    session: AsyncSession = Depends(get_session),
):
    """List all distinct attribute codes in the DB with counts."""
    from sqlalchemy import func

    stmt = (
        select(CourseAttribute.attribute_code, CourseAttribute.description, func.count(CourseAttribute.id))
        .group_by(CourseAttribute.attribute_code, CourseAttribute.description)
        .order_by(CourseAttribute.attribute_code)
    )
    result = await session.execute(stmt)
    return [
        {"code": row[0], "description": row[1] or row[0], "count": row[2]}
        for row in result.all()
    ]


@router.get("/search", response_model=list[CourseListSchema])
async def search_courses(
    q: str | None = None,
    department: str | None = None,
    attributes: str | None = None,
    max_difficulty: float | None = None,
    min_quality: float | None = None,
    satisfies_requirement: str | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
):
    """Search courses in local DB."""
    stmt = select(Course)

    if q:
        pattern = f"%{q}%"
        # Also try with spaces replaced by hyphens (CIS 1600 -> CIS-1600)
        hyphenated = q.replace(" ", "-")
        hyphen_pattern = f"%{hyphenated}%"
        stmt = stmt.where(
            Course.id.ilike(pattern) | Course.id.ilike(hyphen_pattern) | Course.title.ilike(pattern)
        )

    if department:
        stmt = stmt.where(Course.id.like(f"{department}-%"))

    if max_difficulty is not None:
        stmt = stmt.where(
            (Course.difficulty <= max_difficulty) | (Course.difficulty.is_(None))
        )

    if min_quality is not None:
        stmt = stmt.where(Course.course_quality >= min_quality)

    if attributes:
        # Filter by attribute code via join
        attr_codes = [a.strip() for a in attributes.split("|")]
        stmt = stmt.join(CourseAttribute).where(
            CourseAttribute.attribute_code.in_(attr_codes)
        ).distinct()

    stmt = stmt.order_by(Course.id).offset(offset).limit(limit)
    result = await session.execute(stmt)
    courses = result.scalars().all()
    return [CourseListSchema.model_validate(c) for c in courses]


@router.get("/{course_id}", response_model=CourseDetailSchema)
async def get_course(
    course_id: str,
    session: AsyncSession = Depends(get_session),
):
    """Get full course details. Falls back to PCR API if not in local DB."""
    stmt = select(Course).where(Course.id == course_id).options(selectinload(Course.attributes))
    result = await session.execute(stmt)
    course = result.scalar_one_or_none()

    if course is None:
        # Try fetching from PCR
        client = PCRClient()
        try:
            raw = await client.get_course(course_id)
            # For now just return basic info without persisting
            return CourseDetailSchema(
                id=raw.get("id", course_id),
                title=raw.get("title", ""),
                credits=raw.get("credits", 1.0) or 1.0,
                difficulty=raw.get("difficulty"),
                course_quality=raw.get("course_quality"),
                instructor_quality=raw.get("instructor_quality"),
                description=raw.get("description", ""),
                prerequisites=raw.get("prerequisites", ""),
                work_required=raw.get("work_required"),
                attributes=[
                    AttributeSchema(code=a.get("code", a) if isinstance(a, dict) else str(a))
                    for a in raw.get("attributes", [])
                ],
                crosslistings=[str(c) for c in raw.get("crosslistings", [])],
            )
        except Exception:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail=f"Course {course_id} not found")
        finally:
            await client.close()

    return CourseDetailSchema(
        id=course.id,
        title=course.title,
        credits=course.credits,
        difficulty=course.difficulty,
        course_quality=course.course_quality,
        instructor_quality=course.instructor_quality,
        description=course.description,
        prerequisites=course.prerequisites,
        work_required=course.work_required,
        attributes=[
            AttributeSchema(code=a.attribute_code, school=a.school, description=a.description)
            for a in course.attributes
        ],
        crosslistings=json.loads(course.crosslistings_json or "[]"),
    )


@router.get("/{course_id}/sections", response_model=CourseSectionsSchema)
async def get_course_sections(
    course_id: str,
    session: AsyncSession = Depends(get_session),
):
    """Get all sections for a course with meeting times, instructors, etc."""
    course = await session.get(Course, course_id)
    if not course:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Course {course_id} not found")

    sections = json.loads(course.sections_json or "[]")
    return CourseSectionsSchema(
        course_id=course.id,
        title=course.title,
        credits=course.credits,
        sections=sections,
    )


@router.get("/{course_id}/eligible-requirements")
async def get_eligible_requirements(
    course_id: str,
    program: str = "seas_cs_bse",
    session: AsyncSession = Depends(get_session),
):
    """Given a course, return which degree requirements it could satisfy."""
    from penn_planner.services.requirement_engine import RequirementEngine

    stmt = select(Course).where(Course.id == course_id).options(selectinload(Course.attributes))
    result = await session.execute(stmt)
    course = result.scalar_one_or_none()
    if not course:
        return []

    attrs = [a.attribute_code for a in course.attributes]
    engine = RequirementEngine(program)
    suggestions = engine.suggest_assignments_for_course(course_id, attrs, {})
    return [{"requirement_id": s} for s in suggestions]
