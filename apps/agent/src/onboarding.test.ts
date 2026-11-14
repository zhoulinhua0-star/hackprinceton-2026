import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeCalendar, FakeLLM, FakeMessenger, FixedClock, MemoryStore } from "@syllabus-crew/core";
import type { ParsedSyllabus } from "@syllabus-crew/core";
import { Crew } from "./index.ts";

const TZ = "America/New_York";
const ME = "+15555550100";
const ROUTE = { spaceId: "pho_spc_x", senderId: "pho_usr_y" };
const NOW = new Date("2026-11-14T12:00:00-05:00");

// Week-based dates with no term start, a paper with no date, and an extra-credit item with no category: three open questions.
const SYLLABUS: ParsedSyllabus = {
  courseName: "ECON 201", instructor: "Prof. Lee", term: "Fall 2026", termStartDate: null, notes: null,
  categories: [{ name: "Exam 1", weightPercent: 15 }, { name: "Final", weightPercent: 30 }, { name: "Paper", weightPercent: 15 }],
  assessments: [
    { name: "Exam 1", kind: "exam", category: "Exam 1", date: null, week: 4, topics: ["Ch. 1", "Ch. 2"] },
    { name: "Final", kind: "exam", category: "Final", date: null, week: 15, topics: ["cumulative"] },
    { name: "Paper", kind: "paper", category: "Paper", date: null, week: null, topics: [] },
    { name: "Extra credit", kind: "assignment", category: null, date: "2026-11-20", week: null, topics: [] },
  ],
};

function setup() {
  const messenger = new FakeMessenger(), calendar = new FakeCalendar(), store = new MemoryStore(), clock = new FixedClock(NOW);
  const crew = new Crew({ store, messenger, llm: new FakeLLM(), calendar, clock, tz: TZ, opts: { proposalDelayMs: 0, nextQuestionDelayMs: 0, dashboardUrl: "http://localhost:3000" } });
  return { crew, messenger, calendar, store, clock, last: () => messenger.sent.at(-1)!.text, texts: () => messenger.texts() };
}
const opened = async (s: ReturnType<typeof setup>) => s.crew.onInbound(ME, { text: "Hi", route: ROUTE });

test("the agent never texts first: no syllabus is installed for someone who hasn't texted the line", async () => {
  const s = setup();
  assert.equal(await s.crew.applySyllabus("+15555550999", SYLLABUS), undefined);
  assert.equal(s.messenger.sent.length, 0);
  assert.equal(await s.store.load("+15555550999"), undefined);
});

