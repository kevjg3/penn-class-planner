"use client";

export function DifficultyMeter({
  value,
  max = 4,
}: {
  value: number | null;
  max?: number;
}) {
  if (value === null || value === undefined)
    return <span className="text-[11px] text-slate-400 font-medium">Diff: N/A</span>;
  const pct = Math.min((value / max) * 100, 100);
  const color =
    value <= 1.5
      ? "bg-emerald-500"
      : value <= 2.5
        ? "bg-amber-500"
        : value <= 3.0
          ? "bg-orange-500"
          : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-16 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-semibold text-slate-600">{value.toFixed(1)}</span>
    </div>
  );
}
