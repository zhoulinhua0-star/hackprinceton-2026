// Real-syllabus onboarding: install what was read, then ask about what's missing, one question at a time.
// The model only reads the document. Every question and every answer is handled by code.
import { applyAnswer, askKey, daysUntil, isSkip, nextQuestion, parseDateAnswer, parsePercent, toPatch } from "@syllabus-crew/core";
import type { Missing, StudentState } from "@syllabus-crew/core";
import type { Ctx, Deps } from "./ctx.ts";

/** Rebuilds courses/exams/topics/deadlines from the stored syllabus, and returns what is still unknown. */
export function refresh(state: StudentState, tz: string) {
  const patch = toPatch(state.syllabus!, tz);
  state.courses = patch.courses; state.exams = patch.exams; state.topics = patch.topics; state.deadlines = patch.deadlines;
  const skipped = new Set(state.skippedAsks ?? []);
  return { patch, missing: patch.missing.filter((m) => !skipped.has(askKey(m))) };
}

/** Asks the next open question (with an optional lead-in). Returns the text sent, or null when nothing is open. */
export async function askNext(ctx: Ctx, missing: Missing[], lead = ""): Promise<string | null> {
  const { state } = ctx;
  const m = missing[0];
  if (!m) { state.pendingAsk = undefined; return null; }
  state.pendingAsk = { missing: m, tries: 0 };
  const text = `${lead}${nextQuestion([m], state.syllabus!.courseName)}`;
  await ctx.say(text, "ask");
  return text;
}

const COMMAND = /\bquiz me\b|another (one|question)|next question|\b(focus|prioriti[sz]e)\b|what should i (study|work on)/i;
const HINT = { date: "I didn't catch that date. Try something like Oct 21, or say skip.", weight: "I didn't catch that. Reply with a percent like 20, or say skip.", termStart: "I didn't catch that date. Try something like Sept 14, or say skip." } as const;

/** Handles a reply while a question is open. Returns false if the text isn't an answer attempt (a normal command). */
export async function tryAnswerAsk(ctx: Ctx, text: string): Promise<boolean> {
  const { state, deps } = ctx;
  const ask = state.pendingAsk!;
  if (COMMAND.test(text)) return false;

  let value: string | number | null = null;
  const skipped = isSkip(text);
  if (!skipped) {
    if (ask.missing.kind === "weight") value = parsePercent(text);
    else {
      const ymd = parseDateAnswer(text, deps.clock.now(), deps.tz);
      // a date more than a year from today is probably a typo
      value = ymd && Math.abs(daysUntil(`${ymd}T12:00:00Z`, deps.clock.now(), "UTC")) <= 366 ? ymd : null;
    }
    if (value === null) {
      ask.tries += 1;
      if (ask.tries < 2) { await ctx.say(HINT[ask.missing.kind], "ask"); return true; } // commit happens inside say
    }
  }

  const gaveUp = skipped || value === null;
  if (gaveUp) state.skippedAsks = [...(state.skippedAsks ?? []), askKey(ask.missing)];
  else state.syllabus = applyAnswer(state.syllabus!, ask.missing, value!);

  const { missing } = refresh(state, deps.tz);
  const lead = gaveUp ? "No problem, I'll leave that one. " : "Got it. ";
  if (!(await askNext(ctx, missing, lead))) await ctx.say(`${lead}That's everything I needed.`, "ask");
  return true;
}

export const needsAnswer = (state: StudentState) => !!state.pendingAsk && !!state.syllabus;
export type { Deps };
