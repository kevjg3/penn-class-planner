"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import {
  ProgramContext,
  useProgramQuery,
  useProgramsList,
  useSetProgram,
} from "@/hooks/useProgram";

function ProgramProvider({ children }: { children: React.ReactNode }) {
  const { data: profileData, isLoading: profileLoading } = useProgramQuery();
  const { data: programs, isLoading: programsLoading } = useProgramsList();
  const setProgramMutation = useSetProgram();

  const program = profileData?.program ?? "seas_cs_bse";

  return (
    <ProgramContext.Provider
      value={{
        program,
        setProgram: (p: string) => setProgramMutation.mutate(p),
        programs: programs ?? [],
        isLoading: profileLoading || programsLoading,
      }}
    >
      {children}
    </ProgramContext.Provider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ProgramProvider>{children}</ProgramProvider>
    </QueryClientProvider>
  );
}