test("installing a syllabus: summary with the dashboard link, then the single most important question", async () => {
  const s = setup();
  await opened(s);
  const r = (await s.crew.applySyllabus(ME, SYLLABUS))!;
  assert.match(r.summary, /^Got it\. ECON 201\./);
  assert.match(r.summary, /Here's your semester: http:\/\/localhost:3000$/);
  assert.equal(r.question, "Your syllabus gives week numbers. When did ECON 201 start? (e.g. Sept 14)");
  assert.equal(s.texts().slice(-2)[0], r.summary);
  const st = (await s.store.load(ME))!;
  assert.equal(st.phase, "live");
  assert.equal(st.parsed, true);
  assert.equal(st.pendingAsk!.missing.kind, "termStart");
  assert.equal(st.route!.spaceId, "pho_spc_x");
});

test("answering the questions one at a time updates the plan, and ends when nothing is left", async () => {
  const s = setup();
  await opened(s);
  await s.crew.applySyllabus(ME, SYLLABUS);

  await s.crew.onInbound(ME, { text: "Sept 14" });
  assert.equal(s.last(), "Got it. I couldn't find how much Extra credit counts for. What percent of the grade is it?");
  let st = (await s.store.load(ME))!;
  assert.equal(st.syllabus!.termStartDate, "2026-09-14");
  assert.deepEqual(st.exams.map((e) => e.name).sort(), ["Exam 1", "Extra credit", "Final"]); // weeks resolved to dates; the dated item with no weight is kept at 0% until answered
  assert.equal(st.exams.find((e) => e.name === "Exam 1")!.date, "2026-10-05T14:00:00.000Z");

  await s.crew.onInbound(ME, { text: "5%" });
  assert.equal(s.last(), "Got it. I couldn't find a date for Paper. When is it? (e.g. Oct 21)");
  assert.equal((await s.store.load(ME))!.exams.find((e) => e.name === "Extra credit")!.weight, 0.05);

  await s.crew.onInbound(ME, { text: "it's Dec 7th" });
  assert.equal(s.last(), "Got it. That's everything I needed.");
  st = (await s.store.load(ME))!;
  assert.equal(st.pendingAsk, undefined);
  assert.equal(st.exams.find((e) => e.name === "Paper")!.date, "2026-12-07T15:00:00.000Z");
  assert.equal(st.deadlines!.some((d) => d.name === "Extra credit"), true);
});

test("an unclear answer gets one hint, then the question is dropped for good", async () => {
  const s = setup();
  await opened(s);
  await s.crew.applySyllabus(ME, SYLLABUS);
  await s.crew.onInbound(ME, { text: "um not sure when" });
  assert.equal(s.last(), "I didn't catch that date. Try something like Sept 14, or say skip.");
  await s.crew.onInbound(ME, { text: "no clue" });
  assert.match(s.last(), /^No problem, I'll leave that one\. /);
  const st = (await s.store.load(ME))!;
  assert.deepEqual(st.skippedAsks, ["termStart"]);
  assert.notEqual(st.pendingAsk?.missing.kind, "termStart"); // never asked again
});

test("'skip' drops the question at once, and a far-away date is treated as unclear", async () => {
  const s = setup();
  await opened(s);
  await s.crew.applySyllabus(ME, SYLLABUS);
  await s.crew.onInbound(ME, { text: "Sept 14 2030" }); // more than a year out
  assert.match(s.last(), /I didn't catch that date/);
  await s.crew.onInbound(ME, { text: "skip" });
  assert.match(s.last(), /^No problem, I'll leave that one\./);
});

test("normal commands still work while a question is open", async () => {
  const s = setup();
  await opened(s);
  await s.crew.applySyllabus(ME, SYLLABUS);
  await s.crew.onInbound(ME, { text: "what should I focus on?" });
  assert.doesNotMatch(s.last(), /didn't catch/);
  assert.equal((await s.store.load(ME))!.pendingAsk!.missing.kind, "termStart"); // still waiting
});

test("a syllabus with nothing missing sends the summary and asks nothing", async () => {
  const s = setup();
  await opened(s);
  const complete: ParsedSyllabus = { ...SYLLABUS, termStartDate: "2026-09-14", assessments: [
    { ...SYLLABUS.assessments[0]! }, { ...SYLLABUS.assessments[1]! }, { ...SYLLABUS.assessments[2]!, date: "2026-12-07" }, { ...SYLLABUS.assessments[3]!, category: "Paper" }] };
  const before = s.messenger.sent.length;
  const r = (await s.crew.applySyllabus(ME, complete))!;
  assert.equal(r.question, null);
  assert.equal(s.messenger.sent.length, before + 1);
  assert.equal((await s.store.load(ME))!.pendingAsk, undefined);
});

test("installing a real syllabus replaces the demo state and removes the demo's calendar event", async () => {
  const s = setup();
  await opened(s);
  await s.crew.switchToWeek6(ME);
  await s.crew.runScoutNow(ME);
  await s.crew.onInbound(ME, { text: "B" });
  await s.crew.onInbound(ME, { text: "YES" });
  assert.equal(s.calendar.events.length, 1);
  await s.crew.applySyllabus(ME, SYLLABUS);
  assert.equal(s.calendar.events.length, 0);
  const st = (await s.store.load(ME))!;
  assert.deepEqual([st.proposals.length, st.questions.length, st.pendingQuiz], [0, 0, undefined]);
  assert.equal(st.courses[0]!.name, "ECON 201");
});

test("a failed text while asking leaves no half-installed question", async () => {
  const s = setup();
  await opened(s);
  s.messenger.sent.length = 0;
  const real = s.messenger.send.bind(s.messenger);
  let n = 0;
  s.messenger.send = async (id, t) => { if (++n === 2) throw new Error("photon 503"); return real(id, t); }; // summary ok, question fails
  await assert.rejects(() => s.crew.applySyllabus(ME, SYLLABUS), /photon 503/);
  assert.equal((await s.store.load(ME))!.pendingAsk, undefined); // the student never saw the question, so it isn't waiting on one
});

test("uploading the same syllabus twice is recognised (so the caller can skip the re-read and the second text)", async () => {
  const s = setup();
  await opened(s);
  assert.equal(await s.crew.hasSyllabus(ME, "abc"), false);
  await s.crew.applySyllabus(ME, SYLLABUS, "abc");
  assert.equal(await s.crew.hasSyllabus(ME, "abc"), true);
  assert.equal(await s.crew.hasSyllabus(ME, "different"), false); // a different file is a new syllabus
  await s.crew.resetDemo(ME);
  assert.equal(await s.crew.hasSyllabus(ME, "abc"), false); // reset clears it, so the same file can be loaded again
});

// ---- a syllabus texted as photos or a PDF (the staged-photo switch off) ----
const PAGE = (n: number) => async () => ({ mediaType: "image/jpeg" as const, base64: `page-${n}` });
function realRead(json: unknown = SYLLABUS) {
  const s = setup();
  const llm = new FakeLLM(); llm.jsonByTask.parse_syllabus = json;
  const crew = new Crew({ store: s.store, messenger: s.messenger, llm, calendar: s.calendar, clock: s.clock, tz: TZ, opts: { proposalDelayMs: 0, nextQuestionDelayMs: 0, stagedPhoto: false, intakeWaitMs: 60_000 } });
  return { ...s, crew, llm };
}

test("texted pages are acknowledged once, read together, and installed as the student's semester", async () => {
  const s = realRead();
  await s.crew.onInbound(ME, { hasImage: true, route: ROUTE, file: PAGE(1) });
  await s.crew.onInbound(ME, { hasImage: true, route: ROUTE, file: PAGE(2) });
  assert.deepEqual(s.texts(), ["Got it, reading your syllabus. Give me about 20 seconds."]);
  assert.equal(await s.crew.readIntake(ME), "installed");
  const st = (await s.store.load(ME))!;
  assert.equal(st.phase, "live");
  assert.equal(st.courses[0]!.name, "ECON 201");
  assert.match(s.texts()[1]!, /ECON 201/);
  assert.equal(s.llm.calls.filter((c) => c.task === "parse_syllabus").length, 1); // both pages in one read
  assert.equal(await s.crew.readIntake(ME), "none"); // nothing left to read
});

test("the same file again changes nothing; a photo that is not a syllabus changes nothing", async () => {
  const s = realRead();
  await s.crew.onInbound(ME, { hasImage: true, route: ROUTE, file: PAGE(1) });
  await s.crew.readIntake(ME);
  await s.crew.onInbound(ME, { hasImage: true, route: ROUTE, file: PAGE(1) });
  assert.equal(await s.crew.readIntake(ME), "duplicate");
  assert.equal(s.last(), "That's the syllabus I already have, so nothing changed.");

  const bad = realRead({ nonsense: true });
  await bad.crew.onInbound(ME, { hasImage: true, route: ROUTE, file: PAGE(1) });
  assert.equal(await bad.crew.readIntake(ME), "unreadable");
  assert.match(bad.last(), /couldn't find a syllabus/);
  assert.equal((await bad.store.load(ME))!.phase, "day1");

  const gone = realRead();
  await gone.crew.onInbound(ME, { hasImage: true, route: ROUTE, file: async () => null });
  assert.equal(await gone.crew.readIntake(ME), "unreadable");
  assert.match(gone.last(), /couldn't open that file/);
});

test("with the staged switch on (the default), a texted photo still loads the stored Macro syllabus at once", async () => {
  const s = setup();
  await s.crew.onInbound(ME, { hasImage: true, route: ROUTE, file: PAGE(1) });
  assert.match(s.last(), /^Got it\. Exam 2 is 25%/);
  assert.equal(await s.crew.readIntake(ME), "none");
});

test("a texted PDF is read for real even with the staged switch on; extra photos get one reply, not one each", async () => {
  const s = setup();
  const llm = new FakeLLM(); llm.jsonByTask.parse_syllabus = SYLLABUS;
  const crew = new Crew({ store: s.store, messenger: s.messenger, llm, calendar: s.calendar, clock: s.clock, tz: TZ, opts: { proposalDelayMs: 0, nextQuestionDelayMs: 0, intakeWaitMs: 60_000 } });
  await crew.onInbound(ME, { hasImage: true, route: ROUTE, file: async () => ({ mediaType: "application/pdf", base64: "pdf-bytes" }) });
  assert.equal(s.last(), "Got it, reading your syllabus. Give me about 20 seconds.");
  assert.equal(await crew.readIntake(ME), "installed");
  assert.equal((await s.store.load(ME))!.courses[0]!.name, "ECON 201");

  const p = setup();
  for (let i = 0; i < 4; i++) await p.crew.onInbound(ME, { hasImage: true, route: ROUTE, file: PAGE(i) });
  assert.equal(p.texts().length, 1); // the staged summary only: the three extra photos are not answered one by one
  assert.match(p.texts()[0]!, /^Got it\. Exam 2 is 25%/);
});

test("questions finished after the semester changed (Week 6, Reset) are dropped without a text", async () => {
  const s = setup();
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const llm = new FakeLLM();
  llm.jsonByTask.parse_syllabus = SYLLABUS;
  llm.jsonByTask.write_questions = async () => { await gate; return { questions: [] }; };
  const crew = new Crew({ store: s.store, messenger: s.messenger, llm, calendar: s.calendar, clock: s.clock, tz: TZ, opts: { proposalDelayMs: 0, nextQuestionDelayMs: 0 } });
  await crew.onInbound(ME, { text: "Hi", route: ROUTE });
  await crew.applySyllabus(ME, SYLLABUS, "h1");
  const writing = crew.generateQuestions(ME, { announce: true });
  await crew.switchToWeek6(ME);
  const before = s.messenger.sent.length;
  release();
  assert.equal((await writing).added, 0);
  assert.equal(s.messenger.sent.length, before);
  assert.equal((await s.store.load(ME))!.phase, "week6");
});

test("a PDF read that finishes after Week 6 was pressed does not overwrite Week 6 or its open quiz", async () => {
  const s = realRead();
  await s.crew.onInbound(ME, { hasImage: true, route: ROUTE, file: async () => ({ mediaType: "application/pdf", base64: "pdf" }) });
  await s.crew.switchToWeek6(ME); // pressed while the PDF is being read
  await s.crew.runScoutNow(ME);
  assert.ok((await s.store.load(ME))!.pendingQuiz);
  assert.equal(await s.crew.readIntake(ME), "none");
  const st = (await s.store.load(ME))!;
  assert.equal(st.phase, "week6");
  assert.ok(st.pendingQuiz, "the open quiz survives");
  await s.crew.onInbound(ME, { text: "A" });
  assert.ok(s.texts().slice(-2).some((t) => /^Correct!/.test(t))); // then the offer for the rest
});
