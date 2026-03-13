"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRecommendations } from "@/hooks/useRecommendations";
import { useAddPlanCourse } from "@/hooks/usePlan";
import { useProgress } from "@/hooks/useRequirements";
import { useProgram } from "@/hooks/useProgram";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { RatingBadge } from "@/components/shared/RatingBadge";
import { DifficultyMeter } from "@/components/shared/DifficultyMeter";
import { api } from "@/lib/api";

export default function RecommendationsPage() {
  const [category, setCategory] = useState("");
  const [preferEasy, setPreferEasy] = useState(true);
  const [maxDifficulty, setMaxDifficulty] = useState("");
  const [semester, setSemester] = useState("2026C");
  const [attribute, setAttribute] = useState("");
  const [department, setDepartment] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);

  const { program } = useProgram();
  const params: Record<string, string> = { n: "100", prefer_easy: String(preferEasy), program };
  if (category) params.category = category;
  if (maxDifficulty) params.max_difficulty = maxDifficulty;
  if (attribute) params.attribute = attribute;
  if (department) params.department = department;

  const { data: recs, isLoading } = useRecommendations(params);
  const { data: progress } = useProgress(program);
  const { data: attributes } = useQuery({
    queryKey: ["attributes"],
    queryFn: api.getAttributes,
  });
  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: api.getDepartments,
  });
  const addCourse = useAddPlanCourse();

  const handleAdd = async (courseId: string) => {
    try {
      await addCourse.mutateAsync({
        course_id: courseId,
        semester,
        status: "planned",
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to add");
    }
  };

  // Get unfulfilled categories for the filter dropdown
  const unfulfilledCats =
    progress?.categories.filter((c) => c.fulfilled < c.total) ?? [];

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Recommendations</h1>
        <p className="text-sm text-slate-500 mt-1">AI-ranked courses based on your degree requirements and preferences</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Requirement Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 cursor-pointer"
            >
              <option value="">All Categories</option>
              {unfulfilledCats.map((c) => (
                <option key={c.category_id} value={c.category_id}>
                  {c.category_name} ({c.total - c.fulfilled} remaining)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Course Attribute
            </label>
            <select
              value={attribute}
              onChange={(e) => setAttribute(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 cursor-pointer"
            >
              <option value="">All Attributes</option>
              {attributes?.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} — {a.description} ({a.count})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Max Difficulty
            </label>
            <input
              type="number"
              step="0.5"
              min="0"
              max="4"
              value={maxDifficulty}
              onChange={(e) => setMaxDifficulty(e.target.value)}
              placeholder="e.g. 2.5"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Department
            </label>
            <select
              value={department}
              onChange={(e) => { setDepartment(e.target.value); setVisibleCount(20); }}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 cursor-pointer"
            >
              <option value="">All Departments</option>
              {departments?.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code} ({d.count})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Planning Semester
            </label>
            <select
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white cursor-pointer"
            >
              <option value="2026A">Spring 2026</option>
              <option value="2026C">Fall 2026</option>
              <option value="2027A">Spring 2027</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2.5 cursor-pointer px-1 py-2">
              <input
                type="checkbox"
                checked={preferEasy}
                onChange={(e) => setPreferEasy(e.target.checked)}
                className="rounded text-blue-600 w-4 h-4"
              />
              <span className="text-sm text-slate-700 font-medium">Prefer easier courses</span>
            </label>
          </div>
        </div>
      </div>

      {/* Results */}
      {isLoading && <LoadingSpinner />}

      {recs && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-slate-500">
            Showing {Math.min(visibleCount, recs.length)} of {recs.length} recommendations
          </p>
          {recs.slice(0, visibleCount).map((rec, i) => (
            <div
              key={rec.course.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-blue-200 hover:shadow-sm transition-all shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <span className="text-xs font-bold text-white bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 shadow-sm">
                      {i + 1}
                    </span>
                    <span className="font-mono font-bold text-blue-700">
                      {rec.course.id}
                    </span>
                    <span className="text-slate-800 truncate">{rec.course.title}</span>
                  </div>

                  {/* Reasons */}
                  <div className="flex flex-wrap gap-1.5 mt-2 ml-9">
                    {rec.reasons.map((r, j) => (
                      <span
                        key={j}
                        className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-medium"
                      >
                        {r}
                      </span>
                    ))}
                  </div>

                  {/* Score breakdown */}
                  <div className="mt-3 ml-9 flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-600 w-14">
                      {rec.score.toFixed(0)} pts
                    </span>
                    <div className="flex h-1.5 flex-1 rounded-full overflow-hidden bg-slate-100 max-w-xs">
                      <div className="bg-emerald-500" style={{ width: `${rec.score_breakdown.requirement_fit}%` }} title="Requirement Fit" />
                      <div className="bg-blue-500" style={{ width: `${rec.score_breakdown.course_quality}%` }} title="Quality" />
                      <div className="bg-amber-500" style={{ width: `${rec.score_breakdown.difficulty_match}%` }} title="Difficulty Match" />
                      <div className="bg-purple-500" style={{ width: `${rec.score_breakdown.prerequisite_ready}%` }} title="Prereqs" />
                      <div className="bg-orange-400" style={{ width: `${rec.score_breakdown.popularity}%` }} title="Popularity" />
                    </div>
                  </div>
                </div>

                <div className="ml-4 flex flex-col items-end gap-2.5 flex-shrink-0">
                  <div className="flex gap-2">
                    <RatingBadge value={rec.course.course_quality} label="Quality" />
                    <DifficultyMeter value={rec.course.difficulty} />
                  </div>
                  <button
                    onClick={() => handleAdd(rec.course.id)}
                    disabled={addCourse.isPending}
                    className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    + Add to Plan
                  </button>
                </div>
              </div>
            </div>
          ))}

          {recs.length > visibleCount && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => setVisibleCount((c) => c + 20)}
                className="px-6 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
              >
                Load More ({recs.length - visibleCount} remaining)
              </button>
            </div>
          )}

          {recs.length === 0 && (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </div>
              <p className="text-sm text-slate-500 mb-1">No recommendations available</p>
              <p className="text-xs text-slate-400">Add some completed courses first to get personalized suggestions</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
