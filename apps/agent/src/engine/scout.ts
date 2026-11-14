// Scout is read-only: it looks for new material and hands it to the Tutor. It never sends email or deletes anything.
import { canSend, rollCounters } from "@syllabus-crew/core";
import { bypassFor, type Ctx } from "./ctx.ts";
import { sendQuiz } from "./tutor.ts";

/** Finds staged material (demo) and unlocks its questions. Returns true if anything new was found. */
export async function runScout(ctx: Ctx): Promise<boolean> {
  const { state } = ctx;
  if (!state.openedByStudent) return false;
  if (!canSend("nudge", state.counters, ctx.deps.clock.now(), ctx.deps.tz, bypassFor(ctx.deps, state.id)).ok) return false; // proactive text: no 11pm-8am, and it counts toward the daily limit
  const fresh = state.inbox.filter((m) => !state.foundMaterialIds.includes(m.id));
  if (fresh.length === 0) return false;
  for (const m of fresh) {
    state.foundMaterialIds.push(m.id);
    (state.nudges ??= []).push({ at: ctx.deps.clock.now().toISOString(), kind: "scout", key: `scout:${m.id}` });
    state.counters = rollCounters(state.counters, ctx.deps.clock.now(), ctx.deps.tz);
    state.counters.nudges += 1;
    state.unlockedQuestionIds.push(...m.questionIds);
    await ctx.say(`${m.sender} posted ${m.title}. Added ${m.questionIds.length === 1 ? "a question" : "a few questions"} to your quiz.`, "scout");
  }
  await sendQuiz(ctx);
  return true;
}
