"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useSearchCourses(params: Record<string, string>, enabled = true) {
  return useQuery({
    queryKey: ["courses-search", params],
    queryFn: () => api.searchCourses(params),
    enabled,
  });
}

export function useCourseDetail(id: string, enabled = true) {
  return useQuery({
    queryKey: ["course-detail", id],
    queryFn: () => api.getCourse(id),
    enabled: !!id && enabled,
  });
}

export function useCourseSections(courseId: string, enabled = true) {
  return useQuery({
    queryKey: ["course-sections", courseId],
    queryFn: () => api.getCourseSections(courseId),
    enabled: !!courseId && enabled,
  });
}
