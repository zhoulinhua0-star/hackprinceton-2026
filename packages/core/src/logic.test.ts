import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeCalendar } from "./fakes.ts";
import type { StudentState } from "./types.ts";
import { rankTopics } from "./logic.ts";
import { topicLabel } from "./logic.ts";
import { canSend, daysUntil, gradeChoice, inQuietHours, isAmbiguous, parseReply, pickSlot, priority, rollCounters, updateMastery, weekdayName, clock } from "./logic.ts";

const TZ = "America/New_York";
const at = (iso: string) => new Date(iso);

test("mastery: wrong x0.7, right closes 30% of the gap", () => {
  assert.equal(updateMastery(0.5, false), 0.35);
  assert.equal(updateMastery(0.5, true), 0.65);
  assert.equal(updateMastery(1, true), 1);
  assert.ok(updateMastery(0, false) === 0);
});

test("grading is exact", () => {
  assert.equal(gradeChoice({ correct: "A" }, "A"), true);
  assert.equal(gradeChoice({ correct: "A" }, "B"), false);
});

test("priority ranks weight x weakness x urgency", () => {
  const weakHeavy = priority(0.25, 0.35, 6);
  const strongHeavy = priority(0.25, 0.82, 6);
  const weakLight = priority(0.02, 0.35, 6);
  assert.ok(weakHeavy > strongHeavy);
  assert.ok(weakHeavy > weakLight);
  assert.ok(priority(0.25, 0.5, 2) > priority(0.25, 0.5, 10));
  assert.equal(priority(0.25, 0.5, 0), priority(0.25, 0.5, 1)); // exam today does not divide by zero
});

test("daysUntil counts calendar days in the student's timezone", () => {
  const sunNoon = at("2026-11-15T12:00:00-05:00");
  assert.equal(daysUntil("2026-11-21T10:00:00-05:00", sunNoon, TZ), 6);
  assert.equal(daysUntil("2026-11-21T00:30:00-05:00", sunNoon, TZ), 6); // early morning is still that calendar day
  assert.equal(daysUntil("2026-11-15T20:00:00-05:00", sunNoon, TZ), 0);
  assert.equal(daysUntil("2026-11-16T00:10:00-05:00", at("2026-11-15T23:50:00-05:00"), TZ), 1);
  assert.equal(daysUntil("2026-11-14T10:00:00-05:00", sunNoon, TZ), -1);
});

test("parseReply: choices", () => {
  for (const t of ["B", "b", " B ", "(b)", "B)", "b.", "B\\", "b!", "[b]", "I think B", "answer is b", "it's b", "going with b", "Answer B."]) assert.deepEqual(parseReply(t), { kind: "choice", value: "B" }, t);
  assert.deepEqual(parseReply("c"), { kind: "choice", value: "C" });
  assert.equal(parseReply("d").kind, "other");
  assert.equal(parseReply("ab").kind, "other");
  assert.equal(parseReply("I think about it").kind, "other");
  assert.equal(parseReply("b or c").kind, "other");
  assert.equal(parseReply("a lot").kind, "other");
});

test("parseReply: yes / no / unclear", () => {
  for (const t of ["YES", "yes", "Yes!", "y", "yeah", "sure", "yes please"]) assert.equal(parseReply(t).kind, "yes", t);
  for (const t of ["no", "NO", "nope", "not now", "no thanks"]) assert.equal(parseReply(t).kind, "no", t);
  for (const t of ["maybe", "ok", "hmm", "yes but later", "no idea", "what", ""]) assert.equal(parseReply(t).kind, "other", t);
  assert.equal(isAmbiguous("maybe"), true);
  assert.equal(isAmbiguous("what should I focus on"), false);
});

test("quiet hours 11pm-8am local", () => {
  assert.equal(inQuietHours(at("2026-11-15T23:30:00-05:00"), TZ), true);
  assert.equal(inQuietHours(at("2026-11-16T07:59:00-05:00"), TZ), true);
  assert.equal(inQuietHours(at("2026-11-16T08:00:00-05:00"), TZ), false);
  assert.equal(inQuietHours(at("2026-11-15T22:59:00-05:00"), TZ), false);
  // 3am UTC is 10pm the previous evening in New York: not quiet
  assert.equal(inQuietHours(at("2026-11-16T03:00:00Z"), TZ), false);
});

