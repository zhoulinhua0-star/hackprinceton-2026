// The Planner has NO calendar. It can only create a proposal; approve.ts is the only code that writes a calendar.
// (A test asserts this file never mentions the calendar writer.)
import { dayDate, daysUntil, parseWhen, pickSlot, rankTopics, topicLabel } from "@syllabus-crew/core";
import type { Proposal } from "@syllabus-crew/core";
import { safeText, sleep, type Ctx } from "./ctx.ts";
import { resendWeek, sendLink, weekLink } from "./cards.ts";

const WEAK = 0.5;

/** "LIT 101: Antiquity" -> "LIT 101"; "Macro" stays "Macro". */
export function courseShort(name: string | undefined): string {
  const head = (name ?? "Study").split(":")[0]!.trim();
  return head.length > 28 ? `${head.slice(0, 27).trim()}…` : head;
}

/** "Tuesday 2pm" -> "Tuesday at 2pm", so the shared time parser sees the time. */
const withAt = (t: string) => t.replace(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i, (m, x, i) => (/\bat\s*$/i.test(t.slice(0, i)) ? m : `at ${x}`));
const clockText = (iso: string, tz: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/**
 * The student asked for study time. The Planner picks the topic (one they named, else the most urgent weak one) and the
 * slot (the time they gave, else the next free afternoon), then proposes it. It still only proposes: YES is what books it.
 */
export async function proposeOnRequest(ctx: Ctx, text: string): Promise<void> {
  const { state, deps } = ctx;
  const now = deps.clock.now();
  const open = state.proposals.find((p) => p.status === "pending");
  if (open) return ctx.say(`You already have one waiting: ${open.label}, ${dayDate(new Date(open.event.startISO), deps.tz)} ${clockText(open.event.startISO, deps.tz)}. Reply YES to book it, or NO to skip it.`, "proposal");
  if (!state.exams.length) return ctx.say("Send me your syllabus as a PDF first, so I know what to plan around.", "proposal");

  const lower = text.toLowerCase();
  const named = state.topics.find((t) => lower.includes(t.short.toLowerCase()) || lower.includes(t.name.toLowerCase()));
  const upcoming = (id: string) => state.exams.some((e) => e.topicIds.includes(id) && daysUntil(e.date, now, deps.tz) >= 0);
  const topicId = named?.id ?? rankTopics(state, now, deps.tz).map((r) => r.topicId).find(upcoming);
  const topic = state.topics.find((t) => t.id === topicId);
  const exam = topic && state.exams.find((e) => e.topicIds.includes(topic.id));
  if (!topic || !exam || daysUntil(exam.date, now, deps.tz) < 0) return ctx.say("I don't see an exam coming up to plan for.", "proposal");

  const minutes = /\b(an? |1 )hour\b/i.test(text) ? 60 : 30;
  const asked = parseWhen(withAt(text), now, deps.tz);
  const slot = asked && asked.getTime() > now.getTime()
    ? { startISO: asked.toISOString(), endISO: new Date(asked.getTime() + minutes * 60_000).toISOString() }
    : pickSlot(now, exam.date, state.busy, deps.tz, { preferWeekday: state.preferredWeekday, minutes });
  if (!slot) return ctx.say(`I couldn't find a free slot before ${exam.name}. Tell me a day and time, like "Tuesday at 4pm".`, "proposal");

  const name = topic.short === topic.name ? topicLabel(topic.name) : topic.short;
  const when = `${dayDate(new Date(slot.startISO), deps.tz)}, ${clockText(slot.startISO, deps.tz)}-${clockText(slot.endISO, deps.tz)}`;
  const proposal: Proposal = {
    id: `prop_${state.proposals.length + 1}`, status: "pending", topicId: topic.id, label: `${name} review`,
    text: `How about ${when}: ${minutes} minutes of ${name} review before ${exam.name} (${Math.round(exam.weight * 100)}%)? Reply YES to book it, or NO.`,
    event: { title: `${courseShort(state.courses.find((c) => c.id === exam.courseId)?.name)}: ${name} review`, ...slot },
    createdAt: now.toISOString(),
  };
  state.proposals.push(proposal); // createProposal, as always: nothing is booked until YES
  try { await ctx.say(proposal.text, "proposal"); } catch (e) { state.proposals = state.proposals.filter((p) => p.id !== proposal.id); throw e; }
  await sendLink(ctx, await weekLink(ctx, proposal)); // the week, with the block in it
}

/** "make it Wednesday at 5pm" while a proposal is waiting: move it and ask again. Returns false if the text isn't a new time. */
export async function moveProposal(ctx: Ctx, text: string): Promise<boolean> {
  const { state, deps } = ctx;
  const p = state.proposals.find((x) => x.status === "pending");
  if (!p || text.length > 80) return false;
  const at = parseWhen(withAt(text), deps.clock.now(), deps.tz);
  if (!at || at.getTime() <= deps.clock.now().getTime()) return false;
  const len = new Date(p.event.endISO).getTime() - new Date(p.event.startISO).getTime();
  p.event = { ...p.event, startISO: at.toISOString(), endISO: new Date(at.getTime() + len).toISOString() };
  const when = `${dayDate(at, deps.tz)}, ${clockText(p.event.startISO, deps.tz)}-${clockText(p.event.endISO, deps.tz)}`;
  p.text = `Moved: ${when}, ${p.label}. Reply YES to book it, or NO.`;
  await ctx.say(p.text, "proposal");
  await resendWeek(ctx, p); // a fresh picture with the new time
  return true;
}

export async function onMasteryChange(ctx: Ctx, topicId: string): Promise<void> {
  const { state, deps } = ctx;
  if (!state.openedByStudent) return;
  const mastery = state.mastery[topicId] ?? 0.5;
  if (mastery >= WEAK) return;
  if (state.proposals.some((p) => p.status === "pending")) return; // one open proposal at a time, so YES/NO is never ambiguous
  if (state.proposals.some((p) => p.topicId === topicId && p.status !== "declined")) return; // one proposal per topic
  // Never mid-round: inside a round the proposal waits for the recap. (A single question may still prompt one;
  // after YES/NO the open question comes straight back, see tutor.followUp.)
  if (state.session) return;
  // A NO stands for a day: the same topic is not proposed again right away.
  const now0 = deps.clock.now().getTime();
  if (state.proposals.some((p) => p.topicId === topicId && p.status === "declined" && now0 - new Date(p.createdAt).getTime() < 24 * 3_600_000)) return;

  const exam = state.exams.find((e) => e.topicIds.includes(topicId));
  const topic = state.topics.find((t) => t.id === topicId);
  if (!exam || !topic) return;
  const now = deps.clock.now();
  const slot = pickSlot(now, exam.date, state.busy, deps.tz, { preferWeekday: state.preferredWeekday });
  if (!slot) return;

  const name = topic.short === topic.name ? topicLabel(topic.name) : topic.short; // real readings get a short readable name; the demo's "chapter 5" stays
  const day = dayDate(new Date(slot.startISO), deps.tz);
  const pct = Math.round(exam.weight * 100);
  const template = `${exam.name} is ${pct}% and ${name} is your weak spot. Want me to add 30 minutes of review on ${day}? Reply YES or NO.`;
  const text = !deps.opts.llmProposals ? template : await safeText(
    deps, "proposal", "planner",
    `Facts: ${exam.name} is ${pct}% of the grade, in ${daysUntil(exam.date, now, deps.tz)} days. ${topic.short} mastery is ${Math.round(mastery * 100)}%. Proposed: 30 minutes of review on ${day}.`,
    template, (t) => /reply yes or no\.?$/i.test(t) && t.includes(day) && t.includes(`${pct}%`),
  );

  const proposal: Proposal = {
    id: `prop_${state.proposals.length + 1}`, status: "pending", topicId, label: `${name} review`, text,
    event: { title: `${courseShort(state.courses.find((c) => c.id === exam.courseId)?.name)}: ${name} review`, ...slot },
    createdAt: now.toISOString(),
  };
  state.proposals.push(proposal); // createProposal: the only thing the Planner can do
  await ctx.commit(); // the dashboard card appears now
  await sleep(deps.opts.proposalDelayMs);
  try {
    await ctx.say(text, "proposal");
  } catch (e) {
    state.proposals = state.proposals.filter((p) => p.id !== proposal.id); // never leave a proposal the student wasn't told about
    await ctx.commit();
    throw e;
  }
  await sendLink(ctx, await weekLink(ctx, proposal));
}

