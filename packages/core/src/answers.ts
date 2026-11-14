// Understanding the student's text answers to the agent's questions. All in code: no model guesses a date.
import { localDay } from "./logic.ts";
import type { Missing, ParsedSyllabus } from "./syllabus.ts";

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const toUtc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);
const validDate = (y: number, m: number, d: number) => { const t = new Date(toUtc(y, m, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };
const pad = (n: number) => String(n).padStart(2, "0");

/** "Oct 21", "October 21st", "10/21", "10/21/26", "2026-10-21", "21 Oct", "it's Oct 21" -> "2026-10-21". Null if unclear. */
export function parseDateAnswer(text: string, now: Date, tz: string): string | null {
  const t = text.trim().toLowerCase()
    .replace(/[,.!?]/g, " ").replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/\s+/g, " ").trim()
    .replace(/^((it'?s|it is|its|on|the|due|is|around|about)\s+)+/, "");
  let y: number | undefined, mo: number, d: number, m: RegExpMatchArray | null;
  if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) { y = +m[1]!; mo = +m[2]!; d = +m[3]!; }
  else if ((m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/))) { mo = +m[1]!; d = +m[2]!; if (m[3]) y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; }
  else if ((m = t.match(/^([a-z]+) (\d{1,2})(?: (\d{4}))?$/)) && MONTHS[m[1]!]) { mo = MONTHS[m[1]!]!; d = +m[2]!; if (m[3]) y = +m[3]; }
  else if ((m = t.match(/^(\d{1,2}) ([a-z]+)(?: (\d{4}))?$/)) && MONTHS[m[2]!]) { mo = MONTHS[m[2]!]!; d = +m[1]!; if (m[3]) y = +m[3]; }
  else return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if (y === undefined) { // no year given: the year that puts the date closest to today
    const ty = Number(localDay(now, tz).slice(0, 4));
    const today = toUtc(ty, ...(localDay(now, tz).slice(5).split("-").map(Number) as [number, number]));
    const options = [ty - 1, ty, ty + 1].filter((yy) => validDate(yy, mo, d));
    if (!options.length) return null;
    y = options.sort((a, b) => Math.abs(toUtc(a, mo, d) - today) - Math.abs(toUtc(b, mo, d) - today) || b - a)[0]!;
  }
  if (!validDate(y, mo, d)) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/** "20", "20%", "about 15 percent" -> 20. Null if not a plausible grade percent. */
export function parsePercent(text: string): number | null {
  const m = text.trim().toLowerCase().replace(/[!.]+$/, "").match(/^(?:(?:it'?s|it is|about|around|roughly|maybe)\s+)*(\d{1,3}(?:\.\d+)?)\s*(?:%|percent)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 && n <= 100 ? n : null;
}

/** "I don't know", "no idea", "I give up": a student giving up on a question counts as a miss. */
export const isDontKnow = (text: string) =>
  /^(idk|i (do not|don'?t|dont) know( (this|that|it|the answer))?|dunno|no idea|i have no idea|i give up|give up|tell me|what'?s the answer|show me the answer|reveal( it)?)\W*$/i.test(text.trim());

/** Softer than "I don't know": could be about the question or about a proposal that's waiting, so only the question when nothing else is open. */
export const isUnsure = (text: string) => /^(not sure|i'?m not sure|i'?m stuck|i'?m lost|stuck|lost)\W*$/i.test(text.trim());

/** Asking for a nudge: answered with the hint, no penalty. */
export const isHintRequest = (text: string) => /^(hint|a hint|give me a hint|can i (get|have) a hint|clue|a clue)\W*$/i.test(text.trim());

export const isSkip = (text: string) => /^(skip|idk|i don'?t know|dont know|don'?t know|not sure|n\/?a|none|no idea|pass)\W*$/i.test(text.trim());

/** Folds an answer back into the parse. Returns a new parse. */
export function applyAnswer(p: ParsedSyllabus, ask: Missing, value: string | number): ParsedSyllabus {
  if (ask.kind === "termStart") return { ...p, termStartDate: String(value) };
  if (ask.kind === "date") return { ...p, assessments: p.assessments.map((a) => (a.name === ask.assessment ? { ...a, date: String(value), week: null } : a)) };
  return {
    ...p,
    categories: [...p.categories.filter((c) => c.name !== ask.assessment), { name: ask.assessment, weightPercent: Number(value) }],
    assessments: p.assessments.map((a) => (a.name === ask.assessment ? { ...a, category: ask.assessment } : a)),
  };
}

/** A stable key for a question, so a skipped one is never asked again. */
export const askKey = (m: Missing) => (m.kind === "termStart" ? "termStart" : `${m.kind}:${m.assessment}`);
