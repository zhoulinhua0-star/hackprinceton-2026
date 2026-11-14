import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAnswer, askKey, isDontKnow, isHintRequest, isSkip, isUnsure, parseDateAnswer, parsePercent } from "./answers.ts";
import { toPatch } from "./syllabus.ts";
import type { ParsedSyllabus } from "./syllabus.ts";

const TZ = "America/New_York";
const NOW = new Date("2026-11-14T12:00:00-05:00");

test("parseDateAnswer: common ways people write a date", () => {
  for (const t of ["Dec 7", "dec 7", "December 7", "December 7th", "12/7", "12/07/2026", "12/7/26", "2026-12-07", "7 Dec", "7 December 2026", "Dec 7, 2026", "it's Dec 7", "on December 7th.", "Due Dec 7!"])
    assert.equal(parseDateAnswer(t, NOW, TZ), "2026-12-07", t);
  assert.equal(parseDateAnswer("Sept 9", NOW, TZ), "2026-09-09"); // earlier this term: closest year is this one
  assert.equal(parseDateAnswer("Jan 12", NOW, TZ), "2027-01-12"); // next January, not last
});

test("parseDateAnswer: rejects what it can't be sure of", () => {
  for (const t of ["", "soon", "next friday", "Feb 30", "13/45", "Smarch 4", "Dec", "7", "the seventh", "12/7 or 12/8", "Dec 7 2026 at 9am"])
    assert.equal(parseDateAnswer(t, NOW, TZ), null, t);
  assert.equal(parseDateAnswer("Feb 29", NOW, TZ), null); // no Feb 29 in 2025-2027: ask again rather than guess a year
});

test("parseDateAnswer: the year closest to today wins around New Year", () => {
  const dec = new Date("2026-12-28T12:00:00-05:00");
  assert.equal(parseDateAnswer("Jan 5", dec, TZ), "2027-01-05");
  const jan = new Date("2027-01-03T12:00:00-05:00");
  assert.equal(parseDateAnswer("Dec 20", jan, TZ), "2026-12-20");
});

test("parsePercent", () => {
  for (const [t, n] of [["20", 20], ["20%", 20], [" 12.5 % ", 12.5], ["about 15 percent", 15], ["it's 30", 30]] as const) assert.equal(parsePercent(t), n, t);
  for (const t of ["", "0", "101", "lots", "-5", "twenty", "20 or 25"]) assert.equal(parsePercent(t), null, t);
});

test("isSkip", () => {
  for (const t of ["skip", "Skip.", "idk", "I don't know", "not sure", "n/a", "no idea"]) assert.equal(isSkip(t), true, t);
  for (const t of ["Dec 7", "maybe Dec 7", "skipping class"]) assert.equal(isSkip(t), false, t);
});

const P = (o: Partial<ParsedSyllabus> = {}): ParsedSyllabus => ({
  courseName: "X", instructor: null, term: null, termStartDate: null, notes: null,
  categories: [{ name: "Final", weightPercent: 30 }], assessments: [
    { name: "Final", kind: "exam", category: "Final", date: null, week: null, topics: [] },
    { name: "Quiz A", kind: "quiz", category: null, date: "2026-10-12", week: null, topics: [] },
  ], ...o,
});

test("applyAnswer: a date, a term start (which fixes every week-based item), and a weight", () => {
  const p1 = applyAnswer(P(), { kind: "date", assessment: "Final" }, "2026-12-07");
  assert.equal(toPatch(p1, TZ).exams.find((e) => e.name === "Final")!.date, "2026-12-07T15:00:00.000Z");
  assert.equal(toPatch(p1, TZ).missing.some((m) => m.kind === "date"), false);

  const weeks = P({ assessments: [{ name: "Exam 1", kind: "exam", category: "E", date: null, week: 4, topics: [] }, { name: "Exam 2", kind: "exam", category: "E", date: null, week: 7, topics: [] }], categories: [{ name: "E", weightPercent: 40 }] });
  assert.deepEqual(toPatch(weeks, TZ).missing, [{ kind: "termStart" }]);
  const p2 = applyAnswer(weeks, { kind: "termStart" }, "2026-09-14");
  assert.deepEqual(toPatch(p2, TZ).missing, []);
  assert.equal(toPatch(p2, TZ).exams.length, 2);

  const p3 = applyAnswer(P(), { kind: "weight", assessment: "Quiz A" }, 15);
  assert.equal(toPatch(p3, TZ).exams.find((e) => e.name === "Quiz A")!.weight, 0.15);
  assert.equal(toPatch(p3, TZ).missing.some((m) => m.kind === "weight"), false);
  assert.equal(P().categories.length, 1); // the original is untouched
});

test("askKey is stable per question", () => {
  assert.equal(askKey({ kind: "termStart" }), "termStart");
  assert.equal(askKey({ kind: "date", assessment: "Final" }), "date:Final");
  assert.equal(askKey({ kind: "weight", assessment: "Quiz A" }), "weight:Quiz A");
});

test("isDontKnow and isHintRequest", () => {
  for (const t of ["idk", "I do not know", "i don't know", "I dont know the answer", "no idea", "I give up", "tell me", "what's the answer?", "Dunno."]) assert.equal(isDontKnow(t), true, t);
  for (const t of ["B", "I know it is B", "do you know", "maybe b", "no", "I don't know, maybe C", "not sure"]) assert.equal(isDontKnow(t), false, t);
  for (const t of ["not sure", "I'm not sure", "stuck", "I'm lost"]) assert.equal(isUnsure(t), true, t);
  assert.equal(isUnsure("I'm not sure about the date"), false);
  for (const t of ["hint", "Hint?", "give me a hint", "can I get a hint", "clue"]) assert.equal(isHintRequest(t), true, t);
  for (const t of ["hints are bad", "a", "what hint"]) assert.equal(isHintRequest(t), false, t);
});
