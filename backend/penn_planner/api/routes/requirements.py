from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from penn_planner.db import get_session
from penn_planner.models import Course, CourseAttribute, PlanCourse, RequirementAssignment
from penn_planner.schemas import (
    AssignmentRequest,
    CategoryProgressSchema,
    GeneratedPlan,
    PlanEvaluationSchema,
    PlanSlot,
    PlanSlotOption,
    RequirementAssignmentSchema,
    RequirementStatusSchema,
)
from penn_planner.services.requirement_engine import RequirementEngine

router = APIRouter(prefix="/requirements", tags=["requirements"])


async def _build_context(session: AsyncSession, program: str = "seas_cs_bse"):
    """Build requirement engine context from DB state."""
    engine = RequirementEngine(program)

    # Load plan courses with attributes
    result = await session.execute(
        select(PlanCourse).options(
            selectinload(PlanCourse.course),
            selectinload(PlanCourse.assignments),
        )
    )
    plan_courses = result.scalars().all()

    # Build completed_courses: course_id -> [attribute_codes]
    completed_courses: dict[str, list[str]] = {}
    for pc in plan_courses:
        attrs_result = await session.execute(
            select(CourseAttribute).where(CourseAttribute.course_id == pc.course_id)
        )
        attr_codes = [a.attribute_code for a in attrs_result.scalars()]
        completed_courses[pc.course_id] = attr_codes

    # Build assignments: requirement_id -> course_id
    assignments: dict[str, str] = {}
    for pc in plan_courses:
        for a in pc.assignments:
            assignments[a.requirement_id] = pc.course_id

    return engine, completed_courses, assignments, plan_courses


@router.get("/programs")
async def list_programs():
    """List available degree programs."""
    return RequirementEngine.list_programs()


@router.get("/progress", response_model=PlanEvaluationSchema)
async def get_progress(
    program: str = "seas_cs_bse",
    session: AsyncSession = Depends(get_session),
):
    """Get current degree progress."""
    engine, completed_courses, assignments, _ = await _build_context(session, program)
    evaluation = engine.evaluate_plan(completed_courses, assignments)

    return PlanEvaluationSchema(
        total_cu_completed=evaluation.total_cu_completed,
        total_cu_required=evaluation.total_cu_required,
        overall_progress=evaluation.overall_progress,
        categories=[
            CategoryProgressSchema(
                category_id=cat.category_id,
                category_name=cat.category_name,
                fulfilled=cat.fulfilled,
                total=cat.total,
                requirements=[
                    RequirementStatusSchema(
                        requirement_id=r.requirement_id,
                        name=r.name,
                        is_fulfilled=r.is_fulfilled,
                        assigned_course=r.assigned_course,
                    )
                    for r in cat.requirements
                ],
            )
            for cat in evaluation.categories
        ],
        warnings=evaluation.warnings,
    )


