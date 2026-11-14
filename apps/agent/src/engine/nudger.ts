// The scheduler's work for one student: deliver reminders, send the morning quiz, make at most one nudge.
// Every decision comes from the policy in core; this file only carries it out and keeps the record.
import { NUDGE, decideMorningQuiz, decideNudge, inQuietHours, localDay, rollCounters, topicLabel } from "@syllabus-crew/core";
import type { NudgeCandidate, Vibe } from "@syllabus-crew/core";
import type { Ctx } from "./ctx.ts";
import { sendQuiz } from "./tutor.ts";

export interface TickOptions { force?: boolean; dryRun?: boolean }
export interface TickAction { kind: "reminder" | "morning_quiz" | "nudge" | "skip"; sent: boolean; text?: string; reason?: string }
export interface TickResult { actions: TickAction[] }

const pct = (w: number) => `${Math.round(w * 100)}%`;
const dueIn = (days: number) => (days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`);

export function nudgeText(c: NudgeCandidate, topicName?: string, vibe?: Vibe): string {
  const head = `${c.examName} is due ${dueIn(c.days)}${c.weight >= 0.01 ? ` (${pct(c.weight)} of your grade)` : ""}`;
  const at = `${Math.round((c.mastery ?? 0.5) * 100)}% on ${topicLabel(topicName ?? "this topic")}`;
  if (vibe === "strict") {
    if (c.kind === "deadline") return `${head}. Start now.`;
    if (c.kind === "mastery") return `${head}. You're at ${at}. That's not enough. ${NUDGE_ROUND} questions now? Reply YES or NO.`;
    return `${head}. ${NUDGE_ROUND} questions now, no excuses? Reply YES or NO.`;
  }
  if (vibe === "hype") {
    if (c.kind === "deadline") return `Heads up! ${head}. You've got this.`;
    if (c.kind === "mastery") return `${head}, and you're at ${at}. Let's fix that! Quick ${NUDGE_ROUND}-question round? Reply YES or NO.`;
    return `${head}. Let's stay ahead! Quick ${NUDGE_ROUND}-question round? Reply YES or NO.`;
  }
  if (c.kind === "deadline") return `Heads up: ${head}.`;
  if (c.kind === "mastery") return `${head}, and you're at ${Math.round((c.mastery ?? 0.5) * 100)}% on ${topicLabel(topicName ?? "this topic")}. Want a quick ${NUDGE_ROUND}-question round on it? Reply YES or NO.`;
  return `${head}. Want a quick ${NUDGE_ROUND}-question round to stay ahead? Reply YES or NO.`;
}
export const NUDGE_ROUND = 3;

export async function tick(ctx: Ctx, o: TickOptions = {}): Promise<TickResult> {
  const { state, deps } = ctx;
  const now = deps.clock.now(), tz = deps.tz, actions: TickAction[] = [];
  state.reminders ??= []; state.nudges ??= [];
  if (!state.openedByStudent || !state.route) return { actions: [{ kind: "skip", sent: false, reason: "student has not texted the line" }] };
  if (state.pendingOffer && new Date(state.pendingOffer.expiresAt).getTime() <= now.getTime()) state.pendingOffer = undefined;

  // 1. Reminders the student asked for: always delivered, never capped or muted. Quiet hours only delay them.
  const due = state.reminders.filter((r) => r.status === "pending" && new Date(r.dueISO).getTime() <= now.getTime());
  if (due.length && inQuietHours(now, tz)) actions.push({ kind: "skip", sent: false, reason: "reminder waits until 8am (quiet hours)" });
  else for (const r of due) {
    const late = now.getTime() - new Date(r.dueISO).getTime() > 3_600_000;
    const text = late ? `Sorry, this is late. You asked me to remind you to ${r.text}.` : `Reminder: ${r.text}.`;
    if (o.dryRun) { actions.push({ kind: "reminder", sent: false, text }); continue; }
    r.status = "sent"; r.sentAt = now.toISOString();
    await ctx.say(text, "reminder");
    actions.push({ kind: "reminder", sent: true, text });
  }
  if (actions.some((a) => a.sent)) return { actions }; // one proactive text per tick

  // 2. The morning quiz. (A forced run is the Nudger demo control: it shows the nudge, not the morning quiz.)
  const m = o.force ? { send: false, reason: "skipped on a forced run" } : decideMorningQuiz(state, now, tz);
  if (m.send) {
    if (o.dryRun) return { actions: [...actions, { kind: "morning_quiz", sent: false, reason: m.reason }] };
    state.nudges.push({ at: now.toISOString(), kind: "morning", key: `morning:${localDay(now, tz)}` });
    if (await sendQuiz(ctx, { solicited: !!o.force, lead: "Morning! " })) return { actions: [...actions, { kind: "morning_quiz", sent: true }] };
    state.nudges.pop(); // it was not allowed after all (cap or quiet hours): leave no trace
  } else actions.push({ kind: "skip", sent: false, reason: `morning quiz: ${m.reason}` });

  // 3. At most one nudge.
  const d = decideNudge(state, now, tz, { force: o.force });
  if (!d.send) return { actions: [...actions, { kind: "skip", sent: false, reason: `nudge: ${d.reason}` }] };
  const c = d.candidate;
  const text = nudgeText(c, state.topics.find((t) => t.id === c.topicId)?.name, state.vibe);
  if (o.dryRun) return { actions: [...actions, { kind: "nudge", sent: false, text, reason: `${c.kind}, score ${c.score.toFixed(3)}` }] };
  state.nudges.push({ at: now.toISOString(), kind: c.kind, key: c.key });
  state.counters = rollCounters(state.counters, now, tz);
  state.counters.nudges += 1;
  if (c.kind !== "deadline") state.pendingOffer = { kind: "round", topicId: c.topicId, expiresAt: new Date(now.getTime() + NUDGE.offerHours * 3_600_000).toISOString() };
  await ctx.say(text, "nudge"); // if the send fails, none of the bookkeeping above is saved
  return { actions: [...actions, { kind: "nudge", sent: true, text }] };
}
