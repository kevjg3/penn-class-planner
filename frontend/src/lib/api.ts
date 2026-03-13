const BACKEND = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const BASE = `${BACKEND}/api/v1`;

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  // Courses
  getDepartments: () =>
    fetchJSON<{ code: string; count: number }[]>("/courses/departments"),
  searchCourses: (params: Record<string, string>) =>
    fetchJSON<import("./types").CourseListItem[]>(
      `/courses/search?${new URLSearchParams(params)}`
    ),
  getCourse: (id: string) =>
    fetchJSON<import("./types").CourseDetail>(`/courses/${encodeURIComponent(id)}`),
  getCourseEligibleReqs: (id: string) =>
    fetchJSON<{ requirement_id: string }[]>(
      `/courses/${encodeURIComponent(id)}/eligible-requirements`
    ),

  // Plan
  getPlanCourses: (params?: Record<string, string>) =>
    fetchJSON<import("./types").PlanCourse[]>(
      `/plan/courses${params ? "?" + new URLSearchParams(params) : ""}`
    ),
  addPlanCourse: (body: { course_id: string; semester: string; status: string }) =>
    fetchJSON<import("./types").PlanCourse>("/plan/courses", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updatePlanCourse: (
    id: number,
    body: { semester?: string; status?: string; grade?: string }
  ) =>
    fetchJSON<import("./types").PlanCourse>(`/plan/courses/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  removePlanCourse: (id: number) =>
    fetchJSON<{ deleted: boolean }>(`/plan/courses/${id}`, { method: "DELETE" }),

  // Requirements
  listPrograms: () => fetchJSON<import("./types").Program[]>("/requirements/programs"),
  getProgress: (program?: string) =>
    fetchJSON<import("./types").PlanEvaluation>(
      `/requirements/progress${program ? "?program=" + program : ""}`
    ),
  assignCourse: (body: { plan_course_id: number; requirement_id: string }) =>
    fetchJSON<import("./types").RequirementAssignment>("/requirements/assign", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  unassignCourse: (id: number) =>
    fetchJSON<{ deleted: boolean }>(`/requirements/assign/${id}`, {
      method: "DELETE",
    }),
  autoAssign: (program?: string) =>
    fetchJSON<import("./types").RequirementAssignment[]>(
      `/requirements/auto-assign${program ? "?program=" + program : ""}`,
      { method: "POST" }
    ),

  // Slot candidates for requirements map
  getSlotCandidates: (params: Record<string, string>) =>
    fetchJSON<import("./types").SlotCandidate[]>(
      `/requirements/slot-candidates?${new URLSearchParams(params)}`
    ),

  // Course attributes
  getAttributes: () =>
    fetchJSON<import("./types").AttributeInfo[]>("/courses/attributes"),

  // Recommendations
  getRecommendations: (params?: Record<string, string>) =>
    fetchJSON<import("./types").Recommendation[]>(
      `/recommendations/${params ? "?" + new URLSearchParams(params) : ""}`
    ),

  // Profile
  getProgram: () => fetchJSON<{ program: string }>("/profile/program"),
  setProgram: (program: string) =>
    fetchJSON<{ program: string }>("/profile/program", {
      method: "PUT",
      body: JSON.stringify({ program }),
    }),
};
