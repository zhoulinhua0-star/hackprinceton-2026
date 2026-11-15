// "When's my next essay?": answered in code from the syllabus's dated items, never by the model guessing.
import type { StudentState } from "./types.ts";

/** A question about what's due or coming up. */
export function isDueQuestion(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(due|deadlines?|coming up|what'?s next)\b/.test(t)
    || /\bnext\s+(assignment|essay|paper|exam|test|quiz|project|midterm|final|presentation|response|homework|problem set|pset)s?\b/.test(t)
    || /\bwhen(?:'?s| is| are| do)\b.*\b(assignment|essay|paper|exam|test|project|midterm|final|presentation|response|homework|problem set|pset)s?\b/.test(t);
}

const KINDS: [RegExp, RegExp][] = [
  [/\b(essay|paper|writing)s?\b/, /essay|paper|writing|response/i],
  [/\b(midterm)s?\b/, /midterm/i],
  [/\bfinal\b/, /final/i],
  [/\b(exam|test)s?\b/, /exam|test|midterm|final/i],
  [/\bquiz(zes)?\b/, /quiz/i],
  [/\bproject\b/, /project/i],
  [/\bpresentation\b/, /presentation/i],
  [/\b(homework|problem set|pset)s?\b/, /homework|problem set|pset/i],
];

/** Upcoming dated items, soonest first. Exams and every other graded item with a date. */
export function upcomingItems(state: StudentState, now: Date): { name: string; date: string; weight: number }[] {
  const all = [...(state.deadlines ?? []), ...state.exams.map((e) => ({ name: e.name, date: e.date, weight: e.weight }))];
  const seen = new Set<string>();
  return all
    .filter((d) => new Date(d.date).getTime() >= now.getTime() - 12 * 3_600_000) // today's still counts
    .filter((d) => (seen.has(d.name) ? false : (seen.add(d.name), true)))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The reply to a due-date question: the next matching item, then up to two more after it. */
export function dueAnswer(state: StudentState, text: string, now: Date, tz: string): string {
  if (!state.parsed || !state.courses.length) return "Send me your syllabus as a PDF and I'll keep track of what's due.";
  const items = upcomingItems(state, now);
  const kind = KINDS.find(([ask]) => ask.test(text.toLowerCase()));
  const pick = kind ? items.filter((i) => kind[1].test(i.name)) : items;
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz });
  const line = (i: { name: string; date: string; weight: number }) => `${i.name}: ${day(i.date)}${i.weight > 0 ? ` (${Math.round(i.weight * 100)}%)` : ""}`;
  if (!pick.length) {
    if (kind && items.length) return `I don't see one of those with a date on your syllabus. Next up is ${line(items[0]!)}.`;
    return "Nothing with a date is coming up on your syllabus.";
  }
  const [first, ...rest] = pick;
  const more = rest.slice(0, 2);
  return `Next up: ${line(first!)}.${more.length ? `\n\nAfter that:\n${more.map((i) => `• ${line(i)}`).join("\n")}` : ""}`;
}

/** What the model sees about the semester in free chat, so it never claims it has no syllabus. */
export function syllabusFacts(state: StudentState, now: Date, tz: string): string {
  if (!state.parsed || !state.courses.length) return "";
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz });
  const items = upcomingItems(state, now).slice(0, 8).map((i) => `- ${i.name}, ${day(i.date)}${i.weight > 0 ? `, ${Math.round(i.weight * 100)}% of the grade` : ""}`);
  const topics = state.topics.slice(0, 12).map((t) => t.name).join("; ");
  return `\n\nThe student's syllabus (${state.courses.map((c) => c.name).join(", ")}). Coming up:\n${items.join("\n") || "- nothing dated"}${topics ? `\nTopics and readings: ${topics}` : ""}\nUse these facts. Never say you don't have their syllabus or deadlines.`;
}
