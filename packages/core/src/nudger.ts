// The Nudger's policy, all in code: whether to nudge, which kind, and why not. The model never decides this.
import { inQuietHours, localDay, localHour, priority, daysUntil } from "./logic.ts";
import type { Choice, StudentState } from "./types.ts";

export const NUDGE = { perDay: 3, minGapHours: 4, windowStart: 9, windowEnd: 20, activeChatMinutes: 30, ignoredAfterHours: 12, backoffAfter: 2, offerHours: 6 } as const;

export interface NudgeCandidate { kind: "mastery" | "quiz" | "deadline"; key: string; examName: string; days: number; weight: number; topicId?: string; mastery?: number; score: number }
export type NudgeDecision = { send: false; reason: string } | { send: true; candidate: NudgeCandidate };

/** How far ahead an assessment is worth mentioning: a 30% paper a week out, a 2% quiz only the night before. */
export const windowDays = (weight: number) => (weight >= 0.25 ? 7 : weight >= 0.1 ? 4 : weight >= 0.05 ? 2 : 1);

export const isMuted = (s: StudentState, now: Date) => !!s.prefs?.mutedUntil && new Date(s.prefs.mutedUntil).getTime() > now.getTime();

/** A nudge is ignored if the student sent nothing in the hours after it. */
export function ignoredStreak(s: StudentState, now: Date): number {
  const sent = [...(s.nudges ?? [])].filter((n) => n.kind !== "scout").reverse();
  const inbound = s.messages.filter((m) => m.dir === "in").map((m) => new Date(m.at).getTime());
  let streak = 0;
  for (const n of sent) {
    const t = new Date(n.at).getTime(), end = t + NUDGE.ignoredAfterHours * 3_600_000;
    if (inbound.some((i) => i > t && i <= end)) break;
    if (now.getTime() < end && streak === 0) continue; // too recent to call ignored yet
    streak++;
  }
  return streak;
}

/** `ignoreWindow` (a forced demo run) considers anything upcoming, however far away. */
export function candidates(s: StudentState, now: Date, tz: string, o: { ignoreWindow?: boolean } = {}): NudgeCandidate[] {
  const day = localDay(now, tz), done = new Set((s.nudges ?? []).map((n) => n.key));
  const out: NudgeCandidate[] = [];
  const mastery = (t: string) => s.mastery[t] ?? 0.5;
  for (const e of s.exams) {
    const days = daysUntil(e.date, now, tz);
    if (days < 0 || (!o.ignoreWindow && days > windowDays(e.weight)) || e.weight < 0.01) continue;
    const withQs = e.topicIds.filter((t) => s.questions.some((q) => q.topicId === t));
    const weakest = [...withQs].sort((a, b) => mastery(a) - mastery(b))[0];
    const base = { examName: e.name, days, weight: e.weight };
    if (weakest && mastery(weakest) < 0.6) out.push({ ...base, kind: "mastery", key: `mastery:${e.id}:${day}`, topicId: weakest, mastery: mastery(weakest), score: priority(e.weight, mastery(weakest), days) });
    else if (weakest && days >= 2) out.push({ ...base, kind: "quiz", key: `quiz:${e.id}:${day}`, topicId: weakest, mastery: mastery(weakest), score: priority(e.weight, mastery(weakest), days) });
    else if (days <= 1 || (o.ignoreWindow && !weakest)) out.push({ ...base, kind: "deadline", key: `deadline:${e.id}:${day}`, score: priority(e.weight, 0.5, days) });
  }
  for (const d of s.deadlines ?? []) { // small items: one light reminder the evening before
    const days = daysUntil(d.date, now, tz);
    if (days === 1 && d.weight < 0.05 && !s.exams.some((e) => e.date === d.date && e.name === d.name)) out.push({ kind: "deadline", key: `deadline:${d.name}:${day}`, examName: d.name, days, weight: d.weight, score: priority(Math.max(d.weight, 0.01), 0.5, days) });
  }
  return out.filter((c) => !done.has(c.key)).sort((a, b) => b.score - a.score);
}

/** The rules, in order. `force` (a demo control) skips the timing rules, never the "never cold-text" and "one thing at a time" ones. */
export function decideNudge(s: StudentState, now: Date, tz: string, o: { force?: boolean } = {}): NudgeDecision {
  const no = (reason: string): NudgeDecision => ({ send: false, reason });
  if (!s.openedByStudent || !s.route) return no("student has not texted the line");
  if (isMuted(s, now) && !o.force) return no("muted by the student");
  if (s.pendingQuiz || s.pendingAsk || s.pendingOffer || s.proposals.some((p) => p.status === "pending")) return no("something is already waiting on the student");
  if (!o.force) {
    if (inQuietHours(now, tz)) return no("quiet hours");
    const h = localHour(now, tz);
    if (h < NUDGE.windowStart || h >= NUDGE.windowEnd) return no("outside the 9am-8pm window");
    const today = localDay(now, tz);
    if (((s.counters.day === today ? s.counters.nudges : 0)) >= NUDGE.perDay) return no("daily limit reached");
    const last = (s.nudges ?? []).at(-1);
    if (last && now.getTime() - new Date(last.at).getTime() < NUDGE.minGapHours * 3_600_000) return no("too soon after the last nudge");
    const lastIn = [...s.messages].reverse().find((m) => m.dir === "in");
    if (lastIn && now.getTime() - new Date(lastIn.at).getTime() < NUDGE.activeChatMinutes * 60_000) return no("the student is chatting right now");
  }
  const cs = candidates(s, now, tz, { ignoreWindow: o.force });
  if (!cs.length) return no("nothing worth a nudge");
  // Imminent high-stakes deadlines first; otherwise a quiz offer on a weak topic beats a plain reminder; otherwise the highest priority.
  const top = cs.find((c) => c.days <= 1 && c.weight >= 0.1) ?? cs.find((c) => c.kind === "mastery") ?? cs[0]!;
  if (!o.force && ignoredStreak(s, now) >= NUDGE.backoffAfter && !(top.days <= 1 && top.weight >= 0.2)) return no("backing off: the last two went unanswered");
  return { send: true, candidate: top };
}

/** The morning quiz: once a day, mid-morning, only if they haven't practiced yet and haven't been ignoring us. */
export function decideMorningQuiz(s: StudentState, now: Date, tz: string, o: { force?: boolean } = {}): { send: boolean; reason: string } {
  const no = (reason: string) => ({ send: false, reason });
  if (!s.openedByStudent || !s.route) return no("student has not texted the line");
  const unasked = s.questions.filter((q) => s.unlockedQuestionIds.includes(q.id) && !s.askedQuestionIds.includes(q.id));
  if (!unasked.length) return no("no unasked questions");
  if (s.pendingQuiz || s.session || s.pendingAsk) return no("a question or round is already open");
  if (o.force) return { send: true, reason: "forced" };
  if (isMuted(s, now)) return no("muted by the student");
  const h = localHour(now, tz);
  if (h < 9 || h >= 12) return no("not morning");
  const today = localDay(now, tz);
  if ((s.nudges ?? []).some((n) => n.kind === "morning" && localDay(new Date(n.at), tz) === today)) return no("already sent today's morning quiz");
  if (s.counters.day === today && s.counters.quizzes > 0) return no("already practiced today");
  if (ignoredStreak(s, now) >= NUDGE.backoffAfter) return no("backing off: the last two went unanswered");
  return { send: true, reason: "morning" };
}

export type { Choice };
