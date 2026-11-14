import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, crunchWeeks, describe, nextQuestion, toPatch, validateParsed, weightOf } from "./syllabus.ts";
import type { GradeCategory, ParsedSyllabus } from "./syllabus.ts";

const TZ = "America/New_York";
const NOW = new Date("2026-10-01T12:00:00-04:00");
type Item = ParsedSyllabus["assessments"][number];
const A = (o: Partial<Item>): Item => ({ name: "X", kind: "exam", category: null, date: null, week: null, topics: [], ...o });
const P = (assessments: Item[], categories: GradeCategory[] = [], o: Partial<ParsedSyllabus> = {}): ParsedSyllabus =>
  ({ courseName: "ECON 201", instructor: null, term: "Fall 2026", termStartDate: "2026-09-14", categories, assessments, notes: null, ...o });
const raw = (o: Record<string, unknown> = {}) => ({ courseName: "X", instructor: null, term: null, termStartDate: null, notes: null, categories: [], assessments: [], ...o });

const MACRO = P(
  [
    A({ name: "Exam 1", category: "Exam 1", week: 4, topics: ["Ch. 1"] }),
    A({ name: "Exam 2", category: "Exam 2", week: 7, topics: ["Ch. 4: Money", "Ch. 5: Rates", "Ch. 6: Fiscal"] }),
    A({ name: "PS 1", kind: "assignment", category: "Problem sets", week: 2 }), A({ name: "PS 2", kind: "assignment", category: "Problem sets", week: 6 }),
    A({ name: "PS 3", kind: "assignment", category: "Problem sets", week: 8 }), A({ name: "PS 4", kind: "assignment", category: "Problem sets", week: 9 }),
    A({ name: "Paper", kind: "paper", category: "Research paper", week: 9 }),
    A({ name: "Final exam", category: "Final", week: 15, topics: ["cumulative"] }),
  ],
  [{ name: "Exam 1", weightPercent: 15 }, { name: "Exam 2", weightPercent: 25 }, { name: "Final", weightPercent: 30 }, { name: "Research paper", weightPercent: 15 }, { name: "Problem sets", weightPercent: 10 }, { name: "Participation", weightPercent: 5 }],
);

test("validateParsed accepts a good result and trims", () => {
  const v = validateParsed(raw({ courseName: " ECON 201 ", termStartDate: "2026-09-14",
    categories: [{ name: " Exam 1 ", weightPercent: 15 }],
    assessments: [{ name: " Exam 1 ", kind: "exam", category: "Exam 1", date: null, week: 4, topics: [" Ch. 1 "] }] }));
  assert.equal(v.ok, true);
  if (v.ok) { assert.equal(v.value.courseName, "ECON 201"); assert.equal(v.value.assessments[0]!.name, "Exam 1"); assert.deepEqual(v.value.assessments[0]!.topics, ["Ch. 1"]); assert.equal(v.value.categories[0]!.name, "Exam 1"); }
});

test("validateParsed rejects bad shapes with specific errors", () => {
  const bad = (x: unknown) => { const v = validateParsed(x); assert.equal(v.ok, false); return v.ok ? "" : v.errors.join(" | "); };
  assert.match(bad(null), /not an object/);
  assert.match(bad(raw({ courseName: "" })), /courseName/);
  assert.match(bad(raw({ termStartDate: "2026-02-30" })), /termStartDate/);
  assert.match(bad(raw({ assessments: [A({ kind: "midterm" as any })] })), /kind/);
  assert.match(bad(raw({ categories: [{ name: "Exam", weightPercent: 120 }] })), /weightPercent/);
  assert.match(bad(raw({ assessments: [A({ date: "10/12/2026" })] })), /date/);
  assert.match(bad(raw({ assessments: [A({ week: 0 })] })), /week/);
  assert.match(bad(raw({ assessments: "nope" })), /array/);
  assert.match(bad(raw({ categories: [{ name: "Final", weightPercent: 30 }], assessments: [A({ category: "Finals" })] })), /not one of the categories: Final/);
});

