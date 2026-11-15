// Syllabus parsing: schema, validation, and conversion into our own data. The model only reads the document;
// everything after that (checking, dates, weights, crunch weeks, what to ask) is deterministic code.
import type { Course, Exam, Topic } from "./types.ts";
import { daysUntil, localDay, zoned } from "./logic.ts";

export const KINDS = ["exam", "quiz", "paper", "assignment", "project", "presentation", "participation", "other"] as const;
export type AssessmentKind = (typeof KINDS)[number];

export interface GradeCategory { name: string; weightPercent: number }
export interface ParsedAssessment {
  name: string; kind: AssessmentKind;
  category: string | null; // which grading category it belongs to (must match a category name)
  date: string | null; // YYYY-MM-DD, only if the syllabus states a calendar date
  week: number | null; // only if the syllabus gives a week number instead
  topics: string[];
}
export interface ParsedSyllabus {
  courseName: string; instructor: string | null; term: string | null; termStartDate: string | null;
  categories: GradeCategory[]; assessments: ParsedAssessment[]; notes: string | null;
}

/** An item's weight, computed in code: its category's weight shared equally among the items in that category. */
export function weightOf(p: ParsedSyllabus, a: ParsedAssessment): number | null {
  if (!a.category) return null;
  const cat = p.categories.find((c) => c.name === a.category);
  if (!cat) return null;
  const n = p.assessments.filter((x) => x.category === a.category).length;
  return Math.round((cat.weightPercent / Math.max(1, n)) * 100) / 100;
}

const nullable = (t: string) => ({ type: [t, "null"] });
export const SYLLABUS_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["courseName", "instructor", "term", "termStartDate", "categories", "assessments", "notes"],
  properties: {
    courseName: { type: "string", description: "Course code and title, e.g. 'ECON 201: Principles of Macroeconomics'" },
    instructor: nullable("string"),
    term: { ...nullable("string"), description: "e.g. 'Fall 2026'" },
    termStartDate: { ...nullable("string"), description: "YYYY-MM-DD of the first day of classes, only if stated" },
    categories: {
      type: "array",
      description: "The top-level grading breakdown exactly as the syllabus states it (e.g. Participation 40, Writing Assignments 30, Final Exam 30). These should add up to 100. Do not split a category into sub-parts.",
      items: { type: "object", additionalProperties: false, required: ["name", "weightPercent"], properties: { name: { type: "string" }, weightPercent: { type: "number" } } },
    },
    assessments: {
      type: "array",
      description: "Every graded item or deadline with its own date or week. Also include items without dates if the syllabus names them.",
      items: {
        type: "object", additionalProperties: false,
        required: ["name", "kind", "category", "date", "week", "topics"],
        properties: {
          name: { type: "string" },
          kind: { enum: [...KINDS] },
          category: { ...nullable("string"), description: "The exact name of the grading category this item counts toward; null if none" },
          date: { ...nullable("string"), description: "YYYY-MM-DD, only if the syllabus states a calendar date (infer the year from the term)" },
          week: { ...nullable("integer"), description: "Week number, only if it gives a week instead of a date" },
          topics: { type: "array", items: { type: "string" }, description: "Chapters/topics this assessment covers; [] if not stated" },
        },
      },
    },
    notes: { ...nullable("string"), description: "Anything important the other fields can't hold" },
  },
} as const;

const isYmd = (s: unknown): s is string => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

export type Validation = { ok: true; value: ParsedSyllabus } | { ok: false; errors: string[] };