@router.post("/assign", response_model=RequirementAssignmentSchema)
async def assign_course(
    body: AssignmentRequest,
    session: AsyncSession = Depends(get_session),
):
    """Manually assign a plan course to a requirement slot."""
    pc = await session.get(PlanCourse, body.plan_course_id)
    if not pc:
        raise HTTPException(status_code=404, detail="Plan course not found")

    # Check if requirement is already assigned
    existing = await session.execute(
        select(RequirementAssignment).where(
            RequirementAssignment.requirement_id == body.requirement_id
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Requirement {body.requirement_id} already assigned")

    # Extract category from requirement_id
    category = body.requirement_id.split(".")[0] if "." in body.requirement_id else ""

    assignment = RequirementAssignment(
        plan_course_id=body.plan_course_id,
        requirement_id=body.requirement_id,
        category=category,
    )
    session.add(assignment)
    await session.commit()
    await session.refresh(assignment)
    return RequirementAssignmentSchema.model_validate(assignment)


@router.delete("/assign/{assignment_id}")
async def unassign_course(
    assignment_id: int,
    session: AsyncSession = Depends(get_session),
):
    assignment = await session.get(RequirementAssignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    await session.delete(assignment)
    await session.commit()
    return {"deleted": True}


@router.get("/slot-candidates")
async def get_slot_candidates(
    requirement_id: str = "",
    program: str = "seas_cs_bse",
    q: str = "",
    session: AsyncSession = Depends(get_session),
):
    """Given a requirement slot, find courses that could fill it.
    Searches the DB for matching courses (by attribute or specific ID).
    If user provides a search query q, also searches broadly.
    Optionally filters by search query q."""
    from penn_planner.models import Course
    from sqlalchemy.orm import selectinload
    from sqlalchemy import or_

    engine = RequirementEngine(program)

    # Find the requirement definition
    req_def = None
    for cat in engine.requirements.get("categories", []):
        for r in cat.get("requirements", []):
            if r["id"] == requirement_id:
                req_def = r
                break

    if not req_def:
        return []

    # If user is actively searching, do a broad search filtered by query
    # This lets users type any course name/code even if not in the requirement spec
    if q:
        pattern = f"%{q}%"
        hyphenated = q.replace(" ", "-")
        stmt = (
            select(Course)
            .options(selectinload(Course.attributes))
            .where(
                Course.id.ilike(pattern) | Course.id.ilike(f"%{hyphenated}%") | Course.title.ilike(pattern)
            )
            .order_by(Course.course_quality.desc().nullslast())
            .limit(30)
        )
        result = await session.execute(stmt)
        courses = result.scalars().all()
    else:
        # No search query: show matching courses based on requirement type
        req_type = req_def.get("type", "")
        courses = []

        if req_type == "attribute_filter":
            attr_codes = req_def.get("attribute_codes", [])
            if attr_codes:
                stmt = (
                    select(Course)
                    .options(selectinload(Course.attributes))
                    .join(CourseAttribute)
                    .where(CourseAttribute.attribute_code.in_(attr_codes))
                    .distinct()
                    .order_by(Course.course_quality.desc().nullslast())
                    .limit(30)
                )
                result = await session.execute(stmt)
                courses = result.scalars().all()

        elif req_type in ("specific_course", "choice"):
            allowed = req_def.get("courses", [])
            if allowed:
                stmt = (
                    select(Course)
                    .options(selectinload(Course.attributes))
                    .where(Course.id.in_(allowed))
                    .order_by(Course.course_quality.desc().nullslast())
                    .limit(30)
                )
                result = await session.execute(stmt)
                courses = result.scalars().all()

                # If no courses found in DB, search by department prefix
                if not courses:
                    depts = set()
                    for cid in allowed:
                        if "-" in cid:
                            depts.add(cid.split("-")[0])
                    if depts:
                        conditions = [Course.id.like(f"{d}-%") for d in depts]
                        stmt = (
                            select(Course)
                            .options(selectinload(Course.attributes))
                            .where(or_(*conditions))
                            .order_by(Course.course_quality.desc().nullslast())
                            .limit(30)
                        )
                        result = await session.execute(stmt)
                        courses = result.scalars().all()

        elif req_type == "choice_or_attribute":
            allowed = req_def.get("courses", [])
            attr_codes = req_def.get("attribute_codes", [])
            conditions = []
            if allowed:
                conditions.append(Course.id.in_(allowed))
            if attr_codes:
                stmt_base = (
                    select(Course)
                    .options(selectinload(Course.attributes))
                    .outerjoin(CourseAttribute)
                )
                if allowed:
                    stmt_base = stmt_base.where(
                        Course.id.in_(allowed) | CourseAttribute.attribute_code.in_(attr_codes)
                    )
                else:
                    stmt_base = stmt_base.where(CourseAttribute.attribute_code.in_(attr_codes))
                stmt = stmt_base.distinct().order_by(Course.course_quality.desc().nullslast()).limit(30)
                result = await session.execute(stmt)
                courses = result.scalars().all()
            elif allowed:
                stmt = (
                    select(Course)
                    .options(selectinload(Course.attributes))
                    .where(Course.id.in_(allowed))
                    .order_by(Course.course_quality.desc().nullslast())
                    .limit(30)
                )
                result = await session.execute(stmt)
                courses = result.scalars().all()

        elif req_type == "any":
            # For "any" type, show top-rated courses
            stmt = (
                select(Course)
                .options(selectinload(Course.attributes))
                .order_by(Course.course_quality.desc().nullslast())
                .limit(30)
            )
            result = await session.execute(stmt)
            courses = result.scalars().all()

    # Exclude courses already in the plan
    plan_result = await session.execute(select(PlanCourse))
    plan_course_ids = {pc.course_id for pc in plan_result.scalars()}

    return [
        {
            "id": c.id,
            "title": c.title,
            "credits": c.credits,
            "difficulty": c.difficulty,
            "course_quality": c.course_quality,
            "in_plan": c.id in plan_course_ids,
        }
        for c in courses
    ]


@router.post("/auto-assign", response_model=list[RequirementAssignmentSchema])
async def auto_assign(
    program: str = "seas_cs_bse",
    session: AsyncSession = Depends(get_session),
):
    """Auto-assign all plan courses to optimal requirement slots."""
    engine, completed_courses, _, plan_courses = await _build_context(session, program)

    # Clear existing assignments
    for pc in plan_courses:
        result = await session.execute(
            select(RequirementAssignment).where(RequirementAssignment.plan_course_id == pc.id)
        )
        for a in result.scalars():
            await session.delete(a)

    # Run auto-assignment
    new_assignments = engine.auto_assign(completed_courses)

    # Create DB records
    # Build course_id -> plan_course_id mapping
    course_to_plan: dict[str, int] = {pc.course_id: pc.id for pc in plan_courses}

    created = []
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
        created.append(assignment)

    await session.commit()
    for a in created:
        await session.refresh(a)

    return [RequirementAssignmentSchema.model_validate(a) for a in created]


@router.get("/generate-plan", response_model=GeneratedPlan)
async def generate_plan(
    program: str = "seas_cs_bse",
    prefer_easy: bool = True,
    session: AsyncSession = Depends(get_session),
):
    """Generate a tentative plan to complete all remaining degree requirements.

    For each unfulfilled requirement slot, finds the best course option
    plus up to 3 alternatives, scored by quality, difficulty, and fit.
    Uses a greedy assignment to avoid recommending the same course for
    multiple slots.
    """
    engine, completed_courses, assignments, plan_courses = await _build_context(
        session, program
    )

    # Count already completed
    already_completed = sum(
        1
        for cat in engine.requirements.get("categories", [])
        for req in cat.get("requirements", [])
        if req["id"] in assignments
    )

    total_slots = sum(
        len(cat.get("requirements", []))
        for cat in engine.requirements.get("categories", [])
    )

    unfulfilled = engine.get_unfulfilled_requirements(assignments)

    if not unfulfilled:
        return GeneratedPlan(
            program=program,
            total_slots=total_slots,
            filled_slots=total_slots,
            already_completed=already_completed,
            slots=[],
        )

    # Load all courses with attributes
    from sqlalchemy.orm import selectinload

    result = await session.execute(
        select(Course).options(selectinload(Course.attributes))
    )
    all_courses = result.scalars().all()

    # Build lookup: course_id -> (Course, [attr_codes])
    course_lookup: dict[str, tuple[Course, list[str]]] = {}
    for c in all_courses:
        attrs = [a.attribute_code for a in c.attributes] if c.attributes else []
        course_lookup[c.id] = (c, attrs)

    # IDs already in the user's plan (completed or planned)
    plan_ids = {pc.course_id for pc in plan_courses}

    # Track which courses we've already assigned in this generated plan
    used_courses: set[str] = set(plan_ids)

    target_diff = 1.5 if prefer_easy else 2.5

    def score_candidate(course: Course) -> float:
        """Score a course for general desirability."""
        s = 0.0
        # Quality (0-40)
        if course.course_quality is not None:
            s += (course.course_quality / 4.0) * 40
        else:
            s += 20
        # Difficulty match (0-30)
        if course.difficulty is not None:
            if prefer_easy:
                s += max(0, 30 - course.difficulty * 7.5)
            else:
                s += max(0, 30 - abs(course.difficulty - target_diff) * 10)
        else:
            s += 15
        # Popularity proxy (0-15)
        import json

        try:
            sections = json.loads(course.sections_json or "[]")
            s += min(len(sections) * 3, 15)
        except (ValueError, TypeError):
            s += 7.5
        # Prereq bonus (0-15) — no prereqs = easier to take
        if not (course.prerequisites or "").strip():
            s += 15
        else:
            s += 5
        return round(s, 1)

    slots: list[PlanSlot] = []

    # Process unfulfilled requirements — specific/choice first, then attribute, then any
    # Sort so specific courses get first pick of the course pool
    type_order = {"specific_course": 0, "choice": 1, "choice_or_attribute": 2, "attribute_filter": 3, "any": 4}
    sorted_unfulfilled = sorted(unfulfilled, key=lambda r: type_order.get(r.get("type", ""), 5))

    for req in sorted_unfulfilled:
        # Find all courses that satisfy this requirement
        candidates: list[tuple[Course, float]] = []
        for cid, (course, attrs) in course_lookup.items():
            if cid in used_courses:
                continue
            if engine.check_course_satisfies(cid, attrs, req):
                candidates.append((course, score_candidate(course)))

        # Sort by score descending
        candidates.sort(key=lambda x: x[1], reverse=True)

        recommended = None
        alternatives: list[PlanSlotOption] = []

        if candidates:
            best_course, best_score = candidates[0]
            recommended = PlanSlotOption(
                course_id=best_course.id,
                title=best_course.title,
                difficulty=best_course.difficulty,
                course_quality=best_course.course_quality,
                score=best_score,
            )
            # Reserve this course
            used_courses.add(best_course.id)

            # Up to 3 alternatives (don't reserve them — user might swap)
            for alt_course, alt_score in candidates[1:4]:
                alternatives.append(
                    PlanSlotOption(
                        course_id=alt_course.id,
                        title=alt_course.title,
                        difficulty=alt_course.difficulty,
                        course_quality=alt_course.course_quality,
                        score=alt_score,
                    )
                )

        slots.append(
            PlanSlot(
                requirement_id=req["id"],
                requirement_name=req["name"],
                category_id=req.get("category_id", ""),
                category_name=req.get("category_name", ""),
                recommended=recommended,
                alternatives=alternatives,
            )
        )

    filled_slots = already_completed + sum(1 for s in slots if s.recommended is not None)

    return GeneratedPlan(
        program=program,
        total_slots=total_slots,
        filled_slots=filled_slots,
        already_completed=already_completed,
        slots=slots,
    )
