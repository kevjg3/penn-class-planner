import json

from penn_planner.models import Course
from penn_planner.services.requirement_engine import RequirementEngine


class RecommendationEngine:
    """Scores and ranks courses for personalized recommendations."""

    WEIGHTS = {
        "requirement_fit": 30,
        "course_quality": 25,
        "difficulty_match": 20,
        "prerequisite_ready": 15,
        "popularity": 10,
    }

    def __init__(self, requirement_engine: RequirementEngine):
        self.req_engine = requirement_engine

    def score_course(
        self,
        course: Course,
        unfulfilled: list[dict],
        completed_course_ids: set[str],
        preferences: dict,
    ) -> dict:
        """Calculate composite score for a candidate course.

        Returns dict with score, breakdown, reasons, and fulfills_requirements.
        """
        course_attrs = self._get_attrs(course)
        breakdown: dict[str, float] = {}

        # 1. Requirement fit (0-30)
        matching_reqs = [
            r for r in unfulfilled
            if self.req_engine.check_course_satisfies(course.id, course_attrs, r)
        ]
        if matching_reqs:
            is_core = any(r.get("type") in ("specific_course", "choice") for r in matching_reqs)
            breakdown["requirement_fit"] = 30.0 if is_core else 20.0 + min(len(matching_reqs) * 3, 10)
        else:
            breakdown["requirement_fit"] = 0.0

        # 2. Course quality (0-25)
        if course.course_quality is not None:
            breakdown["course_quality"] = (course.course_quality / 4.0) * 25
        else:
            breakdown["course_quality"] = 12.5

        # 3. Difficulty match (0-20)
        prefer_easy = preferences.get("prefer_low_difficulty", True)
        target_diff = preferences.get("target_difficulty", 1.5 if prefer_easy else 2.5)
        if course.difficulty is not None:
            if prefer_easy:
                # Lower difficulty = higher score
                breakdown["difficulty_match"] = max(0, 20 - course.difficulty * 5)
            else:
                diff_distance = abs(course.difficulty - target_diff)
                breakdown["difficulty_match"] = max(0, 20 - diff_distance * 8)
        else:
            breakdown["difficulty_match"] = 10.0

        # 4. Prerequisite readiness (0-15)
        # Simple heuristic: check if prereq text mentions courses we've taken
        prereq_text = course.prerequisites or ""
        if not prereq_text.strip():
            breakdown["prerequisite_ready"] = 15.0
        else:
            met_count = sum(1 for cid in completed_course_ids if cid.replace("-", " ") in prereq_text or cid in prereq_text)
            # Rough heuristic: if at least some prereqs appear to be met
            breakdown["prerequisite_ready"] = 15.0 if met_count > 0 else 5.0

        # 5. Popularity (0-10)
        try:
            sections = json.loads(course.sections_json or "[]")
            breakdown["popularity"] = min(len(sections) * 2, 10)
        except (json.JSONDecodeError, TypeError):
            breakdown["popularity"] = 5.0

        total = sum(breakdown.values())

        # Generate reasons
        reasons = []
        if matching_reqs:
            names = [r["name"] for r in matching_reqs[:3]]
            reasons.append(f"Fulfills: {', '.join(names)}")
        if course.course_quality and course.course_quality >= 3.0:
            reasons.append(f"Highly rated ({course.course_quality:.1f}/4.0)")
        if course.difficulty is not None and course.difficulty <= 2.0:
            reasons.append(f"Low difficulty ({course.difficulty:.1f}/4.0)")
        if breakdown.get("prerequisite_ready", 0) >= 15:
            reasons.append("Prerequisites met")

        return {
            "course": course,
            "score": round(total, 1),
            "reasons": reasons,
            "fulfills_requirements": [r["id"] for r in matching_reqs],
            "score_breakdown": breakdown,
        }

    def rank_candidates(
        self,
        candidates: list[Course],
        unfulfilled: list[dict],
        completed_course_ids: set[str],
        planned_course_ids: set[str],
        preferences: dict,
        n: int = 10,
        category_filter: str | None = None,
    ) -> list[dict]:
        """Score and rank candidate courses."""
        if category_filter:
            unfulfilled = [r for r in unfulfilled if r.get("category_id") == category_filter]

        scored = []
        for course in candidates:
            if course.id in planned_course_ids or course.id in completed_course_ids:
                continue
            result = self.score_course(course, unfulfilled, completed_course_ids, preferences)
            if result["score"] > 0 and result["fulfills_requirements"]:
                scored.append(result)

        scored.sort(key=lambda r: r["score"], reverse=True)
        return scored[:n]

    @staticmethod
    def _get_attrs(course: Course) -> list[str]:
        try:
            return [a.attribute_code for a in course.attributes] if course.attributes else []
        except Exception:
            try:
                attrs_data = json.loads(course.attributes_json or "[]")
                if isinstance(attrs_data, list):
                    return [a.get("code", a) if isinstance(a, dict) else str(a) for a in attrs_data]
            except (json.JSONDecodeError, TypeError):
                pass
            return []