/** Strict check of whatever the model returned. Never trusts it. */
export function validateParsed(raw: unknown, now?: Date): Validation {
  const errors: string[] = [];
  const o = raw as any;
  if (!o || typeof o !== "object") return { ok: false, errors: ["result is not an object"] };
  if (typeof o.courseName !== "string" || !o.courseName.trim()) errors.push("courseName is required");
  for (const k of ["instructor", "term", "notes"]) if (o[k] != null && typeof o[k] !== "string") errors.push(`${k} must be a string or null`);
  if (o.termStartDate != null && !isYmd(o.termStartDate)) errors.push("termStartDate must be a real YYYY-MM-DD date or null");
  else if (o.termStartDate != null && now && Math.abs(toUtc(o.termStartDate) - toUtc(now.toISOString().slice(0, 10))) > 366 * 86_400_000) errors.push(`termStartDate ${o.termStartDate} is more than a year from today: check the year`);
  if (!Array.isArray(o.assessments)) errors.push("assessments must be an array");
  const categories: GradeCategory[] = [];
  (Array.isArray(o.categories) ? o.categories : []).forEach((c: any, i: number) => {
    if (typeof c?.name !== "string" || !c.name.trim()) return void errors.push(`categories[${i}].name is required`);
    if (!(typeof c.weightPercent === "number" && c.weightPercent >= 0 && c.weightPercent <= 100)) return void errors.push(`categories[${i}].weightPercent must be 0-100`);
    categories.push({ name: c.name.trim(), weightPercent: c.weightPercent });
  });
  const catTotal = categories.reduce((t, c) => t + c.weightPercent, 0);
  if (catTotal > 100.5) errors.push(`the grading categories add up to ${Math.round(catTotal)}% (over 100%): list the headline categories once each, without splitting them into sub-parts`);
  const assessments: ParsedAssessment[] = [];
  (Array.isArray(o.assessments) ? o.assessments : []).forEach((a: any, i: number) => {
    const p = `assessments[${i}]`;
    if (typeof a?.name !== "string" || !a.name.trim()) return void errors.push(`${p}.name is required`);
    if (!KINDS.includes(a.kind)) errors.push(`${p}.kind must be one of ${KINDS.join(", ")}`);
    if (a.category != null && !categories.some((c) => c.name === String(a.category).trim())) errors.push(`${p}.category "${a.category}" is not one of the categories: ${categories.map((c) => c.name).join(", ") || "(none)"}`);
    if (a.date != null && !isYmd(a.date)) errors.push(`${p}.date must be a real YYYY-MM-DD date or null`);
    else if (a.date != null && now && Math.abs(toUtc(a.date) - toUtc(now.toISOString().slice(0, 10))) > 366 * 86_400_000) errors.push(`${p}.date ${a.date} is more than a year from today (${now.toISOString().slice(0, 10)}): check the year`);
    if (a.week != null && !(Number.isInteger(a.week) && a.week >= 1 && a.week <= 60)) errors.push(`${p}.week must be an integer 1-60 or null`);
    if (!Array.isArray(a.topics) || a.topics.some((t: unknown) => typeof t !== "string")) errors.push(`${p}.topics must be an array of strings`);
    assessments.push({ name: a.name.trim(), kind: a.kind, category: a.category == null ? null : String(a.category).trim(), date: a.date ?? null, week: a.week ?? null, topics: (a.topics ?? []).map((t: string) => t.trim()).filter(Boolean) });
  });
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { courseName: o.courseName.trim(), instructor: o.instructor ?? null, term: o.term ?? null, termStartDate: o.termStartDate ?? null, categories, assessments, notes: o.notes ?? null } };
}

// ---- dates (calendar math on YYYY-MM-DD strings) ----
const toUtc = (ymd: string) => { const [y, m, d] = ymd.split("-").map(Number) as [number, number, number]; return Date.UTC(y, m - 1, d); };
export const addDays = (ymd: string, n: number) => new Date(toUtc(ymd) + n * 86_400_000).toISOString().slice(0, 10);

export type Missing =
  | { kind: "termStart" }
  | { kind: "date"; assessment: string }
  | { kind: "weight"; assessment: string };

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "item";
const ASKABLE: AssessmentKind[] = ["exam", "quiz", "paper", "assignment", "project", "presentation"];

