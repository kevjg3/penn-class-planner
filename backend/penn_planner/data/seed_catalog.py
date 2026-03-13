"""Seed the local database with course data from Penn Course Review API.

Strategy:
1. Search by department to discover course IDs (returns basic info: title, difficulty, quality)
2. For each discovered course, fetch full detail (attributes, sections, prerequisites)
3. Store everything in the local SQLite DB
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


# Comprehensive list of departments across all Penn schools
SEED_DEPARTMENTS = [
    # SEAS
    "CIS", "NETS", "ESE", "MEAM", "BE", "ENM", "EAS", "CBE", "MSE",
    # CAS - Sciences
    "MATH", "PHYS", "CHEM", "BIOL", "ASTR",
    # CAS - Social Sciences
    "ECON", "PSCI", "PSYC", "SOCI", "ANTH", "LING", "CRIM",
    # CAS - Humanities
    "ENGL", "PHIL", "HIST", "RELS", "CLST", "GRMN", "FREN",
    "SPAN", "ITAL", "JPAN", "CHIN", "KORN", "ARAB", "HEBR",
    "RUSS", "LALS", "AFRC", "ASAM", "GSWS",
    # CAS - Arts
    "ARTH", "FNAR", "MUSC", "THAR", "CINE", "DSGN",
    # CAS - Other
    "COMM", "PPE", "STSC", "VLST", "URBS",
    # Wharton
    "ACCT", "BEPP", "FNCE", "LGST", "MGMT", "MKTG", "OIDD",
    "REAL", "STAT", "HCMG",
    # Other
    "WRIT", "NURS", "EDUC", "CIMS", "PLSH",
    "AAMW", "NELC", "SAST", "EALC",
]

# Attribute codes to also pull courses for (catches cross-listed courses)
SEARCH_ATTRIBUTES = [
    # SEAS
    "EUSS", "EUHS", "EUTB", "EUMS", "EUNS", "EUCR", "EUCU", "EUNG",
    # CAS Sectors
    "AUHS", "AUSS", "AUNS", "AUQA", "AULF", "AULC", "AUGC", "AUHA",
    # Other common attributes
    "EUDM", "EUEC", "EUEI", "EUEN", "EUNE", "EUNP", "EUSI",
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


async def discover_course_ids(client: PCRClient, semester: str = "current") -> set[str]:
    """Discover course IDs via department search and attribute search."""
    all_ids: set[str] = set()

    # Phase 1: by department
    for dept in SEED_DEPARTMENTS:
        print(f"  Searching {dept}...", end=" ", flush=True)
        try:
            results = await client.get_all_courses_for_dept(dept, semester)
            dept_ids = {r["id"] for r in results if r.get("id")}
            all_ids |= dept_ids
            print(f"{len(dept_ids)} courses")
        except Exception as e:
            print(f"Error: {e}")
        await asyncio.sleep(0.1)

    # Phase 2: by SEAS attributes (catches cross-listed courses in other departments)
    for attr in SEARCH_ATTRIBUTES:
        print(f"  Searching attribute {attr}...", end=" ", flush=True)
        try:
            results = await client.get_courses_by_attribute(attr, semester)
            attr_ids = {r["id"] for r in results if r.get("id")}
            new = attr_ids - all_ids
            all_ids |= attr_ids
            print(f"{len(new)} new courses")
        except Exception as e:
            print(f"Error: {e}")
        await asyncio.sleep(0.1)

    return all_ids


async def main():
    print("Initializing database...")
    await init_db()

    semester = sys.argv[1] if len(sys.argv) > 1 else "current"
    print(f"\nSeeding courses for semester: {semester}")

    client = PCRClient()
    try:
        # Step 1: Discover all course IDs
        print("\n--- Phase 1: Discover course IDs ---")
        course_ids = await discover_course_ids(client, semester)
        print(f"\nTotal unique courses discovered: {len(course_ids)}")

        # Step 2: Fetch full details for each course
        print(f"\n--- Phase 2: Fetch course details ---")
        batch_size = 10
        ids_list = sorted(course_ids)
        success = 0
        fail = 0

        async with async_session() as session:
            for i in range(0, len(ids_list), batch_size):
                batch = ids_list[i : i + batch_size]
                tasks = [fetch_and_store_course(client, cid, session, semester) for cid in batch]
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
