// The Planner has NO calendar. It can only create a proposal; approve.ts is the only code that writes a calendar.
// (A test asserts this file never mentions the calendar writer.)
import { daysUntil, pickSlot, topicLabel, weekdayName } from "@syllabus-crew/core";
import type { Proposal } from "@syllabus-crew/core";
import { safeText, sleep, type Ctx } from "./ctx.ts";

const WEAK = 0.5;

/** "LIT 101: Antiquity" -> "LIT 101"; "Macro" stays "Macro". */
export function courseShort(name: string | undefined): string {
  const head = (name ?? "Study").split(":")[0]!.trim();
  return head.length > 28 ? `${head.slice(0, 27).trim()}…` : head;
}

export async function onMasteryChange(ctx: Ctx, topicId: string): Promise<void> {
  const { state, deps } = ctx;
  if (!state.openedByStudent) return;
  const mastery = state.mastery[topicId] ?? 0.5;
  if (mastery >= WEAK) return;
  if (state.proposals.some((p) => p.status === "pending")) return; // one open proposal at a time, so YES/NO is never ambiguous
  if (state.proposals.some((p) => p.topicId === topicId && p.status !== "declined")) return; // one proposal per topic

  const exam = state.exams.find((e) => e.topicIds.includes(topicId));
  const topic = state.topics.find((t) => t.id === topicId);
  if (!exam || !topic) return;
  const now = deps.clock.now();
  const slot = pickSlot(now, exam.date, state.busy, deps.tz, { preferWeekday: state.preferredWeekday });
  if (!slot) return;

  const name = topic.short === topic.name ? topicLabel(topic.name) : topic.short; // real readings get a short readable name; the demo's "chapter 5" stays
  const day = weekdayName(new Date(slot.startISO), deps.tz);
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
}

