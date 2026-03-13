"use client";

export function RatingBadge({
  value,
  label,
}: {
  value: number | null;
  label: string;
}) {
  if (value === null || value === undefined)
    return <span className="text-[11px] text-slate-400 font-medium">{label}: N/A</span>;
  const color =
    value >= 3.0
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : value >= 2.0
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
