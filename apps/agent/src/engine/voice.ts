// Voice drills, part of the Tutor: "explain it in your own words" on a short phone call, then a recap text.
// Calls only happen after the student says CALL (or asks for a drill). Scoring and mastery are code.
import {
  DRILL, DRILL_SCHEMA, GRADE_SCHEMA, canDrill, canSend, daysUntil, drillFromQuestion, drillMastery, drillRecap,
  keywordGrade, rankTopics, rollCounters, studentSpeech, topicLabel, validateDrill, validateGrade,
} from "@syllabus-crew/core";
import type { CallStatus, Drill, LLM, StudentState } from "@syllabus-crew/core";
import { bypassFor, rules, type Ctx } from "./ctx.ts";
import { onMasteryChange } from "./planner.ts";
import { drillLink, sendLink } from "./cards.ts";

export const OFFER_HOURS = 3;
const pretty = (n?: string) => n?.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3") ?? "my number";
const nameOf = (state: StudentState, topicId: string) => {
  const t = state.topics.find((x) => x.id === topicId);
  return t ? (t.short === t.name ? topicLabel(t.name) : t.short) : "this topic";
};

/** The weakest topic with an exam still ahead (or the one asked for). */
function pickTopic(state: StudentState, now: Date, tz: string, wanted?: string): string | undefined {
  const ahead = (id: string) => state.exams.some((e) => e.topicIds.includes(id) && daysUntil(e.date, now, tz) >= 0);
  if (wanted && ahead(wanted)) return wanted;
  return rankTopics(state, now, tz).map((r) => r.topicId).find(ahead);
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([p, new Promise<undefined>((r) => { t = setTimeout(() => r(undefined), ms); })]); }
  catch { return undefined; } finally { clearTimeout(t); }
}

