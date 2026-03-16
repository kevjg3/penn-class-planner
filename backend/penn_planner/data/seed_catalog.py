"""Seed the local database with course data from Penn Course Review API.

Strategy:
1. Search by department across MULTIPLE SEMESTERS to discover all course IDs
   (courses not offered every semester still have reviews from past semesters)
2. Also search by attribute codes to catch cross-listed courses
3. For each discovered course, fetch full detail (attributes, sections, prerequisites)
4. Store everything in the local SQLite DB
"""

import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from sqlalchemy import func, select

from penn_planner.db import async_session, init_db
from penn_planner.models import Course, CourseAttribute
from penn_planner.services.pcr_client import PCRClient


# Semesters to search across: Spring + Fall 2025, plus Fall 2026 for upcoming offerings
# A = Spring, C = Fall
SEED_SEMESTERS = ["2025A", "2025C", "2026C"]

# Comprehensive list of departments across all Penn schools
SEED_DEPARTMENTS = [
    # SEAS
    "CIS", "NETS", "ESE", "MEAM", "BE", "ENM", "EAS", "CBE", "MSE",
    "IPD", "ENGR",
    # CAS - Sciences
    "MATH", "PHYS", "CHEM", "BIOL", "ASTR", "GCB", "CAMB", "BMB",
    # CAS - Social Sciences
    "ECON", "PSCI", "PSYC", "SOCI", "ANTH", "LING", "CRIM", "DEMG",
    # CAS - Humanities
    "ENGL", "PHIL", "HIST", "RELS", "CLST", "GRMN", "FREN",
    "SPAN", "ITAL", "JPAN", "CHIN", "KORN", "ARAB", "HEBR",
    "RUSS", "LALS", "AFRC", "ASAM", "GSWS", "COML", "ROML",
    # CAS - Arts
    "ARTH", "FNAR", "MUSC", "THAR", "CINE", "DSGN", "VLST",
    # CAS - Other
    "COMM", "PPE", "STSC", "URBS", "HSOC", "NEUR",
    # Wharton
    "ACCT", "BEPP", "FNCE", "LGST", "MGMT", "MKTG", "OIDD",
    "REAL", "STAT", "HCMG", "WH",
    # Nursing, Education, Other
    "WRIT", "NURS", "EDUC", "CIMS", "PLSH",
    "AAMW", "NELC", "SAST", "EALC", "THAR", "FOLK",
    "LSMP", "ENVS", "GREK", "LATN", "PORT", "SWAH",
    "TURK", "PERS", "HIND", "SARS", "TAML", "BENN",
]

# Attribute codes to also pull courses for (catches cross-listed courses)
SEARCH_ATTRIBUTES = [
    # SEAS
    "EUSS", "EUHS", "EUTB", "EUMS", "EUNS", "EUCR", "EUCU", "EUNG",
    "EUMA", "EUDM", "EUEC", "EUEI", "EUEN", "EUNE", "EUNP", "EUSI",
    # CAS Sectors
    "AUHS", "AUSS", "AUNS", "AUQA", "AULF", "AULC", "AUGC", "AUHA",
    # Wharton
    "WUFN", "WUMG", "WUMK", "WUOP", "WURE", "WUAC", "WUBE", "WULG",
    "WUST", "WUHC",
]


