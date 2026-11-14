import { canSend, gradeChoice, rankTopics, rollCounters, topicLabel, updateMastery, voice, weekdayName } from "@syllabus-crew/core";
import type { Choice, Question } from "@syllabus-crew/core";
import { bypassFor, safeText, sleep, type Ctx } from "./ctx.ts";
import { onMasteryChange } from "./planner.ts";

/**
 * The quiz text. Written questions get a clean layout (progress header, the question, one choice per line). The
 * hand-written demo questions keep the exact wording from the demo script.
 */
export function renderQuiz(ctx: Ctx, q: Question): string {
  const { state, deps } = ctx;
  const topic = state.topics.find((t) => t.id === q.topicId);
  if (q.generated) {
    const label = topicLabel(topic?.name ?? "your course");
    const s = state.session;
    const head = s ? `Question ${s.asked} of ${s.total} · ${label}` : `Quick one · ${label}`;
    // A one-time tip, on the first question of a round (or a one-off), so the student knows a nudge is a text away.
    const tip = !s || s.asked === 1 ? `\n\nStuck? Just text "hint" and I'll give you a nudge.` : "";
    return `${head}\n\n${q.prompt}\n\nA) ${q.choices.A}\nB) ${q.choices.B}\nC) ${q.choices.C}${tip}`;
  }
  const exam = state.exams.find((e) => e.topicIds.includes(q.topicId));
  const when = exam ? ` before ${weekdayName(new Date(exam.date), deps.tz)}` : "";
  return `Quick one on ${topic?.short ?? "your course"}${when}. ${q.prompt}\nA) ${q.choices.A}  B) ${q.choices.B}  C) ${q.choices.C}`;
}

/**
 * Sends the next quiz question. Returns false (and sends nothing) if it is not allowed.
 * A question that is already open is never overwritten, unless `force` (a demo control) replaces it.
 */
export async function sendQuiz(ctx: Ctx, opts: { force?: boolean; solicited?: boolean; startSession?: number; preferTopic?: string; lead?: string } = {}): Promise<boolean> {
  const { state, deps } = ctx;
  if (!state.openedByStudent) return false; // never cold-text
  if (state.pendingQuiz && !opts.force) return false;
  const now = deps.clock.now();
  // Caps and quiet hours guard texts the agent starts on its own. A quiz the student asked for (or the next question
  // of a round they started) is a reply, not an interruption.
  if (!opts.solicited) {
    const gate = canSend("quiz", state.counters, now, deps.tz, bypassFor(deps, state.id));
    if (!gate.ok) return false;
  }

  const unlocked = state.questions.filter((q) => state.unlockedQuestionIds.includes(q.id));
  if (unlocked.length === 0) return false;
  if (state.pendingQuiz) state.askedQuestionIds.push(state.pendingQuiz.questionId); // replaced by force: count the abandoned one as asked
  const fresh = unlocked.filter((q) => !state.askedQuestionIds.includes(q.id));
  if (!fresh.length && (opts.startSession || state.session)) return false; // a round never repeats questions
  const all = fresh.length ? fresh : unlocked;
  const pool = opts.preferTopic && all.some((x) => x.topicId === opts.preferTopic) ? all.filter((x) => x.topicId === opts.preferTopic) : all;
  let q = pool[0]!;
  for (const { topicId } of rankTopics(state, now, deps.tz)) {
    const hit = pool.find((x) => x.topicId === topicId);
    if (hit) { q = hit; break; }
  }
  if (opts.startSession) state.session = { total: opts.startSession, asked: 0, answered: 0, firstTry: 0, topicIds: [] };
  if (state.session) { state.session.asked += 1; state.session.topicIds.push(q.topicId); }
  state.pendingQuiz = { questionId: q.id, attempts: 0 };
  state.counters = rollCounters(state.counters, now, deps.tz);
  state.counters.quizzes += 1;
  await ctx.say(`${opts.lead ?? ""}${renderQuiz(ctx, q)}`, "quiz"); // if the send fails, none of the above is persisted
  return true;
}

/** `"unknown"` is the student giving up ("I don't know"): it counts as a miss, like a wrong answer. */
export async function answerQuiz(ctx: Ctx, choice: Choice | "unknown"): Promise<void> {
  const { state, deps } = ctx;
  const pq = state.pendingQuiz!;
  const q = state.questions.find((x) => x.id === pq.questionId)!;
  const correct = choice === "unknown" ? false : gradeChoice(q, choice); // graded in code
  // "I don't know" right after a hint is giving up: skip the second hint and reveal the answer.
  if (choice === "unknown" && pq.hinted && pq.attempts === 0) pq.attempts = 1;
  state.mastery[q.topicId] = updateMastery(state.mastery[q.topicId] ?? 0.5, correct); // mastery in code
  pq.attempts += 1;

  let resolved = false;
  if (correct) {
    state.pendingQuiz = undefined;
    state.askedQuestionIds.push(q.id);
    resolved = true;
    if (state.session) { state.session.answered += 1; if (pq.attempts === 1) state.session.firstTry += 1; }
    await ctx.say(`${voice(state.vibe).correct} ${q.explanation}`, "tutor");
  } else if (pq.attempts === 1) {
    await ctx.commit(); // the dashboard mastery bar drops now, before the follow-up is written
    const leak = (t: string) => !t.toLowerCase().includes(q.choices[q.correct].toLowerCase());
    const follow = await safeText(
      deps, "socratic", "tutor",
      `Question: ${q.prompt}\nChoices: A) ${q.choices.A} B) ${q.choices.B} C) ${q.choices.C}\n${choice === "unknown" ? "The student said they don't know." : `The student answered ${choice}.`} Ask one Socratic question.`,
      q.socratic, leak,
    );
    await ctx.say(`${voice(state.vibe).miss} ${follow}`, "tutor");
  } else {
    state.pendingQuiz = undefined;
    state.askedQuestionIds.push(q.id);
    resolved = true;
    if (state.session) state.session.answered += 1;
    await ctx.say(`The answer is ${q.correct}) ${q.choices[q.correct]}. ${q.explanation}`, "tutor");
  }
  await onMasteryChange(ctx, q.topicId);
  if (resolved) await advanceSession(ctx); // a wrong first answer waits for the retry; a finished question moves on by itself
}

/** After a question is settled: the next one arrives by itself, or the round wraps up with a summary. */
export async function advanceSession(ctx: Ctx): Promise<void> {
  const s = ctx.state.session;
  if (!s) return;
  if (s.asked >= s.total) return endSession(ctx);
  await sleep(ctx.deps.opts.nextQuestionDelayMs);
  if (!(await sendQuiz(ctx, { solicited: true }))) await endSession(ctx);
}

export async function endSession(ctx: Ctx, lead = ""): Promise<void> {
  const { state } = ctx;
  const s = state.session;
  state.session = undefined;
  if (!s) return;
  const weakest = [...new Set(s.topicIds)].sort((a, b) => (state.mastery[a] ?? 0.5) - (state.mastery[b] ?? 0.5))[0];
  const topic = weakest && state.topics.find((t) => t.id === weakest);
  const score = s.answered ? `${s.answered} done, ${s.firstTry} right on the first try.` : "No answers this time.";
  const weak = topic && s.answered ? ` Weakest right now: ${topicLabel(topic.name)} (${Math.round((state.mastery[weakest!] ?? 0.5) * 100)}%).` : "";
  await ctx.say(`${lead}That's the round. ${score}${weak} Say "quiz me" for another.`, "tutor");
}
