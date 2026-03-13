"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function usePlanCourses(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["plan-courses", params],
    queryFn: () => api.getPlanCourses(params),
  });
}

export function useAddPlanCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.addPlanCourse,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plan-courses"] });
      qc.invalidateQueries({ queryKey: ["progress"] });
      qc.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });
}

export function useRemovePlanCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.removePlanCourse,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plan-courses"] });
      qc.invalidateQueries({ queryKey: ["progress"] });
      qc.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });
}

export function useUpdatePlanCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; semester?: string; status?: string; grade?: string }) =>
      api.updatePlanCourse(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plan-courses"] });
      qc.invalidateQueries({ queryKey: ["progress"] });
      qc.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });
}
