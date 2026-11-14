// The card snapshot, as the agent publishes it. Mirrors packages/core/src/cards.ts (this app is deployed on its own,
// so it can't import the workspace package); the agent's tests check the shape it writes.
export type CardKind = "semester" | "week" | "round" | "drill";
interface Base { v: 1; kind: CardKind; agentName: string; tz: string; updatedAt: string; /** The line Syl texts this student from (its own public number), for the page's reply buttons. */ line?: string }
export interface SemesterCard extends Base {
  kind: "semester"; course: string; readAt?: string;
  items: { name: string; dateISO?: string; weight: number; topics?: string; done: boolean; isExam: boolean; focus: boolean }[];
  ask?: string; changes: string[];
}
export interface WeekCard extends Base {
  kind: "week"; status: "pending" | "approved" | "declined"; label: string; startISO: string; endISO: string;
  busy: { startISO: string; endISO: string; title: string }[]; due: { name: string; dateISO: string; weight: number }[];
  why: { strong: string; rest: string }[]; calendarUrl?: string;
}
export interface RoundCard extends Base {
  kind: "round"; total: number; right: number;
  questions: { prompt: string; firstTry: boolean; chose?: string; correct: string; explanation: string; topic: string }[];
  mastery: { topic: string; before: number; after: number }[]; minutes?: number;
}
export interface DrillCard extends Base {
  kind: "drill"; topic: string; question: string; durationSecs?: number; covered: string[]; missed: string[];
  snippet?: string; answer: string; before?: number; after?: number;
}
export type Card = SemesterCard | WeekCard | RoundCard | DrillCard;

const ID = /^[A-Za-z0-9]{20,48}$/;

/** Reads a card from the public Blob store. Unknown or malformed ids are simply not found. */
export async function loadCard(id: string): Promise<Card | null> {
  const base = process.env.CARDS_BLOB_BASE;
  if (!base || !ID.test(id)) return null;
  try {
    const res = await fetch(`${base}/cards/${id}.json`, { cache: "no-store" });
    if (!res.ok) return null;
    const c = (await res.json()) as Card;
    return c && c.v === 1 && ["semester", "week", "round", "drill"].includes(c.kind) ? c : null;
  } catch {
    return null;
  }
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
export function day(iso: string, tz: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) {
  return new Date(iso).toLocaleDateString("en-US", { ...opts, timeZone: tz });
}
export function time(iso: string, tz: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
}
export const minutesBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000);

/** The words iMessage shows under the preview. */
export function titleOf(c: Card): string {
  switch (c.kind) {
    case "semester": return "Your semester, on one page";
    case "week": return `${day(c.startISO, c.tz, { weekday: "long" })} ${time(c.startISO, c.tz)} · ${c.label}`;
    case "round": return `${c.right} of ${c.total} · round recap`;
    case "drill": return `Voice drill · you explained ${c.covered.length} of ${c.covered.length + c.missed.length}`;
  }
}
