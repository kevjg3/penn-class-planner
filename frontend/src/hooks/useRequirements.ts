"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useProgress(program?: string) {
  return useQuery({
    queryKey: ["progress", program],
    queryFn: () => api.getProgress(program),
  });
}

export function useAutoAssign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (program?: string) => api.autoAssign(program),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["progress"] });
      qc.invalidateQueries({ queryKey: ["plan-courses"] });
      qc.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });
}