/** "Exam 2 is in 2 days and chapter 5 is at 35%. Want a 3-minute voice drill? Reply CALL." A proactive text: it obeys the nudge rules unless forced. */
export async function offerDrill(ctx: Ctx, o: { force?: boolean } = {}): Promise<{ sent: boolean; reason?: string }> {
  const { state, deps } = ctx;
  const now = deps.clock.now();
  if (!deps.caller) return { sent: false, reason: "voice drills are not set up (ELEVENLABS_* in .env)" };
  if (!state.openedByStudent) return { sent: false, reason: "this number hasn't texted the line" };
  if (!o.force && !canSend("nudge", state.counters, now, deps.tz, bypassFor(deps, state.id)).ok) return { sent: false, reason: "quiet hours or today's limit" };
  const topicId = pickTopic(state, now, deps.tz);
  const exam = topicId && state.exams.find((e) => e.topicIds.includes(topicId));
  if (!topicId || !exam) return { sent: false, reason: "no exam coming up" };
  const days = daysUntil(exam.date, now, deps.tz);
  const pct = Math.round((state.mastery[topicId] ?? 0.5) * 100);
  state.pendingOffer = { kind: "call", topicId, expiresAt: new Date(now.getTime() + OFFER_HOURS * 3_600_000).toISOString() };
  state.counters = rollCounters(state.counters, now, deps.tz);
  state.counters.nudges += 1;
  (state.nudges ??= []).push({ at: now.toISOString(), kind: "mastery", key: `drill:${topicId}:${now.toISOString().slice(0, 10)}` });
  await ctx.say(`${exam.name} is ${days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`} and ${nameOf(state, topicId)} is at ${pct}%. Want a 3-minute voice drill? Reply CALL.`, "drill");
  return { sent: true };
}

/** The question and key points for one topic: written by the model, or built from a quiz question if it is slow. */
async function buildDrill(llm: LLM, state: StudentState, topicId: string): Promise<{ question: string; keyPoints: string[] }> {
  const topic = state.topics.find((t) => t.id === topicId)!;
  const exam = state.exams.find((e) => e.topicIds.includes(topicId));
  const q = state.questions.find((x) => x.topicId === topicId && state.askedQuestionIds.includes(x.id)) ?? state.questions.find((x) => x.topicId === topicId);
  const raw = await withTimeout(llm.extractJson("write_drill", {
    system: rules("voice-drill-writer"),
    user: `Course: ${state.courses[0]?.name ?? ""}. Exam: ${exam?.name ?? ""}. Topic: ${topic.name}.${q ? ` A quiz question on it: ${q.prompt} (answer: ${q.choices[q.correct]}; ${q.explanation})` : ""}`,
    attachments: [], toolName: "record_drill", schema: DRILL_SCHEMA,
  }), 12_000);
  const ok = validateDrill(raw);
  if (ok) return ok;
  if (q) return drillFromQuestion(q);
  return { question: `In your own words, what is the main idea of ${topicLabel(topic.name)}, and why does it matter?`, keyPoints: [`the main idea of ${topicLabel(topic.name)}`, "why it matters, with one example"] };
}

/** Starts a drill after the student said CALL. Texts first, then rings. Never leaves a drill marked "calling" if the call didn't start. */
export async function startDrill(ctx: Ctx, wanted?: string): Promise<void> {
  const { state, deps } = ctx;
  const now = deps.clock.now();
  if (!deps.caller) return ctx.say("Voice drills aren't switched on yet. Say \"quiz me\" for a text quiz instead.", "drill");
  const gate = canDrill(state, now, deps.tz, bypassFor(deps, state.id));
  if (!gate.ok) return ctx.say(gate.reason === "busy" ? "We're already on a drill call. I'll text the recap when it ends." : gate.reason === "hours" ? `I only call between ${DRILL.firstHour}am and ${DRILL.lastHour - 12}pm. Say "quiz me" for a text quiz now.` : "That's today's voice drill done. Say \"quiz me\" for a text quiz, or CALL again tomorrow.", "drill");
  const topicId = pickTopic(state, now, deps.tz, wanted);
  const exam = topicId && state.exams.find((e) => e.topicIds.includes(topicId));
  if (!topicId || !exam) return ctx.say("I don't see an exam coming up to drill for. Send me your syllabus as a PDF first.", "drill");

  const { question, keyPoints } = await buildDrill(deps.llm, state, topicId);
  const name = nameOf(state, topicId);
  await ctx.say(`Calling you now from ${pretty(deps.opts.voiceNumber)}: a 3-minute drill on ${name}.`, "drill");
  let callId: string;
  try {
    ({ callId } = await deps.caller.placeCall({
      to: state.id,
      variables: { agent_name: state.agentName ?? "Syl", topic: name, exam: exam.name, question, key_points: keyPoints.join("; ") },
    }));
  } catch {
    return ctx.say("I couldn't place the call just now. Text CALL to try again, or say \"quiz me\" for a text quiz.", "drill");
  }
  (state.drills ??= []).push({ id: `drill_${state.drills.length + 1}`, topicId, question, keyPoints, status: "calling", callId, startedAt: now.toISOString(), masteryBefore: state.mastery[topicId] ?? 0.5 });
  await ctx.commit();
}

export interface Graded { covered: number[]; feedback: string }

/** Judges which key points the student explained. Model first; a keyword match if the model is slow or unusable. */
export async function gradeDrill(llm: LLM, d: Drill, status: CallStatus): Promise<Graded> {
  const said = studentSpeech(status.transcript);
  const raw = await withTimeout(llm.extractJson("grade_drill", {
    system: rules("voice-drill-grader"),
    user: `Question: ${d.question}\nKey points:\n${d.keyPoints.map((k, i) => `${i}. ${k}`).join("\n")}\n\nTranscript:\n${(status.transcript ?? []).map((l) => `${l.role === "user" ? "Student" : "Agent"}: ${l.text}`).join("\n")}`,
    attachments: [], toolName: "record_grade", schema: GRADE_SCHEMA,
  }), 20_000);
  const ok = validateGrade(raw, d.keyPoints.length);
  if (ok) return ok;
  const covered = keywordGrade(d.keyPoints, said);
  const missed = d.keyPoints.filter((_, i) => !covered.includes(i));
  return { covered, feedback: missed.length ? `Good effort. Next time, cover: ${missed[0]}.` : "You covered every key point." };
}

/** Records how a finished (or failed) call went and texts the recap. `graded` is computed outside the lock. */
export async function finishDrill(ctx: Ctx, drillId: string, status: CallStatus, graded?: Graded): Promise<void> {
  const { state, deps } = ctx;
  const d = state.drills?.find((x) => x.id === drillId);
  if (!d || d.status !== "calling") return;
  d.endedAt = deps.clock.now().toISOString();
  d.durationSecs = status.durationSecs;
  const said = studentSpeech(status.transcript);
  if (status.state === "failed" || !status.answered || !said) {
    d.status = status.state === "failed" && status.answered !== false ? "failed" : "missed";
    return ctx.say(d.status === "missed" ? "Missed you. Text CALL when you're free for the drill." : "The call didn't go through. Text CALL to try again.", "drill");
  }
  const g = graded ?? { covered: keywordGrade(d.keyPoints, said), feedback: "Thanks for the drill." };
  d.status = "done";
  d.covered = g.covered.map((i) => d.keyPoints[i]!);
  d.missed = d.keyPoints.filter((_, i) => !g.covered.includes(i));
  d.score = d.keyPoints.length ? g.covered.length / d.keyPoints.length : 0; // in code
  d.masteryBefore = state.mastery[d.topicId] ?? 0.5;
  d.masteryAfter = drillMastery(d.masteryBefore, d.score); // in code
  d.snippet = said.length > 160 ? `${said.slice(0, 157).trim()}…` : said;
  state.mastery[d.topicId] = d.masteryAfter;
  const link = await drillLink(ctx, d);
  if (link) { // the answer and the checklist live on the card; the line says what it is and the score, in code
    const line = `Drill recap: you covered ${g.covered.length} of ${d.keyPoints.length} key points.`;
    await ctx.say(`${line} ${g.feedback}`, "drill");
    await sendLink(ctx, link);
    state.lastRecap = { kind: "drill", url: link, line, at: deps.clock.now().toISOString() };
    await ctx.commit(); // recorded after both texts went out
  }
  else await ctx.say(drillRecap(d, nameOf(state, d.topicId), g.feedback), "drill");
  await onMasteryChange(ctx, d.topicId); // still weak: the Planner may propose study time, which still needs a YES
}

/** A call that never finished. */
export const timedOut = (d: Drill, now: Date) => now.getTime() - new Date(d.startedAt).getTime() > DRILL.timeoutMs;
