"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useProgress, useAutoAssign } from "@/hooks/useRequirements";
import { useAddPlanCourse, usePlanCourses, useUpdatePlanCourse } from "@/hooks/usePlan";
import { useProgram } from "@/hooks/useProgram";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { RatingBadge } from "@/components/shared/RatingBadge";
import { api } from "@/lib/api";
import type { RequirementStatus } from "@/lib/types";

export default function RequirementsPage() {
  const { program } = useProgram();
  const { data: progress, isLoading } = useProgress(program);
  const autoAssign = useAutoAssign();
  const addCourse = useAddPlanCourse();
  const updateCourse = useUpdatePlanCourse();
  const { data: planCourses } = usePlanCourses();
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [selectedSlot, setSelectedSlot] = useState<{
    requirementId: string;
    name: string;
  } | null>(null);
  const [slotSearch, setSlotSearch] = useState("");

  // Fetch candidates for the selected slot
  const slotParams: Record<string, string> = {};
  if (selectedSlot) slotParams.requirement_id = selectedSlot.requirementId;
  if (selectedSlot) slotParams.program = program;
  if (slotSearch) slotParams.q = slotSearch;

  const { data: candidates, isLoading: candidatesLoading } = useQuery({
    queryKey: ["slot-candidates", slotParams],
    queryFn: () => api.getSlotCandidates(slotParams),
    enabled: !!selectedSlot,
  });

  if (isLoading) return <LoadingSpinner />;
  if (!progress) return <p className="text-slate-500">No data</p>;

  const toggleCat = (id: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSlotClick = (req: RequirementStatus) => {
    if (!req.is_fulfilled) {
      setSelectedSlot({ requirementId: req.requirement_id, name: req.name });
      setSlotSearch("");
    }
  };

  // Mark a fulfilled requirement's course as completed (toggle)
  const handleFulfilledClick = (req: RequirementStatus) => {
    if (req.is_fulfilled && req.assigned_course && planCourses) {
      const pc = planCourses.find((p) => p.course.id === req.assigned_course);
      if (pc) {
        const nextStatus = pc.status === "completed" ? "planned" : "completed";
        updateCourse.mutate({ id: pc.id, status: nextStatus });
      }
    }
  };

  const handleAddAndAssign = async (courseId: string) => {
    try {
      await addCourse.mutateAsync({
        course_id: courseId,
        semester: "",
        status: "completed",
      });
      setSelectedSlot(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to add course");
    }
  };

  const pct = Math.round(progress.overall_progress * 100);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Requirement Map</h1>
          <p className="text-sm text-slate-500 mt-1">
            {progress.total_cu_completed} / {progress.total_cu_required} CU completed ({pct}%)
          </p>
        </div>
        <button
          onClick={() => autoAssign.mutate(program)}
          disabled={autoAssign.isPending}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {autoAssign.isPending ? "Assigning..." : "Auto-Assign"}
        </button>
      </div>

      {/* Overall progress bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-700">Overall Progress</span>
          <span className="text-sm font-bold text-slate-900">{pct}%</span>
        </div>
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${pct === 100 ? "bg-emerald-500" : "bg-blue-500"}`}
            style={{ width: `${progress.overall_progress * 100}%` }}
          />
        </div>
      </div>

      {/* Tip */}
      <div className="bg-blue-50 border border-blue-200/60 rounded-xl p-3.5 mb-6 flex items-start gap-2.5">
        <svg className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-blue-700">
          Click any <strong>unfulfilled</strong> slot to search for and add a course.
          Click a <strong>fulfilled</strong> slot to toggle its completion status.
        </p>
      </div>

      {/* Categories */}
      <div className="space-y-3">
        {progress.categories.map((cat) => {
          const isExpanded = expandedCats.has(cat.category_id);
          const catPct = cat.total > 0 ? (cat.fulfilled / cat.total) * 100 : 0;
          const isComplete = cat.fulfilled === cat.total;

          return (
            <div key={cat.category_id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <button
                onClick={() => toggleCat(cat.category_id)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50/80 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isComplete ? "bg-emerald-100" : "bg-slate-100"}`}>
                    {isComplete ? (
                      <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className="text-xs font-bold text-slate-500">{cat.fulfilled}/{cat.total}</span>
                    )}
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-sm text-slate-900">{cat.category_name}</p>
                    <p className="text-xs text-slate-500">
                      {cat.fulfilled} of {cat.total} completed
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-28 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${isComplete ? "bg-emerald-500" : "bg-blue-500"}`}
                      style={{ width: `${catPct}%` }}
                    />
                  </div>
                  <svg
                    className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-slate-100 px-4 py-3 space-y-1.5">
                  {cat.requirements.map((req) => (
                    <div
                      key={req.requirement_id}
                      onClick={() => req.is_fulfilled ? handleFulfilledClick(req) : handleSlotClick(req)}
                      className={`flex items-center justify-between p-3 rounded-xl transition-all cursor-pointer ${
                        req.is_fulfilled
                          ? "bg-emerald-50/70 hover:bg-emerald-50 border border-emerald-100"
                          : "bg-slate-50 hover:bg-blue-50 border border-transparent hover:border-blue-200"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center ${
                          req.is_fulfilled ? "bg-emerald-500" : "bg-slate-200"
                        }`}>
                          {req.is_fulfilled && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span className="text-sm font-medium text-slate-800">
                          {req.name}
                        </span>
                      </div>
                      {req.assigned_course ? (
                        <span className="text-xs font-mono font-semibold bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-blue-700 shadow-sm">
                          {req.assigned_course}
                        </span>
                      ) : (
                        <span className="text-xs text-blue-500 font-medium flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                          Fill
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {progress.warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mt-6">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <h3 className="text-sm font-semibold text-amber-800">Warnings</h3>
          </div>
          <ul className="text-sm text-amber-700 space-y-1">
            {progress.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Slot-fill Modal */}
      {selectedSlot && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setSelectedSlot(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold text-slate-900">Fill Requirement</h3>
              <button
                onClick={() => setSelectedSlot(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4">{selectedSlot.name}</p>

            <div className="relative mb-3">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={slotSearch}
                onChange={(e) => setSlotSearch(e.target.value)}
                placeholder="Search courses..."
                className="w-full border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5">
              {candidatesLoading && <LoadingSpinner />}
              {candidates && candidates.length === 0 && (
                <p className="text-sm text-slate-500 py-8 text-center">No matching courses found</p>
              )}
              {candidates?.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-blue-200 hover:bg-blue-50/50 transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-blue-700">{c.id}</span>
                      {c.in_plan && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-md font-medium">
                          In Plan
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate">{c.title}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <RatingBadge value={c.course_quality} label="Q" />
                    {!c.in_plan ? (
                      <button
                        onClick={() => handleAddAndAssign(c.id)}
                        disabled={addCourse.isPending}
                        className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shadow-sm transition-colors"
                      >
                        + Add
                      </button>
                    ) : (
                      <span className="text-xs text-emerald-600 font-medium">Added</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
