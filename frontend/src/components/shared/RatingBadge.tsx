"use client";

export function RatingBadge({
  value,
  label,
  invert,
}: {
  value: number | null;
  label: string;
  invert?: boolean;
}) {
  if (value === null || value === undefined)
    return <span className="text-[11px] text-slate-400 font-medium">{label}: N/A</span>;
  // For difficulty (invert=true): lower is better (green), higher is worse (red)
  const isGood = invert ? value <= 2.0 : value >= 3.0;
  const isMedium = invert ? value <= 3.0 : value >= 2.0;
  const color = isGood
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : isMedium
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-red-50 text-red-700 border-red-200";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${color}`}
    >
      {label}: {value.toFixed(1)}
    </span>
  );
}
