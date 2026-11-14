// Deterministic logic. "Use code for math, use the LLM for language."
import type { Busy, Choice, Counters, Question, StudentState } from "./types.ts";

export const LIMITS = { quizzesPerDay: 3, nudgesPerDay: 3 } as const;
export const QUIET = { startHour: 23, endHour: 8 } as const;

export function gradeChoice(q: Pick<Question, "correct">, answer: Choice): boolean {
  return q.correct === answer;
}

/** Wrong: x0.7. Right: close 30% of the gap to 100%. */
export function updateMastery(m: number, correct: boolean): number {
  const next = correct ? m + (1 - m) * 0.3 : m * 0.7;
  return Math.round(next * 1000) / 1000;
}

/** Whole calendar days from today to the date, in the student's timezone ("in 6 days" means 6 days on the calendar). */
export function daysUntil(iso: string, now: Date, tz = "America/New_York"): number {
  const a = localDay(new Date(iso), tz).split("-").map(Number) as [number, number, number];
  const b = localDay(now, tz).split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(a[0], a[1] - 1, a[2]) - Date.UTC(b[0], b[1] - 1, b[2])) / 86_400_000);
}

/** priority = grade weight x weakness x how soon the exam is */
export function priority(weight: number, mastery: number, days: number): number {
  return weight * (1 - mastery) * (1 / Math.max(1, days));
}

export function rankTopics(state: StudentState, now: Date, tz = "America/New_York"): { topicId: string; score: number }[] {
  const out: { topicId: string; score: number }[] = [];
  for (const exam of state.exams) {
    const days = daysUntil(exam.date, now, tz);
    if (days < 0) continue;
    for (const topicId of exam.topicIds) {
      out.push({ topicId, score: priority(exam.weight, state.mastery[topicId] ?? 0.5, days) });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

// ---- reply matching ----
export type Reply = { kind: "choice"; value: Choice } | { kind: "yes" } | { kind: "no" } | { kind: "other" };

export function parseReply(text: string): Reply {
  const t = text.trim().toLowerCase();
  // A, B or C with stray punctuation or a short lead-in: "b", "(b)", "B)", "B\\", "b!", "I think B", "answer is c", "going with a"
  const choice = t.match(/^(?:(?:answer(?: is)?|it'?s|its|i think|i'?ll say|going with|my answer is|probably)\s+)?[^\p{L}\p{N}]*([abc])[^\p{L}\p{N}]*$/u);
  if (choice) return { kind: "choice", value: choice[1]!.toUpperCase() as Choice };
  if (/^(yes|y|yep|yeah|yup|sure|approve)(\s+please)?\W*$/.test(t)) return { kind: "yes" };
  if (/^(no|n|nope|nah|not now|no thanks)\W*$/.test(t)) return { kind: "no" }; // "skip" is deliberately not here: with a question open it means skip the question
  return { kind: "other" };
}

/** A short non-answer while something is pending ("maybe", "hmm"). */
export function isAmbiguous(text: string): boolean {
  return /^(maybe|idk|not sure|hmm+|later|ok|okay|i guess|perhaps)\W*$/i.test(text.trim());
}

// ---- time ----
function parts(d: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric",
  });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(d)) if (p.type !== "literal") o[p.type] = Number(p.value);
  return { y: o.year!, m: o.month!, d: o.day!, h: o.hour!, mi: o.minute! };
}

export const localHour = (d: Date, tz: string) => parts(d, tz).h;
export function localDay(d: Date, tz: string): string {
  const p = parts(d, tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function inQuietHours(d: Date, tz: string): boolean {
  const h = localHour(d, tz);
  return h >= QUIET.startHour || h < QUIET.endHour;
}

/** The Date for a wall-clock time in a timezone. */
export function zoned(y: number, m: number, d: number, h: number, mi: number, tz: string): Date {
  const target = Date.UTC(y, m - 1, d, h, mi);
  let t = target;
  for (let i = 0; i < 2; i++) {
    const p = parts(new Date(t), tz);
    t += target - Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
  }
  return new Date(t);
}

export function weekdayName(d: Date, tz: string): string {
  return d.toLocaleDateString("en-US", { weekday: "long", timeZone: tz });
}
/** "Tuesday, Nov 17": the weekday plus the exact date, so a proposed slot is never ambiguous. */
export function dayDate(d: Date, tz: string): string {
  return `${weekdayName(d, tz)}, ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz })}`;
}
export function clock(d: Date, tz: string): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).replace(/\s?[AP]M/, "");
}

// ---- caps ----
export function rollCounters(c: Counters, now: Date, tz: string): Counters {
  const day = localDay(now, tz);
  return c.day === day ? c : { day, quizzes: 0, nudges: 0 };
}

export type SendCheck = { ok: true } | { ok: false; reason: "quiet_hours" | "daily_cap" };
export function canSend(kind: "quiz" | "nudge", c: Counters, now: Date, tz: string, bypass = false): SendCheck {
  if (bypass) return { ok: true };
  if (inQuietHours(now, tz)) return { ok: false, reason: "quiet_hours" };
  const rolled = rollCounters(c, now, tz);
  const used = kind === "quiz" ? rolled.quizzes : rolled.nudges;
  const cap = kind === "quiz" ? LIMITS.quizzesPerDay : LIMITS.nudgesPerDay;
  return used >= cap ? { ok: false, reason: "daily_cap" } : { ok: true };
}

// ---- scheduling ----
const overlaps = (aS: number, aE: number, b: Busy) => aS < new Date(b.endISO).getTime() && aE > new Date(b.startISO).getTime();

/** First free slot at `hour` local time, from tomorrow until the day before the exam. Prefers a weekday. */
export function pickSlot(
  now: Date, examISO: string, busy: Busy[], tz: string,
  opts: { hour?: number; minutes?: number; preferWeekday?: number } = {},
): { startISO: string; endISO: string } | null {
  const hour = opts.hour ?? 16, minutes = opts.minutes ?? 30;
  const today = parts(now, tz);
  const lastDay = Math.max(1, daysUntil(examISO, now, tz));
  for (const strict of opts.preferWeekday === undefined ? [false] : [true, false]) {
    for (let d = 1; d <= lastDay; d++) {
      const base = Date.UTC(today.y, today.m - 1, today.d + d);
      const day = new Date(base);
      if (strict && day.getUTCDay() !== opts.preferWeekday) continue;
      const start = zoned(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hour, 0, tz);
      const end = new Date(start.getTime() + minutes * 60_000);
      if (end.getTime() > new Date(examISO).getTime()) break; // never schedule after the exam starts
      if (busy.some((b) => overlaps(start.getTime(), end.getTime(), b))) continue;
      return { startISO: start.toISOString(), endISO: end.toISOString() };
    }
  }
  return null;
}

/** A short, readable name for a reading: "Homer, The Odyssey, Books 1-13" -> "Homer, The Odyssey". */
export function topicLabel(name: string, max = 46): string {
  let t = name.trim()
    .replace(/^selections?\s+(from|of)\s+/i, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/,?\s*(pp?\.?|books?|lines?|chapters?|ch\.|cantos?|sections?)\s*\d.*$/i, "")
    .replace(/,?\s+\d[\d\s,–-]*$/, "") // a bare trailing page range: "Said, Orientalism, 226-328"
    .replace(/\s+through\s+.*$/i, "")
    .trim() || name.trim();
  if (t.length > max) t = `${t.slice(0, max - 1).trim()}…`;
  return t;
}