export interface Deadline { name: string; date: string; weight: number }
export interface Patch { courses: Course[]; exams: Exam[]; topics: Topic[]; deadlines: Deadline[]; missing: Missing[] }

/** Placeholder "topics" a syllabus gives for a cumulative exam. */
const VAGUE_TOPIC = /^(cumulative|comprehensive|all (of the )?(material|readings|topics|units|chapters|course material)|everything|entire (course|semester)|tbd|tba)\b\W*$/i;

/** Turns a validated parse into our courses / exams / topics, and lists what is still unknown. */
export function toPatch(p: ParsedSyllabus, tz: string, hour = 10): Patch {
  const courseId = slug(p.courseName);
  const exams: Exam[] = [], topics: Topic[] = [], missing: Missing[] = [], deadlines: Deadline[] = [];
  const seen = new Set<string>();
  const dateOf = (a: ParsedAssessment) => a.date ?? (a.week && p.termStartDate ? addDays(p.termStartDate, (a.week - 1) * 7) : null);
  for (const a of p.assessments) { // every dated item counts toward crunch weeks, even small ones
    const d = dateOf(a);
    if (d && a.kind !== "participation") { const [y, m, dd] = d.split("-").map(Number) as [number, number, number]; deadlines.push({ name: a.name, date: zoned(y, m, dd, hour, 0, tz).toISOString(), weight: (weightOf(p, a) ?? 0) / 100 }); }
  }
  for (const a of p.assessments) {
    const w = weightOf(p, a);
    if (!ASKABLE.includes(a.kind) || (w != null && w < 5)) continue;
    let date = dateOf(a);
    if (!date) {
      if (a.week && !p.termStartDate) { if (!missing.some((m) => m.kind === "termStart")) missing.push({ kind: "termStart" }); }
      else missing.push({ kind: "date", assessment: a.name });
      continue;
    }
    if (w == null) missing.push({ kind: "weight", assessment: a.name });
    let id = slug(a.name);
    while (seen.has(id)) id += "-2";
    seen.add(id);
    const [y, m, d] = date.split("-").map(Number) as [number, number, number];
    const topicIds = a.topics.map((t) => {
      const tid = `${id}-${slug(t)}`;
      topics.push({ id: tid, courseId, name: t, short: t });
      return tid;
    });
    exams.push({ id, courseId, name: a.name, weight: (w ?? 0) / 100, date: zoned(y, m, d, hour, 0, tz).toISOString(), topicIds });
  }
  // A cumulative exam ("cumulative", "all material") covers every topic before it, not a topic called "cumulative":
  // drop the placeholder so nothing quizzes on it, and point the exam at the real topics.
  const vague = new Set(topics.filter((t) => VAGUE_TOPIC.test(t.name.trim())).map((t) => t.id));
  if (vague.size) {
    const real = topics.filter((t) => !vague.has(t.id));
    for (const e of exams) {
      if (!e.topicIds.some((id) => vague.has(id))) continue;
      const own = e.topicIds.filter((id) => !vague.has(id));
      e.topicIds = own.length ? own : real.map((t) => t.id);
      e.cumulative = true;
    }
    topics.splice(0, topics.length, ...real);
  }
  // Only ask about what matters: heaviest first, and nothing under 10% (unknown weights still get asked).
  const wOf = (name: string) => { const a = p.assessments.find((x) => x.name === name); return (a && weightOf(p, a)) ?? 100; };
  const ranked = missing
    .filter((m) => m.kind === "termStart" || wOf(m.assessment) >= 10)
    .sort((a, b) => (a.kind === "termStart" ? -1 : b.kind === "termStart" ? 1 : wOf((b as any).assessment) - wOf((a as any).assessment)));
  return { courses: [{ id: courseId, name: p.courseName }], exams, topics, deadlines, missing: ranked };
}

