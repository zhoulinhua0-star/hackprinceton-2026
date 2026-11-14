// Tap-to-open cards (DECISIONS #106). Syl sends one short line plus one link; the link opens a read-only page with
// the detail. These builders turn state into the snapshot the hosted page renders. Pure: the numbers are computed
// here, in code; the page only draws them. No phone number, no student name, nothing the page doesn't show.
import type { Choice, Drill, Proposal, StudentState } from "./types.ts";
import type { Missing } from "./syllabus.ts";
import { topicLabel } from "./logic.ts";

export type CardKind = "semester" | "week" | "round" | "drill";

interface Base { v: 1; kind: CardKind; agentName: string; tz: string; updatedAt: string; /** The line Syl texts this student from (its own public number), for the page's reply buttons. */ line?: string }

export interface SemesterCard extends Base {
  kind: "semester";
  course: string;
  readAt?: string;
  /** Graded items with a weight, biggest first. `focus` = the exam the student's worry points at. */
  items: { name: string; dateISO?: string; weight: number; topics?: string; done: boolean; isExam: boolean; focus: boolean }[];
  /** The one thing still missing, as a question. */
  ask?: string;
  /** What Scout noticed, newest first. */
  changes: string[];
}

export interface WeekCard extends Base {
  kind: "week";
  status: "pending" | "approved" | "declined";
  label: string;
  startISO: string;
  endISO: string;
  /** The rest of that week, so the block is seen in context. */
  busy: { startISO: string; endISO: string; title: string }[];
  due: { name: string; dateISO: string; weight: number }[];
  /** Plain reasons, each a number the code computed. */
  why: { strong: string; rest: string }[];
  /** Once booked in Google Calendar: the event itself. Absent for the local stand-in, so there's never a dead button. */
  calendarUrl?: string;
}

export interface RoundCard extends Base {
  kind: "round";
  total: number;
  right: number;
  /** One entry per question, in order. `chose` is the first (wrong) answer. */
  questions: { prompt: string; firstTry: boolean; chose?: string; correct: string; explanation: string; topic: string }[];
  mastery: { topic: string; before: number; after: number }[];
  minutes?: number;
}

export interface DrillCard extends Base {
  kind: "drill";
  topic: string;
  question: string;
  durationSecs?: number;
  covered: string[];
  missed: string[];
  snippet?: string;
  answer: string;
  before?: number;
  after?: number;
}

export type Card = SemesterCard | WeekCard | RoundCard | DrillCard;

/** One question of a round, as the Tutor recorded it. */
export interface RoundLogEntry { questionId: string; firstTry: boolean; chose?: Choice | "unknown" }

const base = <K extends CardKind>(state: StudentState, kind: K, tz: string, now: Date, defaultName: string) =>
  ({ v: 1 as const, kind, agentName: state.agentName ?? defaultName, tz, updatedAt: now.toISOString() });

export function askText(m: Missing): string {
  if (m.kind === "termStart") return "When does the semester start?";
  if (m.kind === "date") return `When is ${m.assessment}?`;
  return `How much is ${m.assessment} worth?`;
}

/** The semester: every weighted item, the big ones first, with the student's worry marked. */
export function semesterCard(state: StudentState, tz: string, now: Date, defaultName = "Syl"): SemesterCard {
  const focus = (state.focusCourse ?? "").toLowerCase();
  const course = state.syllabus?.courseName ?? state.courses[0]?.name ?? "Your course";
  const examNames = new Set(state.exams.map((e) => e.name));
  const items: SemesterCard["items"] = state.exams.map((e) => ({
    name: e.name, dateISO: e.date, weight: e.weight, isExam: true, done: new Date(e.date).getTime() < now.getTime(),
    topics: e.topicIds.map((id) => state.topics.find((t) => t.id === id)?.short).filter(Boolean).join(", ") || undefined,
    focus: false,
  }));
  for (const d of state.deadlines ?? []) {
    if (examNames.has(d.name) || d.weight <= 0) continue;
    items.push({ name: d.name, dateISO: d.date, weight: d.weight, isExam: false, done: new Date(d.date).getTime() < now.getTime(), focus: false });
  }
  items.sort((a, b) => b.weight - a.weight);
  // The worry: an exam it names, else (any answer at all) the biggest exam still ahead.
  const upcoming = items.filter((i) => i.isExam && !i.done);
  const mark = upcoming.find((i) => focus && focus.includes(i.name.toLowerCase())) ?? (focus ? [...upcoming].sort((a, b) => b.weight - a.weight)[0] : undefined);
  if (mark) mark.focus = true;
  const changes = state.foundMaterialIds.map((id) => state.inbox.find((m) => m.id === id)).filter((m) => !!m).map((m) => `${m.sender} posted ${m.title}`).reverse();
  const readAt = state.parsed ? state.messages.find((m) => m.kind === "onboarding")?.at : undefined;
  return {
    ...base(state, "semester", tz, now, defaultName), course, ...(readAt ? { readAt } : {}),
    items: items.slice(0, 8), ...(state.pendingAsk ? { ask: askText(state.pendingAsk.missing) } : {}), changes,
  };
}

