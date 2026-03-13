from pydantic import BaseModel


# --- Course schemas ---

class AttributeSchema(BaseModel):
    code: str
    school: str | None = None
    description: str = ""


class CourseListSchema(BaseModel):
    id: str
    title: str
    credits: float
    difficulty: float | None = None
    course_quality: float | None = None
    instructor_quality: float | None = None

    model_config = {"from_attributes": True}


class CourseDetailSchema(CourseListSchema):
    description: str = ""
    prerequisites: str = ""
    work_required: float | None = None
    attributes: list[AttributeSchema] = []
    crosslistings: list[str] = []


# --- Plan schemas ---

class AddPlanCourseRequest(BaseModel):
    course_id: str
    semester: str = ""
    status: str = "completed"


class UpdatePlanCourseRequest(BaseModel):
    semester: str | None = None
    status: str | None = None
    grade: str | None = None


class PlanCourseSchema(BaseModel):
    id: int
    course: CourseListSchema
    semester: str
    status: str
    grade: str | None = None
    assignments: list[str] = []

    model_config = {"from_attributes": True}


# --- Requirement schemas ---

class RequirementStatusSchema(BaseModel):
    requirement_id: str
    name: str
    is_fulfilled: bool
    assigned_course: str | None = None


class CategoryProgressSchema(BaseModel):
    category_id: str
    category_name: str
    fulfilled: int
    total: int
    requirements: list[RequirementStatusSchema]


class PlanEvaluationSchema(BaseModel):
    total_cu_completed: float
    total_cu_required: float
    overall_progress: float
    categories: list[CategoryProgressSchema]
    warnings: list[str] = []


class AssignmentRequest(BaseModel):
    plan_course_id: int
    requirement_id: str


class RequirementAssignmentSchema(BaseModel):
    id: int
    plan_course_id: int
    requirement_id: str
    category: str

    model_config = {"from_attributes": True}


# --- Recommendation schemas ---

class ScoreBreakdownSchema(BaseModel):
    requirement_fit: float
    course_quality: float
    difficulty_match: float
    prerequisite_ready: float
    popularity: float


class RecommendationSchema(BaseModel):
    course: CourseListSchema
    score: float
    reasons: list[str]
    fulfills_requirements: list[str]
    score_breakdown: ScoreBreakdownSchema


# --- Plan Generation schemas ---

class PlanSlotOption(BaseModel):
    course_id: str
    title: str
    difficulty: float | None = None
    course_quality: float | None = None
    score: float = 0.0


class PlanSlot(BaseModel):
    requirement_id: str
    requirement_name: str
    category_id: str
    category_name: str
    recommended: PlanSlotOption | None = None
    alternatives: list[PlanSlotOption] = []


class GeneratedPlan(BaseModel):
    program: str
    total_slots: int
    filled_slots: int
    already_completed: int
    slots: list[PlanSlot]