test("categories over 100% are rejected: sub-parts listed on top of their category (the real-PDF failure)", () => {
  // Participation 40 stated, plus journal 15 + presentation 15 + discussion 20 listed as separate categories = 110
  const cats = [{ name: "Journal", weightPercent: 15 }, { name: "Presentation", weightPercent: 15 }, { name: "Discussion", weightPercent: 20 }, { name: "Writing", weightPercent: 30 }, { name: "Final", weightPercent: 30 }];
  const v = validateParsed(raw({ categories: cats }));
  assert.equal(v.ok, false);
  if (!v.ok) assert.match(v.errors[0]!, /add up to 110%/);
  assert.equal(validateParsed(raw({ categories: [{ name: "Participation", weightPercent: 40 }, cats[3], cats[4]] })).ok, true);
});

test("weightOf: a category's weight is shared equally by its items, computed in code", () => {
  const p = P([A({ name: "E1", category: "Writing" }), A({ name: "E2", category: "Writing" }), A({ name: "E3", category: "Writing" }), A({ name: "Final", category: "Final" }), A({ name: "Orphan" })],
    [{ name: "Writing", weightPercent: 30 }, { name: "Final", weightPercent: 30 }]);
  assert.deepEqual(p.assessments.map((a) => weightOf(p, a)), [10, 10, 10, 30, null]);
  assert.equal(weightOf(MACRO, MACRO.assessments.find((a) => a.name === "PS 3")!), 2.5);
});

test("toPatch: dates from a calendar date, or from week + term start", () => {
  const p = toPatch(P([A({ name: "Exam 1", category: "E", date: "2026-10-12" }), A({ name: "Exam 2", category: "E2", week: 7, topics: ["Ch. 4", "Ch. 5"] })],
    [{ name: "E", weightPercent: 20 }, { name: "E2", weightPercent: 20 }]), TZ);
  assert.equal(p.exams.length, 2);
  assert.equal(p.exams[0]!.date, "2026-10-12T14:00:00.000Z"); // 10am New York (EDT)
  assert.equal(p.exams[1]!.date, "2026-10-26T14:00:00.000Z"); // week 7 = Sept 14 + 42 days
  assert.equal(p.exams[1]!.weight, 0.2);
  assert.deepEqual(p.topics.map((t) => t.name), ["Ch. 4", "Ch. 5"]);
  assert.deepEqual(p.exams[1]!.topicIds, p.topics.map((t) => t.id));
  assert.deepEqual(p.missing, []);
});

test("toPatch: missing dates become questions, heaviest first, small items never", () => {
  const p = toPatch(P(
    [A({ name: "Final", category: "Final" }), A({ name: "Paper", kind: "paper", category: "Paper" }), A({ name: "Quiz", kind: "quiz", category: "Quiz" }), A({ name: "Participation", kind: "participation", category: "Part" })],
    [{ name: "Final", weightPercent: 30 }, { name: "Paper", weightPercent: 15 }, { name: "Quiz", weightPercent: 6 }, { name: "Part", weightPercent: 10 }]), TZ);
  assert.equal(p.exams.length, 0);
  assert.deepEqual(p.missing, [{ kind: "date", assessment: "Final" }, { kind: "date", assessment: "Paper" }]); // Quiz is under 10%: not worth asking
  assert.equal(nextQuestion(p.missing, "ECON 201"), "I couldn't find a date for Final. When is it? (e.g. Oct 21)");
});

test("toPatch: weeks without a term start ask for the start date once, first", () => {
  const p = toPatch(P([A({ name: "Exam 1", category: "E", week: 4 }), A({ name: "Exam 2", category: "E", week: 7 })], [{ name: "E", weightPercent: 40 }], { termStartDate: null }), TZ);
  assert.deepEqual(p.missing, [{ kind: "termStart" }]);
  assert.match(nextQuestion(p.missing, "ECON 201")!, /When did ECON 201 start/);
});

test("toPatch: a dated item with no category is kept at 0% and flagged", () => {
  const p = toPatch(P([A({ name: "Essay", kind: "paper", date: "2026-10-12" })]), TZ);
  assert.equal(p.exams[0]!.weight, 0);
  assert.deepEqual(p.missing, [{ kind: "weight", assessment: "Essay" }]);
  assert.equal(nextQuestion([], "X"), null);
});