async def fetch_and_store_course(client: PCRClient, course_id: str, session, semester: str = "current") -> bool:
    """Fetch full course detail and store in DB. Returns True if successful."""
    try:
        detail = await client.get_course(course_id, semester)
    except Exception:
        return False

    attrs = detail.get("attributes", [])
    sections = detail.get("sections", [])
    cross = detail.get("crosslistings", [])

    # Upsert course
    existing = await session.get(Course, course_id)
    course_data = {
        "id": course_id,
        "title": detail.get("title", ""),
        "description": detail.get("description", ""),
        "credits": detail.get("credits", 1.0) or 1.0,
        "difficulty": detail.get("difficulty"),
        "course_quality": detail.get("course_quality"),
        "instructor_quality": detail.get("instructor_quality"),
        "work_required": detail.get("work_required"),
        "prerequisites": detail.get("prerequisites", "") or "",
        "semester": detail.get("semester", semester),
        "attributes_json": json.dumps(attrs),
        "sections_json": json.dumps(sections),
        "crosslistings_json": json.dumps(cross),
        "fetched_at": datetime.utcnow(),
    }

    if existing:
        for k, v in course_data.items():
            setattr(existing, k, v)
    else:
        session.add(Course(**course_data))

    # Clear old attributes and re-add
    old_attrs = await session.execute(
        select(CourseAttribute).where(CourseAttribute.course_id == course_id)
    )
    for oa in old_attrs.scalars():
        await session.delete(oa)

    for attr in attrs:
        if isinstance(attr, dict):
            session.add(CourseAttribute(
                course_id=course_id,
                attribute_code=attr.get("code", ""),
                school=attr.get("school"),
                description=attr.get("description", ""),
            ))

    return True


async def discover_course_ids(client: PCRClient) -> set[str]:
    """Discover course IDs via department search and attribute search across multiple semesters."""
    all_ids: set[str] = set()

    # Phase 1: by department across all semesters
    for dept in SEED_DEPARTMENTS:
        dept_ids: set[str] = set()
        for sem in SEED_SEMESTERS:
            try:
                results = await client.get_all_courses_for_dept(dept, sem)
                dept_ids |= {r["id"] for r in results if r.get("id")}
            except Exception:
                pass
            await asyncio.sleep(0.05)
        new = dept_ids - all_ids
        all_ids |= dept_ids
        print(f"  {dept}: {len(dept_ids)} courses ({len(new)} new)", flush=True)

    # Phase 2: by attribute codes across all semesters
    for attr in SEARCH_ATTRIBUTES:
        attr_ids: set[str] = set()
        for sem in SEED_SEMESTERS:
            try:
                results = await client.get_courses_by_attribute(attr, sem)
                attr_ids |= {r["id"] for r in results if r.get("id")}
            except Exception:
                pass
            await asyncio.sleep(0.05)
        new = attr_ids - all_ids
        all_ids |= attr_ids
        if new:
            print(f"  Attr {attr}: {len(new)} new courses", flush=True)

    return all_ids


async def fetch_course_best_semester(client: PCRClient, course_id: str, session) -> bool:
    """Try fetching course detail from multiple semesters, use the first that works."""
    for sem in SEED_SEMESTERS:
        result = await fetch_and_store_course(client, course_id, session, sem)
        if result:
            return True
    return False


async def main():
    print("Initializing database...")
    await init_db()

    print(f"\nSeeding courses across semesters: {', '.join(SEED_SEMESTERS)}")

    client = PCRClient()
    try:
        # Step 1: Discover all course IDs across all semesters
        print("\n--- Phase 1: Discover course IDs ---")
        course_ids = await discover_course_ids(client)
        print(f"\nTotal unique courses discovered: {len(course_ids)}")

        # Step 2: Fetch full details for each course (try multiple semesters)
        print(f"\n--- Phase 2: Fetch course details ---")
        batch_size = 10
        ids_list = sorted(course_ids)
        success = 0
        fail = 0

        async with async_session() as session:
            for i in range(0, len(ids_list), batch_size):
                batch = ids_list[i : i + batch_size]
                tasks = [fetch_course_best_semester(client, cid, session) for cid in batch]
                results = await asyncio.gather(*tasks)
                batch_ok = sum(1 for r in results if r)
                success += batch_ok
                fail += len(batch) - batch_ok
                print(f"  [{i + len(batch)}/{len(ids_list)}] fetched {batch_ok} ok, {len(batch) - batch_ok} failed", flush=True)
                await session.commit()
                await asyncio.sleep(0.05)

        # Summary
        async with async_session() as session:
            course_count = await session.scalar(select(func.count()).select_from(Course))
            attr_count = await session.scalar(select(func.count()).select_from(CourseAttribute))
            print(f"\n=== Seed Summary ===")
            print(f"Courses fetched: {success} ok, {fail} failed")
            print(f"Total courses in DB: {course_count}")
            print(f"Total attribute mappings: {attr_count}")

    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
