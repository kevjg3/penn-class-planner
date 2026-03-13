import json
from dataclasses import dataclass, field
from pathlib import Path

from penn_planner.models import Course


REQUIREMENTS_DIR = Path(__file__).parent.parent / "data" / "requirements"


@dataclass
class RequirementStatus:
    requirement_id: str
    name: str
    is_fulfilled: bool
    assigned_course: str | None = None


@dataclass
class CategoryProgress:
    category_id: str
    category_name: str
    fulfilled: int
    total: int
    requirements: list[RequirementStatus] = field(default_factory=list)


@dataclass
class PlanEvaluation:
    total_cu_completed: float
    total_cu_required: float
    overall_progress: float
    categories: list[CategoryProgress] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class RequirementEngine:
    def __init__(self, program_id: str | None = None):
        self.requirements: dict = {}
        if program_id:
            self.load_program(program_id)

    @staticmethod
    def list_programs() -> list[dict]:
        """List all available program requirement definitions."""
        programs = []
        for path in REQUIREMENTS_DIR.glob("*.json"):
            with open(path) as f:
                data = json.load(f)
            programs.append({
                "id": path.stem,
                "degree": data.get("degree", path.stem),
                "total_cu": data.get("total_cu", 0),
            })
        return programs

    def load_program(self, program_id: str):
        """Load a program's requirement definitions from JSON."""
        path = REQUIREMENTS_DIR / f"{program_id}.json"
        if not path.exists():
            raise FileNotFoundError(f"Program '{program_id}' not found at {path}")
        with open(path) as f:
            self.requirements = json.load(f)

    def check_course_satisfies(self, course_id: str, course_attributes: list[str], requirement: dict) -> bool:
        """Check if a course satisfies a specific requirement slot.

        Args:
            course_id: e.g. "CIS-1200"
            course_attributes: list of attribute codes the course has, e.g. ["EUCR", "EUMS"]
            requirement: a requirement dict from the JSON
        """
        req_type = requirement.get("type", "")

        if req_type == "specific_course":
            return course_id in requirement.get("courses", [])

        elif req_type == "choice":
            return course_id in requirement.get("courses", [])

        elif req_type == "attribute_filter":
            target_attrs = set(requirement.get("attribute_codes", []))
            dept_filter = requirement.get("dept_filter")
            if dept_filter:
                dept = course_id.split("-")[0] if "-" in course_id else ""
                if dept not in dept_filter:
                    return False
            return bool(target_attrs & set(course_attributes))

        elif req_type == "choice_or_attribute":
            if course_id in requirement.get("courses", []):
                return True
            target_attrs = set(requirement.get("attribute_codes", []))
            return bool(target_attrs & set(course_attributes))

        elif req_type == "any":
            return True

        return False

    def evaluate_plan(
        self,
        completed_courses: dict[str, list[str]],
        assignments: dict[str, str],
    ) -> PlanEvaluation:
        """Evaluate the user's plan against degree requirements.

        Args:
            completed_courses: mapping of course_id -> list of attribute codes
            assignments: mapping of requirement_id -> course_id
        """
        if not self.requirements:
            return PlanEvaluation(0, 0, 0)

        total_cu_required = self.requirements.get("total_cu", 37)
        total_cu_completed = 0.0
        categories: list[CategoryProgress] = []
        warnings: list[str] = []

        for category in self.requirements.get("categories", []):
            cat_id = category["id"]
            cat_name = category["name"]
            req_statuses: list[RequirementStatus] = []
            fulfilled = 0

            for req in category.get("requirements", []):
                req_id = req["id"]
                assigned_course = assignments.get(req_id)
                is_fulfilled = False

                if assigned_course:
                    attrs = completed_courses.get(assigned_course, [])
                    if self.check_course_satisfies(assigned_course, attrs, req):
                        is_fulfilled = True
                        fulfilled += 1
                        total_cu_completed += req.get("cu", 1)
                    else:
                        warnings.append(
                            f"Course {assigned_course} assigned to {req_id} does not satisfy the requirement"
                        )

                req_statuses.append(RequirementStatus(
                    requirement_id=req_id,
                    name=req["name"],
                    is_fulfilled=is_fulfilled,
                    assigned_course=assigned_course if is_fulfilled else None,
                ))

            categories.append(CategoryProgress(
                category_id=cat_id,
                category_name=cat_name,
                fulfilled=fulfilled,
                total=len(category.get("requirements", [])),
                requirements=req_statuses,
            ))

        overall = total_cu_completed / total_cu_required if total_cu_required > 0 else 0

        return PlanEvaluation(
            total_cu_completed=total_cu_completed,
            total_cu_required=total_cu_required,
            overall_progress=round(overall, 3),
            categories=categories,
            warnings=warnings,
        )

    def get_unfulfilled_requirements(self, assignments: dict[str, str]) -> list[dict]:
        """Return requirement dicts that have no course assigned."""
        unfulfilled = []
        for category in self.requirements.get("categories", []):
            for req in category.get("requirements", []):
                if req["id"] not in assignments:
                    unfulfilled.append({**req, "category_id": category["id"], "category_name": category["name"]})
        return unfulfilled

    def suggest_assignments_for_course(
        self,
        course_id: str,
        course_attributes: list[str],
        existing_assignments: dict[str, str],
    ) -> list[str]:
        """Given a course, return requirement IDs it could satisfy (that aren't already assigned)."""
        suggestions = []
        for category in self.requirements.get("categories", []):
            for req in category.get("requirements", []):
                if req["id"] in existing_assignments:
                    continue
                if self.check_course_satisfies(course_id, course_attributes, req):
                    suggestions.append(req["id"])
        return suggestions

    def auto_assign(
        self,
        completed_courses: dict[str, list[str]],
    ) -> dict[str, str]:
        """Auto-assign completed courses to requirement slots.

        Uses greedy approach: assign specific_course/choice requirements first,
        then attribute-based, then any.
        """
        assignments: dict[str, str] = {}
        used_courses: set[str] = set()

        # Pass 1: specific_course and choice (exact matches)
        for category in self.requirements.get("categories", []):
            for req in category.get("requirements", []):
                if req["id"] in assignments:
                    continue
                if req.get("type") not in ("specific_course", "choice", "choice_or_attribute"):
                    continue
                for course_id, attrs in completed_courses.items():
                    if course_id in used_courses:
                        continue
                    if self.check_course_satisfies(course_id, attrs, req):
                        assignments[req["id"]] = course_id
                        used_courses.add(course_id)
                        break

        # Pass 2: attribute_filter
        for category in self.requirements.get("categories", []):
            for req in category.get("requirements", []):
                if req["id"] in assignments:
                    continue
                if req.get("type") != "attribute_filter":
                    continue
                for course_id, attrs in completed_courses.items():
                    if course_id in used_courses:
                        continue
                    if self.check_course_satisfies(course_id, attrs, req):
                        assignments[req["id"]] = course_id
                        used_courses.add(course_id)
                        break

        # Pass 3: any
        for category in self.requirements.get("categories", []):
            for req in category.get("requirements", []):
                if req["id"] in assignments:
                    continue
                if req.get("type") != "any":
                    continue
                for course_id in completed_courses:
                    if course_id in used_courses:
                        continue
                    assignments[req["id"]] = course_id
                    used_courses.add(course_id)
                    break

        return assignments
