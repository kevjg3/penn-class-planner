"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useRecommendations(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["recommendations", params],
    queryFn: () => api.getRecommendations(params),
  });
}
