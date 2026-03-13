export const SEMESTER_LABELS: Record<string, string> = {
  A: "Spring",
  B: "Summer",
  C: "Fall",
};

export function formatSemester(code: string): string {
  if (!code) return "Unknown";
  const year = code.slice(0, 4);
  const term = SEMESTER_LABELS[code.slice(4)] || code.slice(4);
  return `${term} ${year}`;
}

export const STATUS_COLORS: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-800",
  in_progress: "bg-amber-100 text-amber-800",
  planned: "bg-slate-100 text-slate-700",
};

export const STATUS_LABELS: Record<string, string> = {
  completed: "Completed",
  in_progress: "In Progress",
  planned: "Planned",
};
