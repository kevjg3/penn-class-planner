// Mirror of backend Pydantic schemas

export interface CourseListItem {
  id: string;
  title: string;
  credits: number;
  difficulty: number | null;
  course_quality: number | null;
  instructor_quality: number | null;
}

export interface Attribute {
  code: string;
  school: string | null;
  description: string;
}

export interface CourseDetail extends CourseListItem {
  description: string;
  prerequisites: string;
  work_required: number | null;
  attributes: Attribute[];
  crosslistings: string[];
}

export interface PlanCourse {
  id: number;
  course: CourseListItem;
  semester: string;
  status: "completed" | "in_progress" | "planned";
  grade: string | null;
  assignments: string[];
}

export interface RequirementStatus {
  requirement_id: string;
  name: string;
  is_fulfilled: boolean;
  assigned_course: string | null;
}

export interface CategoryProgress {
  category_id: string;
  category_name: string;
  fulfilled: number;
  total: number;
  requirements: RequirementStatus[];
}

export interface PlanEvaluation {
  total_cu_completed: number;
  total_cu_required: number;
  overall_progress: number;
  categories: CategoryProgress[];
  warnings: string[];
}

export interface ScoreBreakdown {
  requirement_fit: number;
  course_quality: number;
  difficulty_match: number;
  prerequisite_ready: number;
  popularity: number;
}

export interface Recommendation {
  course: CourseListItem;
  score: number;
  reasons: string[];
  fulfills_requirements: string[];
  score_breakdown: ScoreBreakdown;
}

export interface RequirementAssignment {
  id: number;
  plan_course_id: number;
  requirement_id: string;
  category: string;
}

export interface Program {
  id: string;
  degree: string;
  total_cu: number;
}

export interface SlotCandidate {
  id: string;
  title: string;
  credits: number;
  difficulty: number | null;
  course_quality: number | null;
  in_plan: boolean;
}

export interface AttributeInfo {
  code: string;
  description: string;
  count: number;
}

export interface PlanSlotOption {
  course_id: string;
  title: string;
  difficulty: number | null;
  course_quality: number | null;
  score: number;
}

export interface PlanSlot {
  requirement_id: string;
  requirement_name: string;
  category_id: string;
  category_name: string;
  recommended: PlanSlotOption | null;
  alternatives: PlanSlotOption[];
}

export interface GeneratedPlan {
  program: string;
  total_slots: number;
  filled_slots: number;
  already_completed: number;
  slots: PlanSlot[];
}

// --- Schedule / Sections ---

export interface Meeting {
  day: string;
  start: number;
  end: number;
  room: string | null;
}

export interface Instructor {
  id: number | null;
  name: string;
}

export interface Section {
  id: string;
  status: string;
  activity: string;
  credits: number;
  capacity: number;
  semester: string;
  meetings: Meeting[];
  instructors: Instructor[];
  course_quality: number | null;
  instructor_quality: number | null;
  difficulty: number | null;
  associated_sections: { id: string; activity: string }[];
  registration_volume: number | null;
}

export interface CourseSections {
  course_id: string;
  title: string;
  credits: number;
  sections: Section[];
}

export interface ScheduledSection {
  courseId: string;
  courseTitle: string;
  sectionId: string;
  credits: number;
  meetings: Meeting[];
  color: string;
  courseQuality: number | null;
  difficulty: number | null;
  instructors: string[];
  activity: string;
}
