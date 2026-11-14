// Tap-to-open cards (DECISIONS #106): one short line in the thread, one link to the detail.
// Publishing never throws and never blocks a reply: if the card store is missing or down, the text goes out alone.
import { randomBytes } from "node:crypto";
import { cardId, drillCard, roundCard, semesterCard, weekCard, DEFAULT_AGENT_NAME, type Card, type Drill, type Proposal } from "@syllabus-crew/core";
import type { Ctx } from "./ctx.ts";

async function publish(ctx: Ctx, id: string, card: Card): Promise<string | null> {
  const store = ctx.deps.cards;
  if (!store) return null;
  try {
    return await store.put(id, card);
  } catch (e) {
    console.error(`[cards] not published: ${(e as Error).message}`);
    return null;
  }
}

const newId = () => cardId(randomBytes(24));
const now = (ctx: Ctx) => ctx.deps.clock.now();
export const cardsOn = (ctx: Ctx) => !!ctx.deps.cards;

/** The semester card. Publishes (or republishes under the same link) and returns the URL. */
export async function semesterLink(ctx: Ctx): Promise<string | null> {
  if (!cardsOn(ctx)) return null;
  const { state, deps } = ctx;
  const id = state.cards?.semester ?? newId();
  const url = await publish(ctx, id, semesterCard(state, deps.tz, now(ctx), DEFAULT_AGENT_NAME));
  if (url) state.cards = { ...state.cards, semester: id };
  return url;
}

/** After a fix (an answered question, something Scout found): update the card already sent. Sends nothing. */
export async function refreshSemester(ctx: Ctx): Promise<void> {
  if (ctx.state.cards?.semester) await semesterLink(ctx);
}

/** The week card for a proposal. One link per proposal: moving or booking it updates the same page. */
export async function weekLink(ctx: Ctx, p: Proposal): Promise<string | null> {
  if (!cardsOn(ctx)) return null;
  const { state, deps } = ctx;
  const id = state.cards?.weeks?.[p.id] ?? newId();
  const url = await publish(ctx, id, weekCard(state, p, deps.tz, now(ctx), DEFAULT_AGENT_NAME));
  if (url) state.cards = { ...state.cards, weeks: { ...state.cards?.weeks, [p.id]: id } };
  return url;
}

export async function refreshWeek(ctx: Ctx, p: Proposal): Promise<void> {
  if (ctx.state.cards?.weeks?.[p.id]) await weekLink(ctx, p);
}

/**
 * After YES or a move: update the page and send the link again with a version tag. iMessage draws a link's picture
 * once and keeps it, so without a new URL the thread would still show "Proposed" (or the old time).
 */
export async function resendWeek(ctx: Ctx, p: Proposal): Promise<void> {
  const url = await weekLink(ctx, p);
  if (!url) return;
  const v = p.status === "approved" ? "booked" : new Date(p.event.startISO).getTime().toString(36);
  await ctx.say(`${url}?v=${v}`, "card");
}

/** A finished round. A new link each time. */
export async function roundLink(ctx: Ctx, s: NonNullable<Ctx["state"]["session"]>): Promise<string | null> {
  if (!cardsOn(ctx) || !s.log?.length) return null;
  return publish(ctx, newId(), roundCard(ctx.state, s.log, s.start ?? {}, ctx.deps.tz, now(ctx), s.startedAt, DEFAULT_AGENT_NAME));
}

/** A graded voice drill. The full answer lives on the card, so the text can stay short. */
export async function drillLink(ctx: Ctx, d: Drill): Promise<string | null> {
  if (!cardsOn(ctx)) return null;
  const answer = d.keyPoints.map((k) => k.replace(/[.\s]+$/, "")).join(". ") + ".";
  return publish(ctx, newId(), drillCard(ctx.state, d, answer, ctx.deps.tz, now(ctx), DEFAULT_AGENT_NAME));
}

/** Sends the link as its own text, so iMessage draws it as a card. */
export async function sendLink(ctx: Ctx, url: string | null): Promise<void> {
  if (url) await ctx.say(url, "card");
}
