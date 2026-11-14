// Voice drills: the student explains one idea out loud on a phone call. The model writes the question and judges which
// key points the student covered; the score, the mastery change and every rule about when to call are code.
import type { CallLine } from "./interfaces.ts";
import type { Drill, Question, StudentState } from "./types.ts";

export const DRILL = {
  /** At most this many drills a day (the student's own CALL counts too, except in demo mode). */
  perDay: 1,
  /** Calls only in this local window, like nudges. */
  firstHour: 9,
  lastHour: 20,
  /** Give up on a call that never finishes. */
  timeoutMs: 10 * 60_000,
  /** How far one drill moves mastery up toward its score: a spoken explanation is strong evidence. */
  weight: 0.45,
  /** How far a weak drill moves it down: no harsher than a wrong A/B/C answer (0.5 -> 0.35). */
  weightDown: 0.3,
};

/** Mastery after a drill: moves toward the fraction of key points covered (up by 45%, down by 30% of the gap). 0.35 with 2 of 3 covered gives 0.49; 0.5 with none gives 0.35. */
export function drillMastery(m: number, score: number): number {
  const s = Math.max(0, Math.min(1, score));
  const next = m + (s >= m ? DRILL.weight : DRILL.weightDown) * (s - m);
  return Math.round(next * 1000) / 1000;
}

export const DRILL_SCHEMA = {
  type: "object", additionalProperties: false, required: ["question", "keyPoints"],
  properties: {
    question: { type: "string", description: "One open question asking the student to explain the idea in their own words. Under 140 characters." },
    keyPoints: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" }, description: "The 2-4 points a good spoken answer covers, each under 90 characters." },
  },
};

export const GRADE_SCHEMA = {
  type: "object", additionalProperties: false, required: ["covered", "feedback"],
  properties: {
    covered: { type: "array", items: { type: "integer" }, description: "Indexes (0-based) of the key points the STUDENT clearly explained in their own words. Points only the agent said do not count." },
    feedback: { type: "string", description: "One short sentence to the student: what they explained well and the main thing they missed. No score." },
  },
};

/** Checks the model's drill. Null when it isn't usable. */
export function validateDrill(raw: unknown): { question: string; keyPoints: string[] } | null {
  const o = raw as { question?: unknown; keyPoints?: unknown };
  if (typeof o?.question !== "string" || !Array.isArray(o.keyPoints)) return null;
  const question = o.question.trim(), keyPoints = o.keyPoints.filter((k): k is string => typeof k === "string" && !!k.trim()).map((k) => k.trim());
  if (!question || question.length > 200 || keyPoints.length < 2 || keyPoints.length > 4 || keyPoints.some((k) => k.length > 140)) return null;
  return { question, keyPoints };
}

/** A drill built from a quiz question, for when the model is slow or unavailable. */
export function drillFromQuestion(q: Question): { question: string; keyPoints: string[] } {
  const prompt = q.prompt.replace(/\s+/g, " ").trim().replace(/\?$/, "");
  return { question: `In your own words: ${prompt}, and why?`, keyPoints: [q.choices[q.correct], q.explanation] };
}

/** Checks the model's grade against the key points. Null when it isn't usable. */
export function validateGrade(raw: unknown, keyPoints: number): { covered: number[]; feedback: string } | null {
  const o = raw as { covered?: unknown; feedback?: unknown };
  if (!Array.isArray(o?.covered) || typeof o.feedback !== "string") return null;
  const covered = [...new Set(o.covered.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < keyPoints))].sort();
  const feedback = o.feedback.trim().replace(/\s+/g, " ");
  return feedback && feedback.length <= 240 ? { covered, feedback } : null;
}

const STOP = new Set("the a an of to and or in on for is are be it its that this with as by from at their they them than then so".split(" "));
const words = (t: string) => t.toLowerCase().match(/[a-z0-9']+/g)?.filter((w) => w.length > 2 && !STOP.has(w)) ?? [];

/** Fallback grading when the model is unavailable: a key point counts if the student said most of its main words. */
export function keywordGrade(keyPoints: string[], studentText: string): number[] {
  const said = new Set(words(studentText).map((w) => w.slice(0, 4)));
  return keyPoints.flatMap((k, i) => {
    const need = [...new Set(words(k).map((w) => w.slice(0, 4)))];
    const hit = need.filter((w) => said.has(w)).length;
    return need.length && hit / need.length >= 0.5 ? [i] : [];
  });
}

/** What the student said on the call, as one block of text. */
export const studentSpeech = (t: CallLine[] = []) => t.filter((l) => l.role === "user").map((l) => l.text.trim()).filter(Boolean).join(" ");

/** True when a drill may start now: one at a time, in the call window, and under the daily limit (unless bypassed). */
export function canDrill(state: StudentState, now: Date, tz: string, bypass: boolean): { ok: true } | { ok: false; reason: "busy" | "hours" | "daily" } {
  const drills = state.drills ?? [];
  if (drills.some((d) => d.status === "calling")) return { ok: false, reason: "busy" };
  if (bypass) return { ok: true };
  const hour = +new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(now);
  if (hour < DRILL.firstHour || hour >= DRILL.lastHour) return { ok: false, reason: "hours" };
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const today = drills.filter((d) => d.status !== "failed" && day(new Date(d.startedAt)) === day(now)).length;
  return today >= DRILL.perDay ? { ok: false, reason: "daily" } : { ok: true };
}

/** "2:41" */
export const callLength = (secs = 0) => `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, "0")}`;

/** The recap text after a drill. The percentages are code; the feedback sentence is the model's. Anything missed is spelled out, so the answer is always in the thread. */
export function drillRecap(d: Drill, topicName: string, feedback: string): string {
  const pct = (v = 0.5) => `${Math.round(v * 100)}%`;
  const missed = d.missed ?? [];
  const answer = missed.length ? `\n\nThe answer: ${missed.map((k) => k.replace(/[.\s]+$/, "")).join(". ")}.` : "";
  return `Voice drill, ${callLength(d.durationSecs)}. ${feedback} ${topicName}: ${pct(d.masteryBefore)} → ${pct(d.masteryAfter)}.${answer}`;
}