test("crunchWeeks: two or more deadlines in one Mon-Sun week, small ones included; a lone big exam is not a crunch", () => {
  const c = crunchWeeks(toPatch(MACRO, TZ).deadlines, TZ);
  assert.deepEqual(c.map((x) => ({ monday: x.monday, count: x.count, weightPercent: x.weightPercent })), [{ monday: "2026-11-09", count: 2, weightPercent: 18 }]); // paper 15 + PS 4 2.5
  assert.equal(addDays("2026-09-14", 56), "2026-11-09");
  assert.equal(crunchWeeks([{ date: "2026-10-12T14:00:00.000Z", weight: 0.2 }], TZ).length, 0);
});

test("describe: leads with what's next, then the heaviest item, then crunch", () => {
  const patch = toPatch(MACRO, TZ);
  assert.equal(describe(MACRO, patch, TZ, NOW), "Got it. ECON 201. Next up: Exam 1 on Oct 5 (15%). Final exam is 30% and is cumulative. Week 9 looks heavy.");
  const quiet = P([A({ name: "Exam 1", category: "E", date: "2026-10-12", topics: ["Ch. 1", "Ch. 2"] })], [{ name: "E", weightPercent: 25 }]);
  assert.equal(describe(quiet, toPatch(quiet, TZ), TZ, NOW), "Got it. ECON 201. Next up: Exam 1 on Oct 12 (25%).");
  const none = P([]);
  assert.match(describe(none, toPatch(none, TZ), TZ, NOW), /couldn't find dated assessments/);
});

test("validateParsed(now) rejects dates more than a year from today (a guessed year)", () => {
  const today = new Date("2026-11-14T12:00:00Z");
  const mk = (date: string) => raw({ assessments: [A({ date })] });
  assert.equal(validateParsed(mk("2026-12-07"), today).ok, true);
  assert.equal(validateParsed(mk("2026-09-09"), today).ok, true); // a past deadline this term is fine
  assert.equal(validateParsed(mk("2027-11-14"), today).ok, true);
  assert.equal(validateParsed(mk("2025-10-12"), today).ok, false); // last year's date: the model guessed the wrong year
  const v = validateParsed(mk("2024-10-12"), today);
  assert.equal(v.ok, false);
  if (!v.ok) assert.match(v.errors[0]!, /more than a year from today/);
  assert.equal(validateParsed(raw({ termStartDate: "2025-09-02" }), today).ok, false);
  assert.equal(validateParsed(raw({ termStartDate: "2026-09-02" }), today).ok, true);
  assert.equal(validateParsed(mk("2024-10-12")).ok, true); // no "today" given: no check
});

test("describe: a crunch week still counts on its last day (Sunday), in the student's timezone", () => {
  const items = [
    A({ name: "Paper", kind: "paper", category: "Paper", week: 9 }), A({ name: "PS 4", kind: "assignment", category: "PS", week: 9 }),
    A({ name: "Essay A", kind: "paper", category: "Small", week: 12 }), A({ name: "Essay B", kind: "paper", category: "Small", week: 12 }),
  ];
  const p = P(items, [{ name: "Paper", weightPercent: 15 }, { name: "PS", weightPercent: 3 }, { name: "Small", weightPercent: 4 }]);
  const sundayEvening = new Date("2026-11-15T20:00:00-05:00"); // Sunday: week 9 (Nov 9-15) is not over yet
  assert.match(describe(p, toPatch(p, TZ), TZ, sundayEvening), /Week 9 looks heavy\.$/);
  const mondayMorning = new Date("2026-11-16T09:00:00-05:00");
  assert.match(describe(p, toPatch(p, TZ), TZ, mondayMorning), /Week 12 looks heavy\.$/);
});

test("describe: week numbers count from the week containing the first day, even if it is not a Monday", () => {
  const p = P([A({ name: "Essay A", kind: "paper", category: "E", week: 2 }), A({ name: "Essay B", kind: "paper", category: "E", week: 2 })], [{ name: "E", weightPercent: 30 }], { termStartDate: "2026-09-02" }); // a Wednesday
  assert.match(describe(p, toPatch(p, TZ), TZ, new Date("2026-09-01T12:00:00-04:00")), /Week 2 looks heavy\.$/);
});