test("daily cap and quiet hours gate sends; demo bypass skips both", () => {
  const noon = at("2026-11-15T12:00:00-05:00");
  const full = { day: "2026-11-15", quizzes: 3, nudges: 0 };
  assert.deepEqual(canSend("quiz", full, noon, TZ), { ok: false, reason: "daily_cap" });
  assert.deepEqual(canSend("quiz", { ...full, quizzes: 2 }, noon, TZ), { ok: true });
  assert.deepEqual(canSend("nudge", { day: "2026-11-15", quizzes: 0, nudges: 3 }, noon, TZ), { ok: false, reason: "daily_cap" });
  assert.deepEqual(canSend("quiz", full, at("2026-11-15T23:30:00-05:00"), TZ), { ok: false, reason: "quiet_hours" });
  assert.deepEqual(canSend("quiz", full, at("2026-11-15T23:30:00-05:00"), TZ, true), { ok: true });
  assert.equal(rollCounters(full, at("2026-11-16T09:00:00-05:00"), TZ).quizzes, 0); // new day resets
});

test("pickSlot prefers the weekday, avoids busy blocks, stays before the exam", () => {
  const now = at("2026-11-15T12:00:00-05:00"); // Sunday
  const exam = "2026-11-21T10:00:00-05:00"; // in 6 days
  const s = pickSlot(now, exam, [], TZ, { preferWeekday: 2 })!;
  assert.equal(weekdayName(new Date(s.startISO), TZ), "Tuesday");
  assert.equal(clock(new Date(s.startISO), TZ), "4:00");
  assert.equal(clock(new Date(s.endISO), TZ), "4:30");
  const blocked = pickSlot(now, exam, [{ startISO: s.startISO, endISO: s.endISO }], TZ, { preferWeekday: 2 })!;
  assert.notEqual(blocked.startISO, s.startISO);
  assert.ok(new Date(blocked.startISO) < new Date(exam));
  assert.equal(pickSlot(now, "2026-11-15T20:00:00-05:00", [], TZ), null); // exam today, nothing to schedule before it
});

test("rankTopics counts days in the student's timezone, not New York's", () => {
  const LA = "America/Los_Angeles";
  const state = { exams: [{ id: "e", courseId: "c", name: "E", weight: 0.25, date: "2026-11-20T10:00:00-08:00", topicIds: ["t"] }], mastery: { t: 0.5 } } as unknown as StudentState;
  const now = new Date("2026-11-18T21:00:00-08:00"); // 9pm Pacific, already the 19th in New York
  assert.equal(daysUntil("2026-11-20T10:00:00-08:00", now, LA), 2);
  assert.equal(rankTopics(state, now, LA)[0]!.score, priority(0.25, 0.5, 2));
  assert.equal(rankTopics(state, now, TZ)[0]!.score, priority(0.25, 0.5, 1)); // New York really does see 1 day
});

test("FakeCalendar never reuses an id after a delete", async () => {
  const c = new FakeCalendar();
  const e = { title: "t", startISO: "2026-11-17T21:00:00.000Z", endISO: "2026-11-17T21:30:00.000Z" };
  const a = await c.createEvent(e), b = await c.createEvent(e);
  await c.deleteEvent(a.id);
  const d = await c.createEvent(e);
  assert.equal(new Set([a.id, b.id, d.id]).size, 3);
  assert.deepEqual(c.events.map((x) => x.id), [b.id, d.id]);
});

test("topicLabel: a short readable name for a reading", () => {
  assert.equal(topicLabel("Selections from The Book of Songs"), "The Book of Songs");
  assert.equal(topicLabel("Homer, The Odyssey, Books 1–13"), "Homer, The Odyssey");
  assert.equal(topicLabel("Said, Orientalism, pp. 226-328"), "Said, Orientalism");
  assert.equal(topicLabel("Sophocles, Antigone (lines 1–end)"), "Sophocles, Antigone");
  assert.equal(topicLabel("Said, Orientalism, 226-328"), "Said, Orientalism");
  assert.equal(topicLabel("Said, Orientalism, pp. 31–149"), "Said, Orientalism");
  assert.equal(topicLabel("Ch. 5: Interest rates"), "Ch. 5: Interest rates");
  assert.equal(topicLabel("Genesis, 1-21"), "Genesis");
  assert.equal(topicLabel("The Rāmāyaṇa of Vālmīki, Bālakāṇḍa through Sundarakāṇḍa"), "The Rāmāyaṇa of Vālmīki, Bālakāṇḍa");
  assert.equal(topicLabel("Ch. 5: Interest rates"), "Ch. 5: Interest rates");
  assert.equal(topicLabel("A".repeat(80)).length, 46);
  assert.equal(topicLabel("Selections from"), "Selections from"); // never returns an empty label
});
