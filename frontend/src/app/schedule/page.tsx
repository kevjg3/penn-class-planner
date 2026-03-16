"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchCourses, useCourseSections } from "@/hooks/useCourses";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { RatingBadge } from "@/components/shared/RatingBadge";
import { api } from "@/lib/api";
import type { ScheduledSection, Meeting } from "@/lib/types";

const COURSE_COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
  "#EC4899", "#06B6D4", "#F97316", "#6366F1", "#14B8A6",
];

const DAYS = ["M", "T", "W", "R", "F"] as const;
const DAY_LABELS: Record<string, string> = { M: "Mon", T: "Tue", W: "Wed", R: "Thu", F: "Fri" };
const HOUR_START = 8;
const HOUR_END = 21;
const HOUR_HEIGHT = 60;
const STORAGE_KEY = "penn-schedule-sections";

function formatTime(decimal: number): string {
  const hours = Math.floor(decimal);
  const minutes = Math.round((decimal - hours) * 60);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  return `${displayHour}:${minutes.toString().padStart(2, "0")} ${period}`;
}

function formatMeetingTimes(meetings: Meeting[]): string {
  if (!meetings.length) return "TBA";
  const grouped: Record<string, string[]> = {};
  for (const m of meetings) {
    const key = `${m.start}-${m.end}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m.day);
  }
  return Object.entries(grouped)
    .map(([key, days]) => {
      const [start, end] = key.split("-").map(Number);
      return `${days.join("")} ${formatTime(start)}-${formatTime(end)}`;
    })
    .join(", ");
}

function hasConflict(a: Meeting, b: Meeting): boolean {
  return a.day === b.day && a.start < b.end && b.start < a.end;
}

function getConflicts(sections: ScheduledSection[]): Set<string> {
  const conflicts = new Set<string>();
  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      for (const ma of sections[i].meetings) {
        for (const mb of sections[j].meetings) {
          if (hasConflict(ma, mb)) {
            conflicts.add(sections[i].sectionId);
            conflicts.add(sections[j].sectionId);
          }
        }
      }
    }
  }
  return conflicts;
}

// Represents a single block on the calendar
interface CalendarBlock {
  sectionId: string;
  courseId: string;
  section: ScheduledSection;
  meeting: Meeting;
  meetingIndex: number;
  day: string;
  start: number;
  end: number;
}

// Compute side-by-side layout for overlapping blocks
function computeBlockLayout(sections: ScheduledSection[]): Map<string, { col: number; totalCols: number }> {
  // Build flat list of all blocks
  const blocks: CalendarBlock[] = [];
  for (const section of sections) {
    section.meetings.forEach((meeting, mi) => {
      blocks.push({
        sectionId: section.sectionId,
        courseId: section.courseId,
        section,
        meeting,
        meetingIndex: mi,
        day: meeting.day,
        start: meeting.start,
        end: meeting.end,
      });
    });
  }

  // Group by day
  const byDay: Record<string, CalendarBlock[]> = {};
  for (const block of blocks) {
    if (!byDay[block.day]) byDay[block.day] = [];
    byDay[block.day].push(block);
  }

  const layout = new Map<string, { col: number; totalCols: number }>();

  for (const day of Object.keys(byDay)) {
    const dayBlocks = byDay[day].sort((a, b) => a.start - b.start || a.end - b.end);

    // Find overlap clusters using a sweep
    const clusters: CalendarBlock[][] = [];
    for (const block of dayBlocks) {
      // Try to add to an existing cluster that overlaps
      let placed = false;
      for (const cluster of clusters) {
        if (cluster.some((b) => b.start < block.end && block.start < b.end)) {
          cluster.push(block);
          placed = true;
          break;
        }
      }
      if (!placed) {
        clusters.push([block]);
      }
    }

    // Merge clusters that transitively overlap
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          const overlaps = clusters[i].some((a) =>
            clusters[j].some((b) => a.start < b.end && b.start < a.end)
          );
          if (overlaps) {
            clusters[i].push(...clusters[j]);
            clusters.splice(j, 1);
            merged = true;
            break;
          }
        }
        if (merged) break;
      }
    }

    // For each cluster, assign columns greedily
    for (const cluster of clusters) {
      cluster.sort((a, b) => a.start - b.start || a.end - b.end);
      const colAssignments: { block: CalendarBlock; col: number }[] = [];

      for (const block of cluster) {
        // Find first available column (no overlap with existing blocks in that column)
        let col = 0;
        while (true) {
          const conflict = colAssignments.some(
            (ca) => ca.col === col && ca.block.start < block.end && block.start < ca.block.end
          );
          if (!conflict) break;
          col++;
        }
        colAssignments.push({ block, col });
      }

      const totalCols = Math.max(...colAssignments.map((ca) => ca.col)) + 1;
      for (const ca of colAssignments) {
        const key = `${ca.block.sectionId}-${ca.block.meetingIndex}`;
        layout.set(key, { col: ca.col, totalCols });
      }
    }
  }

  return layout;
}

export default function SchedulePage() {
  const [scheduled, setScheduled] = useState<ScheduledSection[]>([]);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [attribute, setAttribute] = useState("");
  const [maxDifficulty, setMaxDifficulty] = useState("");
  const [hydrated, setHydrated] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setScheduled(JSON.parse(stored));
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  // Persist to localStorage on change
  useEffect(() => {
    if (hydrated) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(scheduled));
    }
  }, [scheduled, hydrated]);

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
  if (attribute) searchParams.attributes = attribute;
  if (maxDifficulty) searchParams.max_difficulty = maxDifficulty;
  const hasSearch = Object.keys(searchParams).length > 0;
  const { data: courses, isLoading: searchLoading } = useSearchCourses(searchParams, hasSearch);

  const { data: sectionData, isLoading: sectionsLoading } = useCourseSections(
    expandedCourse || "",
    !!expandedCourse
  );

  const getNextColor = useCallback(() => {
    const usedColors = new Set(scheduled.map((s) => s.color));
    return COURSE_COLORS.find((c) => !usedColors.has(c)) || COURSE_COLORS[scheduled.length % COURSE_COLORS.length];
  }, [scheduled]);

  const addSection = (courseId: string, courseTitle: string, section: {
    id: string; credits: number; meetings: Meeting[]; course_quality: number | null;
    difficulty: number | null; instructors: { name: string }[]; activity: string;
  }) => {
    // Don't add duplicate sections
    if (scheduled.some((s) => s.sectionId === section.id)) return;
    // Find existing color for this course, or get a new one
    const existingColor = scheduled.find((s) => s.courseId === courseId)?.color;
    const color = existingColor || getNextColor();
    setScheduled((prev) => [
      ...prev,
      {
        courseId,
        courseTitle,
        sectionId: section.id,
        credits: section.credits,
        meetings: section.meetings,
        color,
        courseQuality: section.course_quality,
        difficulty: section.difficulty,
        instructors: section.instructors.map((i) => i.name),
        activity: section.activity,
      },
    ]);
  };

  const removeSection = (sectionId: string) => {
    setScheduled((prev) => prev.filter((s) => s.sectionId !== sectionId));
  };

  const clearAll = () => setScheduled([]);

  // Compute stats
  const uniqueCourses = Array.from(new Set(scheduled.map((s) => s.courseId)));
  const totalCredits = uniqueCourses.reduce((sum, cid) => {
    const s = scheduled.find((s) => s.courseId === cid);
    return sum + (s?.credits || 0);
  }, 0);

  const qualities = scheduled.filter((s) => s.courseQuality != null).map((s) => s.courseQuality!);
  const avgQuality = qualities.length ? qualities.reduce((a, b) => a + b, 0) / qualities.length : null;
  const difficulties = scheduled.filter((s) => s.difficulty != null).map((s) => s.difficulty!);
  const avgDifficulty = difficulties.length ? difficulties.reduce((a, b) => a + b, 0) / difficulties.length : null;

  const allMeetings = scheduled.flatMap((s) => s.meetings);
  const earliestStart = allMeetings.length ? Math.min(...allMeetings.map((m) => m.start)) : null;
  const latestEnd = allMeetings.length ? Math.max(...allMeetings.map((m) => m.end)) : null;

  const conflicts = getConflicts(scheduled);
  const conflictCount = conflicts.size;

  const blockLayout = computeBlockLayout(scheduled);
  const scheduledSectionIds = new Set(scheduled.map((s) => s.sectionId));
  const scheduledCourseIds = new Set(scheduled.map((s) => s.courseId));

  return (
    <div className="h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Schedule Builder</h1>
          <p className="text-sm text-slate-500 mt-0.5">Plan your Fall 2026 weekly schedule</p>
        </div>
        {scheduled.length > 0 && (
          <button
            onClick={clearAll}
            className="text-sm text-red-500 hover:text-red-700 font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Stats Bar */}
      {scheduled.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4 shadow-sm">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-blue-600">{totalCredits}</span>
              <span className="text-xs text-slate-500 font-medium">credits</span>
            </div>
            {avgQuality != null && (
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-emerald-600">{avgQuality.toFixed(1)}</span>
                <span className="text-xs text-slate-500 font-medium">avg quality</span>
              </div>
            )}
            {avgDifficulty != null && (
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-amber-600">{avgDifficulty.toFixed(1)}</span>
                <span className="text-xs text-slate-500 font-medium">avg difficulty</span>
              </div>
            )}
            {earliestStart != null && (
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-slate-700">{formatTime(earliestStart)}</span>
                <span className="text-xs text-slate-500 font-medium">earliest</span>
              </div>
            )}
            {latestEnd != null && (
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-slate-700">{formatTime(latestEnd)}</span>
                <span className="text-xs text-slate-500 font-medium">latest</span>
              </div>
            )}
            {conflictCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-red-600">{conflictCount / 2}</span>
                <span className="text-xs text-red-500 font-medium">conflicts</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main two-panel layout */}
      <div className="flex gap-4 h-[calc(100%-8rem)]">
        {/* Left Panel: Search + Cart */}
        <div className="w-80 flex-shrink-0 flex flex-col gap-3 overflow-hidden">
          {/* Search */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="relative mb-3">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search courses..."
                className="w-full border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-900 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              >
                <option value="">All Depts</option>
                {departments?.map((d) => (
                  <option key={d.code} value={d.code}>{d.code} ({d.count})</option>
                ))}
              </select>
              <input
                type="number"
                step="0.5"
                min="0"
                max="4"
                value={maxDifficulty}
                onChange={(e) => setMaxDifficulty(e.target.value)}
                placeholder="Max Diff"
                className="w-full border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>
            <select
              value={attribute}
              onChange={(e) => setAttribute(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-900 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            >
              <option value="">All Attributes</option>
              {allAttributes?.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} — {a.description} ({a.count})
                </option>
              ))}
            </select>
          </div>

          {/* Search Results */}
          <div className="flex-1 overflow-y-auto space-y-1">
            {searchLoading && <div className="py-4"><LoadingSpinner /></div>}
            {!hasSearch && !scheduled.length && (
              <div className="text-center py-8">
                <svg className="w-10 h-10 text-slate-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="text-xs text-slate-400">Search for courses to add to your schedule</p>
              </div>
            )}
            {courses?.map((course) => {
              const isExpanded = expandedCourse === course.id;
              const inSchedule = scheduledCourseIds.has(course.id);
              return (
                <div key={course.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <button
                    onClick={() => setExpandedCourse(isExpanded ? null : course.id)}
                    className={`w-full text-left p-3 hover:bg-slate-50 transition-colors ${isExpanded ? "bg-blue-50/50" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        {inSchedule && (
                          <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                        )}
                        <span className="font-mono font-bold text-xs text-blue-700">{course.id}</span>
                        <span className="text-xs text-slate-600 truncate">{course.title}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                        <RatingBadge value={course.course_quality} label="Q" />
                        <svg
                          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </button>

                  {/* Section picker */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/50 px-3 py-2 space-y-1.5">
                      {sectionsLoading && <div className="py-2"><LoadingSpinner /></div>}
                      {sectionData && sectionData.sections.length === 0 && (
                        <p className="text-xs text-slate-400 py-2">No sections available</p>
                      )}
                      {sectionData?.sections.map((section) => {
                        const isAdded = scheduledSectionIds.has(section.id);
                        const wouldConflict = !isAdded && scheduled.some((s) =>
                          s.meetings.some((sm) =>
                            section.meetings.some((nm) => hasConflict(sm, nm))
                          )
                        );
                        return (
                          <div
                            key={section.id}
                            className={`rounded-lg p-2.5 text-xs border transition-all ${
                              isAdded
                                ? "bg-emerald-50 border-emerald-200"
                                : wouldConflict
                                ? "bg-red-50/50 border-red-200/60"
                                : "bg-white border-slate-200 hover:border-blue-200"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-slate-800">
                                  {section.id.split("-").pop()}
                                </span>
                                <span className="text-slate-400">{section.activity}</span>
                                {section.status === "C" && (
                                  <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">Closed</span>
                                )}
                                {section.status === "O" && (
                                  <span className="text-[10px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded font-medium">Open</span>
                                )}
                              </div>
                              {isAdded ? (
                                <button
                                  onClick={() => removeSection(section.id)}
                                  className="text-red-500 hover:text-red-700 text-[10px] font-medium px-2 py-0.5 rounded hover:bg-red-50"
                                >
                                  Remove
                                </button>
                              ) : (
                                <button
                                  onClick={() => addSection(course.id, course.title, {
                                    id: section.id,
                                    credits: section.credits,
                                    meetings: section.meetings,
                                    course_quality: section.course_quality,
                                    difficulty: section.difficulty,
                                    instructors: section.instructors,
                                    activity: section.activity,
                                  })}
                                  className={`text-[10px] font-semibold px-2 py-0.5 rounded transition-colors ${
                                    wouldConflict
                                      ? "text-amber-600 bg-amber-50 hover:bg-amber-100"
                                      : "text-blue-600 bg-blue-50 hover:bg-blue-100"
                                  }`}
                                >
                                  {wouldConflict ? "Add (conflict)" : "+ Add"}
                                </button>
                              )}
                            </div>
                            <p className="text-slate-500">
                              {formatMeetingTimes(section.meetings)}
                            </p>
                            {section.instructors.length > 0 && (
                              <p className="text-slate-400 mt-0.5">
                                {section.instructors.map((i) => i.name).join(", ")}
                              </p>
                            )}
                            {section.meetings[0]?.room && (
                              <p className="text-slate-400 mt-0.5">{section.meetings[0].room}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Cart */}
            {scheduled.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-200">
                <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">
                  My Schedule ({uniqueCourses.length} courses)
                </h3>
                <div className="space-y-1">
                  {scheduled.map((s) => (
                    <div
                      key={s.sectionId}
                      className="flex items-center justify-between bg-white rounded-lg border border-slate-200 px-2.5 py-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-3 h-3 rounded-sm flex-shrink-0"
                          style={{ backgroundColor: s.color }}
                        />
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-bold text-slate-800 truncate">
                            {s.sectionId}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">
                            {s.activity} · {s.instructors[0] || "TBA"}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => removeSection(s.sectionId)}
                        className="text-slate-300 hover:text-red-500 flex-shrink-0 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Calendar Grid */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          {/* Day headers */}
          <div className="flex border-b border-slate-200 bg-slate-50/80">
            <div className="w-14 flex-shrink-0" />
            {DAYS.map((day) => (
              <div key={day} className="flex-1 text-center py-2.5">
                <span className="text-xs font-semibold text-slate-600">{DAY_LABELS[day]}</span>
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto">
            <div className="relative" style={{ height: (HOUR_END - HOUR_START) * HOUR_HEIGHT }}>
              {/* Time gutter + grid lines */}
              {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => {
                const hour = HOUR_START + i;
                return (
                  <div
                    key={hour}
                    className="absolute w-full flex"
                    style={{ top: i * HOUR_HEIGHT }}
                  >
                    <div className="w-14 flex-shrink-0 text-right pr-2 -translate-y-2.5">
                      <span className="text-[10px] text-slate-400 font-medium">
                        {formatTime(hour)}
                      </span>
                    </div>
                    <div className="flex-1 border-t border-slate-100" />
                  </div>
                );
              })}

              {/* Half-hour lines */}
              {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                <div
                  key={`half-${i}`}
                  className="absolute w-full flex"
                  style={{ top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                >
                  <div className="w-14 flex-shrink-0" />
                  <div className="flex-1 border-t border-slate-50" />
                </div>
              ))}

              {/* Day column dividers */}
              <div className="absolute inset-0 flex" style={{ left: 56 }}>
                {DAYS.map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 border-l border-slate-100 first:border-l-0"
                  />
                ))}
              </div>

              {/* Course blocks */}
              {scheduled.map((section) =>
                section.meetings.map((meeting, mi) => {
                  const dayIndex = DAYS.indexOf(meeting.day as typeof DAYS[number]);
                  if (dayIndex === -1) return null;

                  const top = (meeting.start - HOUR_START) * HOUR_HEIGHT;
                  const height = (meeting.end - meeting.start) * HOUR_HEIGHT;
                  const isConflicting = conflicts.has(section.sectionId);

                  // Get layout info for side-by-side display
                  const layoutKey = `${section.sectionId}-${mi}`;
                  const layoutInfo = blockLayout.get(layoutKey) || { col: 0, totalCols: 1 };
                  const { col, totalCols } = layoutInfo;

                  // Calculate left and width, subdividing column for overlapping blocks
                  const colWidth = `(100% - 56px) / 5`;
                  const slotWidth = `(${colWidth} - 4px) / ${totalCols}`;
                  const left = `calc(56px + ${dayIndex} * ${colWidth} + 2px + ${col} * ${slotWidth})`;
                  const width = `calc(${slotWidth})`;

                  return (
                    <div
                      key={`${section.sectionId}-${mi}`}
                      className={`absolute rounded-lg overflow-hidden cursor-pointer transition-all hover:brightness-95 group ${
                        isConflicting ? "ring-2 ring-red-500 ring-offset-1" : ""
                      }`}
                      style={{
                        top,
                        height: Math.max(height, 24),
                        left,
                        width,
                        backgroundColor: section.color,
                        zIndex: isConflicting ? 10 : 5,
                      }}
                      title={`${section.courseId} — ${section.sectionId}\n${section.courseTitle}\n${formatMeetingTimes([meeting])}\n${meeting.room || ""}`}
                      onClick={() => removeSection(section.sectionId)}
                    >
                      <div className="p-1.5 h-full flex flex-col text-white">
                        <p className="text-[11px] font-bold leading-tight truncate">
                          {section.courseId.replace("-", " ")}
                        </p>
                        {height >= 36 && (
                          <p className="text-[9px] opacity-80 truncate">
                            {section.sectionId.split("-").pop()} {section.activity}
                          </p>
                        )}
                        {height >= 50 && meeting.room && (
                          <p className="text-[9px] opacity-70 truncate mt-auto">
                            {meeting.room}
                          </p>
                        )}
                      </div>
                      {/* Remove hint on hover */}
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                    </div>
                  );
                })
              )}

              {/* Empty state */}
              {scheduled.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <svg className="w-12 h-12 text-slate-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm text-slate-400">Search and add courses to see them here</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
