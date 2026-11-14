// THE approve path: the only code that writes to the calendar.
// Reached from a matched YES text or the dashboard Approve button. Nothing else holds a CalendarWriter.
import { clock, dayDate } from "@syllabus-crew/core";
import type { CalendarWriter } from "@syllabus-crew/core";
import type { Ctx } from "./ctx.ts";

export const pendingProposal = (ctx: Ctx) => [...ctx.state.proposals].reverse().find((p) => p.status === "pending");

export async function approveProposal(ctx: Ctx, calendar: CalendarWriter, proposalId: string): Promise<void> {
  const p = ctx.state.proposals.find((x) => x.id === proposalId);
  if (!p || p.status !== "pending") return; // already handled: never write twice
  let created: { id: string; link?: string };
  try {
    created = await calendar.createEvent({ ...p.event, key: `${p.id}:${p.createdAt}`, owner: ctx.state.id });
  } catch {
    await ctx.say("I couldn't add that to your calendar just now. Reply YES to try again, or NO to skip it.", "approval");
    return;
  }
  // The event exists. Record that first, so a failed text can never turn into a false "couldn't add it".
  p.status = "approved";
  p.calendarEventId = created.id;
  p.calendarLink = created.link;
  await ctx.commit();
  const start = new Date(p.event.startISO), end = new Date(p.event.endISO), tz = ctx.deps.tz;
  await ctx.say(`Done. ${dayDate(start, tz)}, ${clock(start, tz)}-${clock(end, tz)}, ${p.label}.`, "approval");
}

export async function declineProposal(ctx: Ctx, proposalId: string): Promise<void> {
  const p = ctx.state.proposals.find((x) => x.id === proposalId);
  if (!p || p.status !== "pending") return;
  p.status = "declined";
  await ctx.say("No problem, I won't add it.", "approval");
}
