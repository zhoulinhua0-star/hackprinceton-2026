import { test } from "node:test";
import assert from "node:assert/strict";
import { formatWhen, parseReminder, parseWhen } from "./reminders.ts";

const TZ = "America/New_York";
const NOW = new Date("2026-11-14T12:00:00-05:00"); // a Saturday, noon
const iso = (r: ReturnType<typeof parseReminder>) => (r && "due" in r ? r.due.toISOString() : r);

test("remind me <when> to <what>", () => {
  const r = parseReminder("remind me Sunday to start the essay", NOW, TZ)!;
  assert.deepEqual(r && "text" in r && r.text, "start the essay");
  assert.equal(iso(r), "2026-11-15T14:00:00.000Z"); // Sunday 9am New York
});

test("remind me to <what> <when>, with a time", () => {
  assert.equal(iso(parseReminder("Remind me to email my professor tomorrow at 5pm", NOW, TZ)), "2026-11-15T22:00:00.000Z");
  const r = parseReminder("remind me to submit the form on Dec 3.", NOW, TZ)!;
  assert.equal(iso(r), "2026-12-03T14:00:00.000Z");
  assert.equal(r && "text" in r && r.text, "submit the form");
});

test("relative and named times", () => {
  assert.equal(iso(parseReminder("remind me in 2 hours to eat", NOW, TZ)), "2026-11-14T19:00:00.000Z");
  assert.equal(iso(parseReminder("remind me tonight to study", NOW, TZ)), "2026-11-15T01:00:00.000Z");
  assert.equal(iso(parseReminder("remind me next friday to call mom", NOW, TZ)), "2026-11-20T14:00:00.000Z");
  assert.equal(iso(parseReminder("please remind me in 3 days to renew the book", NOW, TZ)), "2026-11-17T14:00:00.000Z");
  assert.equal(iso(parseReminder("remind me wed at 3:30pm to meet Sam", NOW, TZ)), "2026-11-18T20:30:00.000Z");
});

test("a weekday that is today means the next one once the time has passed", () => {
  assert.equal(iso(parseReminder("remind me Saturday to clean", NOW, TZ)), "2026-11-21T14:00:00.000Z"); // 9am today is gone
  assert.equal(iso(parseReminder("remind me Saturday at 5pm to clean", NOW, TZ)), "2026-11-14T22:00:00.000Z"); // 5pm today is still ahead
});

test("what's missing is reported, and non-reminders are ignored", () => {
  assert.deepEqual(parseReminder("remind me to do laundry", NOW, TZ), { error: "no_when" });
  assert.deepEqual(parseReminder("remind me tomorrow", NOW, TZ), { error: "no_what" });
  assert.deepEqual(parseReminder("remind me today at 9am to stretch", NOW, TZ), { error: "past" });
  assert.equal(parseReminder("what should I focus on?", NOW, TZ), null);
  assert.equal(parseReminder("I need a reminder", NOW, TZ), null);
  assert.equal(parseWhen("some day", NOW, TZ), null);
  assert.equal(parseWhen("a month from now", NOW, TZ), null); // "mon" in "month" is not Monday
});

test("formatWhen reads naturally", () => {
  assert.equal(formatWhen(new Date("2026-11-15T14:00:00Z"), NOW, TZ), "tomorrow at 9:00 AM");
  assert.equal(formatWhen(new Date("2026-11-18T20:30:00Z"), NOW, TZ), "Wednesday at 3:30 PM");
  assert.equal(formatWhen(new Date("2026-12-03T14:00:00Z"), NOW, TZ), "Dec 3 at 9:00 AM");
  assert.equal(formatWhen(new Date("2026-11-14T22:00:00Z"), NOW, TZ), "today at 5:00 PM");
});