/** A proposed (or booked) study block, in its week. */
export function weekCard(state: StudentState, p: Proposal, tz: string, now: Date, defaultName = "Syl"): WeekCard {
  const start = new Date(p.event.startISO);
  const monday = new Date(start); monday.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7)); monday.setUTCHours(0, 0, 0, 0);
  const saturday = new Date(monday.getTime() + 5 * 86_400_000);
  const inWeek = (iso: string) => { const t = new Date(iso).getTime(); return t >= monday.getTime() && t < saturday.getTime(); };
  const topic = state.topics.find((t) => t.id === p.topicId);
  const exam = state.exams.filter((e) => e.topicIds.includes(p.topicId) && new Date(e.date).getTime() > now.getTime()).sort((a, b) => a.date.localeCompare(b.date))[0];
  const m = Math.round((state.mastery[p.topicId] ?? 0.5) * 100);
  const weakest = state.topics.every((t) => (state.mastery[t.id] ?? 0.5) >= (state.mastery[p.topicId] ?? 0.5));
  const why: WeekCard["why"] = [
    { strong: `${topic ? topicLabel(topic.name) : "This topic"} is at ${m}%`, rest: weakest ? " mastery, your weakest spot right now." : " mastery: worth another pass before the exam." },
    ...(exam ? [{ strong: `${exam.name} is worth ${Math.round(exam.weight * 100)}%`, rest: `, on ${new Date(exam.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz })}.` }] : []),
    { strong: "That time is free", rest: " on your calendar." },
  ];
  const due = [...state.exams.map((e) => ({ name: e.name, dateISO: e.date, weight: e.weight })), ...(state.deadlines ?? []).map((d) => ({ name: d.name, dateISO: d.date, weight: d.weight }))]
    .filter((d) => inWeek(d.dateISO)).filter((d, i, a) => a.findIndex((x) => x.name === d.name) === i);
  return {
    ...base(state, "week", tz, now, defaultName), status: p.status, label: p.label,
    startISO: p.event.startISO, endISO: p.event.endISO,
    busy: state.busy.filter((b) => inWeek(b.startISO)).map((b) => ({ startISO: b.startISO, endISO: b.endISO, title: "Busy" })),
    due, why, ...(p.status === "approved" && p.calendarLink && /^https:\/\/(www\.google\.com\/calendar|calendar\.google\.com)\//.test(p.calendarLink) ? { calendarUrl: p.calendarLink } : {}),
  };
}

/** One finished round. `start` is mastery when each topic entered the round. */
export function roundCard(state: StudentState, log: RoundLogEntry[], start: Record<string, number>, tz: string, now: Date, startedAt?: string, defaultName = "Syl"): RoundCard {
  const questions = log.flatMap((l) => {
    const q = state.questions.find((x) => x.id === l.questionId);
    if (!q) return [];
    const topic = state.topics.find((t) => t.id === q.topicId);
    const chose = l.firstTry ? undefined : l.chose === "unknown" ? "I don't know" : l.chose ? `${l.chose}) ${q.choices[l.chose]}` : undefined;
    return [{ prompt: q.prompt, firstTry: l.firstTry, correct: `${q.correct}) ${q.choices[q.correct]}`, explanation: q.explanation, topic: topic ? topicLabel(topic.name) : "", ...(chose ? { chose } : {}) }];
  });
  const mastery = Object.entries(start).map(([id, before]) => {
    const t = state.topics.find((x) => x.id === id);
    return { topic: t ? topicLabel(t.name) : id, before, after: state.mastery[id] ?? before };
  });
  const minutes = startedAt ? Math.max(1, Math.round((now.getTime() - new Date(startedAt).getTime()) / 60_000)) : undefined;
  return { ...base(state, "round", tz, now, defaultName), total: questions.length, right: questions.filter((q) => q.firstTry).length, questions, mastery, ...(minutes ? { minutes } : {}) };
}

/** A graded voice drill. `answer` is the full explanation (what the recap text used to spell out). */
export function drillCard(state: StudentState, d: Drill, answer: string, tz: string, now: Date, defaultName = "Syl"): DrillCard {
  const t = state.topics.find((x) => x.id === d.topicId);
  return {
    ...base(state, "drill", tz, now, defaultName), topic: t ? topicLabel(t.name) : "", question: d.question,
    ...(d.durationSecs ? { durationSecs: d.durationSecs } : {}), covered: d.covered ?? [], missed: d.missed ?? [],
    ...(d.snippet ? { snippet: d.snippet } : {}), answer,
    ...(d.masteryBefore !== undefined ? { before: d.masteryBefore } : {}), ...(d.masteryAfter !== undefined ? { after: d.masteryAfter } : {}),
  };
}

/** A card id: long and random, so the link can't be guessed. The caller supplies the randomness (core stays pure). */
export function cardId(randomBytes: Uint8Array): string {
  const abc = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes, (b) => abc[b % abc.length]).join("");
}
