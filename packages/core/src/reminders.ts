// "remind me Sunday to start the essay": parsed by code, never guessed by the model.
import { localDay, zoned } from "./logic.ts";
import { addDays } from "./syllabus.ts";

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const dow = (ymd: string) => new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10))).getUTCDay();

/** Time of day inside an expression: "at 5pm", "at 5:30 pm", "at 17:00". */
function timeOf(expr: string): { h: number; m: number } | null {
  const m = expr.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!m) return null;
  let h = +m[1]!; const min = m[2] ? +m[2] : 0; const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12; if (ap === "am" && h === 12) h = 0;
  return h > 23 || min > 59 ? null : { h, m: min };
}

/** "tomorrow", "Sunday", "next friday at 5pm", "in 2 days", "on Dec 3", "tonight". Null if it isn't a time. */
export function parseWhen(expr: string, now: Date, tz: string): Date | null {
  const e = expr.trim().toLowerCase().replace(/[.,!?]+$/g, "");
  const today = localDay(now, tz);
  const at = timeOf(e);
  const clock = at ?? { h: 9, m: 0 };
  const make = (ymd: string, h = clock.h, m = clock.m) => zoned(+ymd.slice(0, 4), +ymd.slice(5, 7), +ymd.slice(8, 10), h, m, tz);
  let r: RegExpMatchArray | null;
  if ((r = e.match(/\bin (\d+) (minute|hour)s?\b/))) return new Date(now.getTime() + +r[1]! * (r[2] === "hour" ? 3_600_000 : 60_000));
  if (/^tonight\b/.test(e)) return make(today, at?.h ?? 20, at?.m ?? 0);
  if (/^today\b/.test(e)) { const d = make(today); return d.getTime() > now.getTime() ? d : null; }
  if (/^tomorrow\b/.test(e)) return make(addDays(today, 1));
  if ((r = e.match(/\bin (\d+) (day|week)s?\b/))) return make(addDays(today, +r[1]! * (r[2] === "week" ? 7 : 1)));
  const wm = e.match(/\b(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)\b/);
  const wd = wm ? DAYS.findIndex((d) => d.startsWith(wm[1]!.slice(0, 3))) : -1;
  if (wd >= 0) {
    let ymd = today;
    for (let i = 0; i < 8; i++, ymd = addDays(today, i)) if (dow(ymd) === wd) { if (i === 0 && make(ymd).getTime() <= now.getTime() + 300_000) continue; break; }
    return make(ymd);
  }
  if ((r = e.match(/\b(?:on )?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* (\d{1,2})\b/))) {
    const mo = MONTHS.indexOf(r[1]!) + 1, d = +r[2]!;
    const ty = +today.slice(0, 4);
    const pick = [ty, ty + 1].map((y) => `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`).find((s) => s >= today && new Date(`${s}T00:00:00Z`).getUTCDate() === d);
    return pick ? make(pick) : null;
  }
  return null;
}

export type ReminderParse = { text: string; due: Date } | { error: "no_when" | "no_what" | "past" };

const WHEN_TAIL = /\s+((?:(?:on|this|next)\s+)?(?:(?:sun|mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?)(?:day)?s?\b.*|tomorrow\b.*|tonight\b.*|today\b.*|in \d+ (?:minute|hour|day|week)s?\b.*|(?:on )?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2}\b.*))$/i;

/** Null when the text isn't a reminder request. */
export function parseReminder(text: string, now: Date, tz: string): ReminderParse | null {
  const m = text.trim().match(/^(?:hey[, ]+)?(?:please\s+)?remind me\s+(.+)$/i);
  if (!m) return null;
  let body = m[1]!.trim();
  let what: string | undefined, when: Date | null = null;
  const lead = body.match(/^(.+?)\s+to\s+(.+)$/i); // "Sunday to start the essay"
  if (lead && (when = parseWhen(lead[1]!, now, tz))) what = lead[2]!;
  if (!what) {
    body = body.replace(/^to\s+/i, "");
    const tail = body.match(WHEN_TAIL); // "start the essay on Sunday"
    if (tail) { when = parseWhen(tail[1]!, now, tz); what = body.slice(0, tail.index).trim(); }
  }
  if (!what && !when) return { error: /\btoday\b/i.test(body) ? "past" : parseWhen(body, now, tz) ? "no_what" : "no_when" };
  if (!when) return { error: /\b(today)\b/i.test(body) ? "past" : "no_when" };
  what = (what ?? "").replace(/[.!?]+$/, "").trim();
  return what ? { text: what, due: when } : { error: "no_what" };
}

/** "tomorrow at 9:00 AM", "Sunday at 9:00 AM", "Dec 3 at 9:00 AM". */
export function formatWhen(due: Date, now: Date, tz: string): string {
  const time = due.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz });
  const days = Math.round((Date.UTC(+localDay(due, tz).slice(0, 4), +localDay(due, tz).slice(5, 7) - 1, +localDay(due, tz).slice(8, 10)) - Date.UTC(+localDay(now, tz).slice(0, 4), +localDay(now, tz).slice(5, 7) - 1, +localDay(now, tz).slice(8, 10))) / 86_400_000);
  const day = days === 0 ? "today" : days === 1 ? "tomorrow" : days < 7 ? due.toLocaleDateString("en-US", { weekday: "long", timeZone: tz }) : due.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz });
  return `${day} at ${time}`;
}
