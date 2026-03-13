"use client";

import { useProgress } from "@/hooks/useRequirements";
import { usePlanCourses, useRemovePlanCourse, useUpdatePlanCourse } from "@/hooks/usePlan";
import { useProgram } from "@/hooks/useProgram";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { RatingBadge } from "@/components/shared/RatingBadge";
import { STATUS_COLORS, STATUS_LABELS, formatSemester } from "@/lib/constants";

export default function Dashboard() {
  const { program } = useProgram();
  const { data: progress, isLoading: progressLoading } = useProgress(program);
  const { data: planCourses, isLoading: planLoading } = usePlanCourses();
  const removeCourse = useRemovePlanCourse();
  const updateCourse = useUpdatePlanCourse();

  if (progressLoading || planLoading) return <LoadingSpinner />;

  const cycleStatus = (pc: { id: number; status: string }) => {
    const order = ["completed", "in_progress", "planned"];
    const next = order[(order.indexOf(pc.status) + 1) % order.length];
    updateCourse.mutate({ id: pc.id, status: next });
  };

  const completedCount = planCourses?.filter((c) => c.status === "completed").length ?? 0;
  const inProgressCount = planCourses?.filter((c) => c.status === "in_progress").length ?? 0;
  const plannedCount = planCourses?.filter((c) => c.status === "planned").length ?? 0;
  const pct = progress ? Math.round(progress.overall_progress * 100) : 0;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Track your degree progress and manage courses</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Degree Progress</p>
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900">{pct}%</p>
          <p className="text-xs text-slate-500 mt-1">
            {progress?.total_cu_completed ?? 0} / {progress?.total_cu_required ?? 37} CU
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Completed</p>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900">{completedCount}</p>
          <p className="text-xs text-slate-500 mt-1">courses completed</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">In Progress</p>
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900">{inProgressCount}</p>
          <p className="text-xs text-slate-500 mt-1">courses in progress</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Planned</p>
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900">{plannedCount}</p>
          <p className="text-xs text-slate-500 mt-1">courses planned</p>
        </div>
      </div>

      {/* Degree Progress Bars */}
      {progress && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-8 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 mb-5">Requirement Categories</h2>
          <div className="space-y-4">
            {progress.categories.map((cat) => {
              const catPct = cat.total > 0 ? (cat.fulfilled / cat.total) * 100 : 0;
              const isComplete = cat.fulfilled === cat.total;
              return (
                <div key={cat.category_id}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-slate-700">{cat.category_name}</span>
                    <span className={`text-xs font-semibold ${isComplete ? "text-emerald-600" : "text-slate-500"}`}>
                      {cat.fulfilled} / {cat.total}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${isComplete ? "bg-emerald-500" : "bg-blue-500"}`}
                      style={{ width: `${catPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* My Courses */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-slate-900">
            My Courses
            <span className="ml-2 text-xs font-normal text-slate-400">
              ({planCourses?.length ?? 0})
            </span>
          </h2>
          <a href="/courses" className="text-xs font-medium text-blue-600 hover:text-blue-700">
            + Add courses
          </a>
        </div>

        {!planCourses?.length ? (
          <div className="text-center py-10">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <p className="text-sm text-slate-500 mb-1">No courses added yet</p>
            <a href="/courses" className="text-sm text-blue-600 hover:underline">
              Go to Course Finder to get started
            </a>
          </div>
        ) : (
          <div className="space-y-1.5">
            {planCourses.map((pc) => (
              <div
                key={pc.id}
                className="flex items-center justify-between px-4 py-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/50 transition-all group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-slate-900">
                        {pc.course.id}
                      </span>
                      <span className="text-sm text-slate-600 truncate">
                        {pc.course.title}
                      </span>
                    </div>
                    {pc.semester && (
                      <p className="text-xs text-slate-400 mt-0.5">{formatSemester(pc.semester)}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <RatingBadge value={pc.course.course_quality} label="Q" />
                  <button
                    onClick={() => cycleStatus(pc)}
                    className={`text-xs px-2.5 py-1 rounded-full cursor-pointer hover:opacity-80 font-medium transition-all ${STATUS_COLORS[pc.status] ?? ""}`}
                    title="Click to change status"
                  >
                    {STATUS_LABELS[pc.status] ?? pc.status}
                  </button>
                  <button
                    onClick={() => removeCourse.mutate(pc.id)}
                    className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    title="Remove"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Warnings */}
      {progress?.warnings && progress.warnings.length > 0 && (
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
    </div>
  );
}