/** Calendar weeks (Mon-Sun) with two or more deadlines: "several things due at once". Heaviest first. Crunch detection in code. */
export function crunchWeeks(exams: { date: string; weight: number }[], tz: string): { monday: string; count: number; weightPercent: number }[] {
  const by = new Map<string, { count: number; w: number }>();
  for (const e of exams) {
    const day = localDay(new Date(e.date), tz);
    const dow = (new Date(toUtc(day)).getUTCDay() + 6) % 7; // Monday = 0
    const monday = addDays(day, -dow);
    const cur = by.get(monday) ?? { count: 0, w: 0 };
    by.set(monday, { count: cur.count + 1, w: cur.w + e.weight * 100 });
  }
  return [...by.entries()].filter(([, v]) => v.count >= 2).map(([monday, v]) => ({ monday, count: v.count, weightPercent: Math.round(v.w) })).sort((a, b) => b.weightPercent - a.weightPercent);
}

/** The text the agent sends right after reading a syllabus. Leads with what is next, then the heaviest item, then crunch. */
export function describe(p: ParsedSyllabus, patch: Patch, tz: string, now: Date = new Date()): string {
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz });
  const pct = (w: number) => `${Math.round(w * 100)}%`;
  const upcomingOnly = <T extends { date: string }>(xs: T[]) => { const u = xs.filter((x) => daysUntil(x.date, now, tz) >= 0); return u.length ? u : xs; };
  const parts = [`Got it. ${p.courseName}.`];
  const next = [...upcomingOnly(patch.deadlines.filter((d) => d.weight >= 0.1))].sort((a, b) => a.date.localeCompare(b.date))[0];
  if (next) parts.push(`Next up: ${next.name} on ${fmt(next.date)}${next.weight ? ` (${pct(next.weight)})` : ""}.`);
  const heavy = [...upcomingOnly(patch.exams)].sort((a, b) => b.weight - a.weight)[0];
  if (heavy && (!next || heavy.name !== next.name)) {
    const names = patch.topics.filter((t) => heavy.topicIds.includes(t.id)).map((t) => t.name);
    const cover = heavy.cumulative || (names.length === 1 && /cumulative/i.test(names[0]!)) ? " and is cumulative" : names.length ? ` and covers ${names.slice(0, 3).join(", ")}` : "";
    parts.push(`${heavy.name} is ${pct(heavy.weight)}${cover}.`);
  }
  if (!next && !heavy) parts.push("I couldn't find dated assessments yet.");
  const today = localDay(now, tz);
  const crunchAll = crunchWeeks(patch.deadlines, tz);
  const crunch = crunchAll.filter((c) => addDays(c.monday, 6) >= today)[0] ?? crunchAll[0]; // compare calendar days as strings: no timezone drift
  if (crunch) {
    const startMonday = p.termStartDate ? addDays(p.termStartDate, -((new Date(toUtc(p.termStartDate)).getUTCDay() + 6) % 7)) : null; // week 1 = the week containing the first day
    const n = startMonday ? Math.floor((toUtc(crunch.monday) - toUtc(startMonday)) / 86_400_000 / 7) + 1 : 0;
    parts.push(n > 0 ? `Week ${n} looks heavy.` : `The week of ${fmt(zoned(...(crunch.monday.split("-").map(Number) as [number, number, number]), 12, 0, tz).toISOString())} looks heavy.`);
  }
  return parts.join(" ");
}

/** What the agent asks about, one thing at a time. Null when nothing is missing. */
export function nextQuestion(missing: Missing[], courseName: string): string | null {
  const m = missing[0];
  if (!m) return null;
  if (m.kind === "termStart") return `Your syllabus gives week numbers. When did ${courseName} start? (e.g. Sept 14)`;
  if (m.kind === "date") return `I couldn't find a date for ${m.assessment}. When is it? (e.g. Oct 21)`;
  return `I couldn't find how much ${m.assessment} counts for. What percent of the grade is it?`;
}
