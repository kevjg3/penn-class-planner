"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchCourses } from "@/hooks/useCourses";
import { useAddPlanCourse } from "@/hooks/usePlan";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { RatingBadge } from "@/components/shared/RatingBadge";
import { DifficultyMeter } from "@/components/shared/DifficultyMeter";
import { api } from "@/lib/api";
import type { CourseListItem } from "@/lib/types";

export default function CourseFinder() {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [maxDifficulty, setMaxDifficulty] = useState("");
  const [minQuality, setMinQuality] = useState("");
  const [attributes, setAttributes] = useState("");
  const [selectedCourse, setSelectedCourse] = useState<CourseListItem | null>(null);
  const [hoveredCourse, setHoveredCourse] = useState<string | null>(null);
  const [addSemester, setAddSemester] = useState("2026C");
  const [addStatus, setAddStatus] = useState("completed");
  const [resultLimit, setResultLimit] = useState(50);

  // Reset limit when filters change
  const resetAndSet = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setResultLimit(50); };

  // Load departments & attributes from DB
  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: api.getDepartments,
  });
  const { data: allAttributes } = useQuery({
    queryKey: ["attributes"],
    queryFn: api.getAttributes,
  });

  const searchParams: Record<string, string> = {};
  if (query) searchParams.q = query;
  if (department) searchParams.department = department;
  if (maxDifficulty) searchParams.max_difficulty = maxDifficulty;
  if (minQuality) searchParams.min_quality = minQuality;
  if (attributes) searchParams.attributes = attributes;
  searchParams.limit = String(resultLimit);

  const hasSearch = query || department || maxDifficulty || minQuality || attributes;
  const { data: courses, isLoading } = useSearchCourses(searchParams, !!hasSearch);
  const addCourse = useAddPlanCourse();

  const handleAdd = async (course: CourseListItem) => {
    try {
      await addCourse.mutateAsync({
        course_id: course.id,
        semester: addSemester,
        status: addStatus,
      });
      setSelectedCourse(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to add course");
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Course Finder</h1>
        <p className="text-sm text-slate-500 mt-1">Search and filter Penn courses to add to your plan</p>
      </div>

      {/* Search / Filter Panel */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Search
            </label>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => resetAndSet(setQuery)(e.target.value)}
                placeholder="Course code or title... (e.g. CIS 1200 or Data Structures)"
                className="w-full border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-all"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Department
            </label>
            <select
              value={department}
              onChange={(e) => resetAndSet(setDepartment)(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-all cursor-pointer"
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
              Course Attribute
            </label>
            <select
              value={attributes}
              onChange={(e) => resetAndSet(setAttributes)(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-all cursor-pointer"
            >
              <option value="">All Attributes</option>
              {allAttributes?.map((a) => (
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
              onChange={(e) => resetAndSet(setMaxDifficulty)(e.target.value)}
              placeholder="e.g. 2.5"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Min Quality
            </label>
            <input
              type="number"
              step="0.5"
              min="0"
              max="4"
              value={minQuality}
              onChange={(e) => resetAndSet(setMinQuality)(e.target.value)}
              placeholder="e.g. 3.0"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Results */}
      {!hasSearch && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p className="text-sm text-slate-500">Enter a search query or select filters to find courses</p>
        </div>
      )}

      {isLoading && <LoadingSpinner />}

      {courses && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500 mb-3">
            {courses.length} courses found
          </p>
          {courses.map((course) => {
            const isHovered = hoveredCourse === course.id;
            return (
              <div
                key={course.id}
                className="bg-white rounded-xl border border-slate-200 hover:border-blue-200 hover:shadow-sm transition-all group"
                onMouseEnter={() => setHoveredCourse(course.id)}
                onMouseLeave={() => setHoveredCourse(null)}
              >
                <div className="flex items-center justify-between p-4">
                  <div
                    className="flex items-center gap-3 min-w-0 cursor-pointer"
                    onClick={() => setSelectedCourse(course)}
                  >
                    <span className="font-mono font-bold text-sm text-blue-700 flex-shrink-0">
                      {course.id}
                    </span>
                    <span className="text-sm text-slate-700 truncate">{course.title}</span>
                    <span className="text-xs text-slate-400 flex-shrink-0">
                      {course.credits} CU
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <RatingBadge value={course.course_quality} label="Quality" />
                    <DifficultyMeter value={course.difficulty} />
                  </div>
                </div>
                {/* Inline quick-add controls on hover */}
                {isHovered && (
                  <div className="border-t border-slate-100 px-4 py-2.5 flex items-center gap-2 bg-slate-50/80 animate-in fade-in duration-150">
                    <select
                      value={addStatus}
                      onChange={(e) => { e.stopPropagation(); setAddStatus(e.target.value); }}
                      onClick={(e) => e.stopPropagation()}
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    >
                      <option value="completed">Completed</option>
                      <option value="in_progress">In Progress</option>
                      <option value="planned">Planned</option>
                    </select>
                    <select
                      value={addSemester}
                      onChange={(e) => { e.stopPropagation(); setAddSemester(e.target.value); }}
                      onClick={(e) => e.stopPropagation()}
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    >
                      <option value="">No Semester</option>
                      <option value="2022C">Fall 2022</option>
                      <option value="2023A">Spring 2023</option>
                      <option value="2023C">Fall 2023</option>
                      <option value="2024A">Spring 2024</option>
                      <option value="2024C">Fall 2024</option>
                      <option value="2025A">Spring 2025</option>
                      <option value="2025C">Fall 2025</option>
                      <option value="2026A">Spring 2026</option>
                      <option value="2026C">Fall 2026</option>
                      <option value="2027A">Spring 2027</option>
                      <option value="2027C">Fall 2027</option>
                    </select>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleAdd(course); }}
                      disabled={addCourse.isPending}
                      className="ml-auto bg-blue-600 text-white rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
                    >
                      {addCourse.isPending ? "Adding..." : "+ Add to Plan"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {courses.length >= resultLimit && (
            <button
              onClick={() => setResultLimit((prev) => prev + 50)}
              className="w-full py-3 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors mt-2"
            >
              Load More Courses
            </button>
          )}
        </div>
      )}

      {/* Add to Plan Modal */}
      {selectedCourse && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setSelectedCourse(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-1">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{selectedCourse.id}</h3>
                <p className="text-sm text-slate-500">{selectedCourse.title}</p>
              </div>
              <button
                onClick={() => setSelectedCourse(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex gap-2 my-4">
              <RatingBadge value={selectedCourse.course_quality} label="Quality" />
              <RatingBadge value={selectedCourse.difficulty} label="Difficulty" invert />
              <RatingBadge value={selectedCourse.instructor_quality} label="Instructor" />
            </div>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Semester
                </label>
                <select
                  value={addSemester}
                  onChange={(e) => setAddSemester(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white cursor-pointer"
                >
                  <option value="">Not specified</option>
                  <option value="2022C">Fall 2022</option>
                  <option value="2023A">Spring 2023</option>
                  <option value="2023C">Fall 2023</option>
                  <option value="2024A">Spring 2024</option>
                  <option value="2024C">Fall 2024</option>
                  <option value="2025A">Spring 2025</option>
                  <option value="2025C">Fall 2025</option>
                  <option value="2026A">Spring 2026</option>
                  <option value="2026C">Fall 2026</option>
                  <option value="2027A">Spring 2027</option>
                  <option value="2027C">Fall 2027</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Status
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: "completed", label: "Completed", color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
                    { value: "in_progress", label: "In Progress", color: "bg-amber-50 border-amber-200 text-amber-700" },
                    { value: "planned", label: "Planned", color: "bg-slate-50 border-slate-200 text-slate-600" },
                  ].map((s) => (
                    <button
                      key={s.value}
                      onClick={() => setAddStatus(s.value)}
                      className={`text-xs font-medium py-2 rounded-lg border transition-all ${
                        addStatus === s.value
                          ? `${s.color} ring-2 ring-offset-1 ring-blue-400`
                          : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handleAdd(selectedCourse)}
                disabled={addCourse.isPending}
                className="flex-1 bg-blue-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                {addCourse.isPending ? "Adding..." : "Add to Plan"}
              </button>
              <button
                onClick={() => setSelectedCourse(null)}
                className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
