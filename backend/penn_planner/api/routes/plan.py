import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from penn_planner.db import get_session
from penn_planner.models import Course, CourseAttribute, PlanCourse, RequirementAssignment, UserPreference
from penn_planner.schemas import (
    AddPlanCourseRequest,
    CourseListSchema,
    PlanCourseSchema,
    UpdatePlanCourseRequest,
)
from penn_planner.services.requirement_engine import RequirementEngine
from penn_planner.api.deps import get_session_id

router = APIRouter(prefix="/plan", tags=["plan"])


async def _run_auto_assign(
    session: AsyncSession,
    session_id: str = "",
    pinned: dict[str, str] | None = None,
):
    """Re-run auto-assign for all plan courses after any plan change.

    Args:
        session_id: user session ID to scope the operation.
        pinned: optional dict of {requirement_id: course_id} that must be
                respected — these assignments are created first and the
                auto-assign algorithm works around them.
    """
    pinned = pinned or {}

    # Get current program
    pref_result = await session.execute(
        select(UserPreference).where(
            UserPreference.session_id == session_id,
            UserPreference.key == "selected_program",
        )
    )
    pref = pref_result.scalar_one_or_none()
    program = pref.value if pref else "seas_cs_bse"

    engine = RequirementEngine(program)

    # Load all plan courses for this session
    result = await session.execute(
        select(PlanCourse)
        .where(PlanCourse.session_id == session_id)
        .options(
            selectinload(PlanCourse.course),
            selectinload(PlanCourse.assignments),
        )
    )
    plan_courses = result.scalars().all()

    # Build completed_courses map
    completed_courses: dict[str, list[str]] = {}
    for pc in plan_courses:
        attrs_result = await session.execute(
            select(CourseAttribute).where(CourseAttribute.course_id == pc.course_id)
        )
        attr_codes = [a.attribute_code for a in attrs_result.scalars()]
        completed_courses[pc.course_id] = attr_codes

    # Clear existing assignments
    for pc in plan_courses:
        for a in pc.assignments:
            await session.delete(a)

    # Run auto-assignment with pinned constraints
    new_assignments = engine.auto_assign(completed_courses, pinned=pinned)

    # Build course_id -> plan_course_id mapping
    course_to_plan: dict[str, int] = {pc.course_id: pc.id for pc in plan_courses}

    for req_id, course_id in new_assignments.items():
        plan_course_id = course_to_plan.get(course_id)
        if not plan_course_id:
            continue
        category = req_id.split(".")[0] if "." in req_id else ""
        assignment = RequirementAssignment(
            plan_course_id=plan_course_id,
            requirement_id=req_id,
            category=category,
        )
        session.add(assignment)


def _plan_course_to_schema(pc: PlanCourse) -> PlanCourseSchema:
    return PlanCourseSchema(
        id=pc.id,
        course=CourseListSchema.model_validate(pc.course),
        semester=pc.semester,
        status=pc.status,
        grade=pc.grade,
        assignments=[a.requirement_id for a in pc.assignments],
    )


@router.get("/courses", response_model=list[PlanCourseSchema])
async def list_plan_courses(
    status: str | None = None,
    semester: str | None = None,
    session: AsyncSession = Depends(get_session),
    session_id: str = Depends(get_session_id),
):
    stmt = (
        select(PlanCourse)
        .where(PlanCourse.session_id == session_id)
        .options(selectinload(PlanCourse.course), selectinload(PlanCourse.assignments))
    )
    if status:
        stmt = stmt.where(PlanCourse.status == status)
    if semester:
        stmt = stmt.where(PlanCourse.semester == semester)
    stmt = stmt.order_by(PlanCourse.semester, PlanCourse.id)

    result = await session.execute(stmt)
    return [_plan_course_to_schema(pc) for pc in result.scalars().all()]


@router.post("/courses", response_model=PlanCourseSchema)
async def add_plan_course(
    body: AddPlanCourseRequest,
    session: AsyncSession = Depends(get_session),
    session_id: str = Depends(get_session_id),
):
    # Verify course exists in DB
    course = await session.get(Course, body.course_id)
    if not course:
        # Try to create a placeholder course entry
        course = Course(id=body.course_id, title=body.course_id)
        session.add(course)

    # Check for duplicate within this user's plan
    existing = await session.execute(
        select(PlanCourse).where(
            PlanCourse.course_id == body.course_id,
            PlanCourse.session_id == session_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Course {body.course_id} already in plan")

    pc = PlanCourse(
        course_id=body.course_id,
        semester=body.semester,
        status=body.status,
        session_id=session_id,
    )
    session.add(pc)
    await session.flush()

    # If a target requirement was specified (from slot-fill modal), pin it
    pinned: dict[str, str] = {}
    if body.target_requirement_id:
        pinned[body.target_requirement_id] = body.course_id

    # Auto-assign all courses to requirements, respecting pinned
    await _run_auto_assign(session, session_id=session_id, pinned=pinned)

    await session.commit()
    await session.refresh(pc, ["course", "assignments"])
    return _plan_course_to_schema(pc)


@router.put("/courses/{plan_course_id}", response_model=PlanCourseSchema)
async def update_plan_course(
    plan_course_id: int,
    body: UpdatePlanCourseRequest,
    session: AsyncSession = Depends(get_session),
    session_id: str = Depends(get_session_id),
):
    pc = await session.get(PlanCourse, plan_course_id)
    if not pc or pc.session_id != session_id:
        raise HTTPException(status_code=404, detail="Plan course not found")

    if body.semester is not None:
        pc.semester = body.semester
    if body.status is not None:
        pc.status = body.status
    if body.grade is not None:
        pc.grade = body.grade

    # Re-run auto-assign after status change
    await _run_auto_assign(session, session_id=session_id)

    await session.commit()
    await session.refresh(pc, ["course", "assignments"])
    return _plan_course_to_schema(pc)


@router.delete("/courses/{plan_course_id}")
async def remove_plan_course(
    plan_course_id: int,
    session: AsyncSession = Depends(get_session),
    session_id: str = Depends(get_session_id),
):
    pc = await session.get(PlanCourse, plan_course_id)
    if not pc or pc.session_id != session_id:
        raise HTTPException(status_code=404, detail="Plan course not found")

    # Delete assignments first
    result = await session.execute(
        select(RequirementAssignment).where(RequirementAssignment.plan_course_id == pc.id)
    )
    for assignment in result.scalars():
        await session.delete(assignment)

    await session.delete(pc)
    await session.flush()

    # Re-run auto-assign for remaining courses
    await _run_auto_assign(session, session_id=session_id)

    await session.commit()
    return {"deleted": True}
