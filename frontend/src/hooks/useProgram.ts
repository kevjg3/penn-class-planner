"use client";

import { createContext, useContext } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface ProgramContextType {
  program: string;
  setProgram: (p: string) => void;
  programs: { id: string; degree: string; total_cu: number }[];
  isLoading: boolean;
}

export const ProgramContext = createContext<ProgramContextType>({
  program: "seas_cs_bse",
  setProgram: () => {},
  programs: [],
  isLoading: true,
});

export function useProgram() {
  return useContext(ProgramContext);
}

export function useProgramQuery() {
  return useQuery({
    queryKey: ["profile-program"],
    queryFn: api.getProgram,
  });
}

export function useProgramsList() {
  return useQuery({
    queryKey: ["programs-list"],
    queryFn: api.listPrograms,
  });
}

export function useSetProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.setProgram,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile-program"] });
      qc.invalidateQueries({ queryKey: ["progress"] });
      qc.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });
}
