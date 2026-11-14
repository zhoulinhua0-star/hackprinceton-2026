import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { FakeCalendar, FakeLLM, FakeMessenger, FixedClock, MemoryStore, weekdayName } from "@syllabus-crew/core";
import { Crew } from "./index.ts";

const TZ = "America/New_York";
const ME = "+15555550100";
const SUNDAY_NOON = new Date("2026-11-15T12:00:00-05:00");

function setup(o: { llm?: FakeLLM; clock?: Date; calendar?: FakeCalendar; llmProposals?: boolean } = {}) {
  const messenger = new FakeMessenger();
  const calendar = o.calendar ?? new FakeCalendar();
  const store = new MemoryStore();
  const clock = new FixedClock(o.clock ?? SUNDAY_NOON);
  const llm = o.llm ?? new FakeLLM();
  const crew = new Crew({ store, messenger, llm, calendar, clock, tz: TZ, opts: { proposalDelayMs: 0, nextQuestionDelayMs: 0, llmProposals: o.llmProposals ?? true } });
  return { crew, messenger, calendar, store, clock, llm, last: () => messenger.sent.at(-1)?.text };
}

/** Day 1 photo -> week 6 -> Scout -> quiz, leaving the quiz pending. */
async function toQuiz(s: ReturnType<typeof setup>) {
  await s.crew.onInbound(ME, { text: "Hi Syllabus Crew" });
  await s.crew.onInbound(ME, { hasImage: true });
  await s.crew.switchToWeek6(ME);
  await s.crew.runScoutNow(ME);
}

test("the demo loop: photo, Scout, quiz, wrong answer, proposal, YES -> calendar", async () => {
  const s = setup();
  await s.crew.onInbound(ME, { text: "Hi Syllabus Crew" });
  await s.crew.onInbound(ME, { hasImage: true });
  assert.match(s.last()!, /^Got it\. Exam 2 is 25% and covers chapters 4-6\. Week 9 looks heavy\. Here's your semester: http/);

  await s.crew.switchToWeek6(ME);
  await s.crew.runScoutNow(ME);
  const t = s.messenger.texts();
  assert.equal(t.at(-2), "Prof. Lee posted Week 6 slides. Added a few questions to your quiz.");
  assert.equal(t.at(-1), "Quick one on chapter 5 before Saturday. If the Fed raises rates, what happens to investment spending?\nA) Falls  B) Rises  C) No change");

  await s.crew.onInbound(ME, { text: "B" });
  const after = s.messenger.texts().slice(-2);
  assert.equal(after[0], "Not quite. If borrowing gets more expensive, would a firm build a new factory sooner or later?");
  assert.doesNotMatch(after[0]!, /Falls|answer is/); // never reveals on the first miss
  assert.equal((await s.store.load(ME))!.mastery.ch5, 0.35); // 50% -> 35%, computed in code
  assert.equal(after[1], "Exam 2 is 25% and chapter 5 is your weak spot. Want me to add 30 minutes of review on Tuesday? Reply YES or NO.");
  assert.equal(s.calendar.events.length, 0); // nothing written yet

  await s.crew.onInbound(ME, { text: "maybe" });
  assert.match(s.last()!, /Reply YES .* or NO/);
  assert.equal(s.calendar.events.length, 0); // unclear never writes

  await s.crew.onInbound(ME, { text: "YES" });
  assert.equal(s.calendar.events.length, 1);
  const ev = s.calendar.events[0]!;
  assert.equal(weekdayName(new Date(ev.startISO), TZ), "Tuesday");
  assert.equal(new Date(ev.endISO).getTime() - new Date(ev.startISO).getTime(), 30 * 60_000);
  assert.equal(s.last(), "Done. Tuesday 4:00-4:30, chapter 5 review.");
  assert.equal((await s.store.load(ME))!.proposals[0]!.status, "approved");
});

test("NO never writes to the calendar", async () => {
  const s = setup();
  await toQuiz(s);
  await s.crew.onInbound(ME, { text: "B" });
  await s.crew.onInbound(ME, { text: "no" });
  assert.equal(s.calendar.events.length, 0);
  assert.equal((await s.store.load(ME))!.proposals[0]!.status, "declined");
});

test("two wrong answers reveal the answer with an explanation", async () => {
  const s = setup();
  await toQuiz(s);
  await s.crew.onInbound(ME, { text: "B" });
  await s.crew.onInbound(ME, { text: "C" });
  assert.equal(s.last(), "The answer is A) Falls. Higher rates make borrowing costlier, so firms invest less.");
  assert.equal((await s.store.load(ME))!.pendingQuiz, undefined);
});

test("a right answer raises mastery and proposes nothing", async () => {
  const s = setup();
  await toQuiz(s);
  await s.crew.onInbound(ME, { text: "a" });
  assert.match(s.last()!, /^Correct!/);
  const st = (await s.store.load(ME))!;
  assert.equal(st.mastery.ch5, 0.65);
  assert.equal(st.proposals.length, 0);
});

test("the agent never texts someone who has not texted first", async () => {
  const s = setup();
  assert.equal(await s.crew.runScoutNow("+19995550000"), false);
  assert.equal(await s.crew.sendQuizNow("+19995550000"), false);
  assert.equal(s.messenger.sent.length, 0);
});

test("YES / letters with nothing pending get a clarifier, not an action", async () => {
  const s = setup();
  await s.crew.onInbound(ME, { text: "Hi" });
  await s.crew.onInbound(ME, { text: "yes" });
  assert.equal(s.last(), "Nothing to confirm right now.");
  await s.crew.onInbound(ME, { text: "B" });
  assert.match(s.last()!, /don't have a question open/);
  assert.equal(s.calendar.events.length, 0);
});

test("a non-choice letter while a quiz is open asks for A, B or C", async () => {
  const s = setup();
  await toQuiz(s);
  await s.crew.onInbound(ME, { text: "d" });
  assert.equal(s.last(), "Reply A, B or C.");
  assert.equal((await s.store.load(ME))!.pendingQuiz!.attempts, 0);
});

test("daily cap: 3 quizzes, then no more (until the next day)", async () => {
  const s = setup();
  await s.crew.onInbound(ME, { text: "Hi" });
  await s.crew.switchToWeek6(ME);
  const results = [];
  for (let i = 0; i < 4; i++) results.push(await s.crew.sendQuizNow(ME));
  assert.deepEqual(results, [true, true, true, false]);
  s.clock.advance(24 * 3600_000);
  assert.equal(await s.crew.sendQuizNow(ME), true);
});

test("quiet hours block quizzes; demo bypass allows them", async () => {
  const s = setup({ clock: new Date("2026-11-15T23:30:00-05:00") });
  await s.crew.onInbound(ME, { text: "Hi" });
  await s.crew.switchToWeek6(ME);
  assert.equal(await s.crew.sendQuizNow(ME), false);
  s.crew.setBypass(true);
  assert.equal(await s.crew.sendQuizNow(ME), true);
});

test("LLM down or slow: every reply still goes out using fallback wording", async () => {
  const s = setup({ llm: new FakeLLM({}, true) });
  await toQuiz(s);
  await s.crew.onInbound(ME, { text: "B" });
  assert.match(s.messenger.texts().at(-2)!, /^Not quite\. If borrowing gets more expensive/);
  assert.match(s.last()!, /Reply YES or NO\.$/);
});

test("LLM guards: a follow-up that leaks the answer, or a proposal that is malformed, is replaced", async () => {
  const llm = new FakeLLM({ socratic: "The answer is Falls, obviously.", proposal: "Sure, I'll book something for you." });
  const s = setup({ llm });
  await toQuiz(s);
  await s.crew.onInbound(ME, { text: "B" });
  assert.match(s.messenger.texts().at(-2)!, /^Not quite\. If borrowing/);
  assert.match(s.last()!, /Tuesday\? Reply YES or NO\.$/);
});

test("a good LLM follow-up is used", async () => {
  const llm = new FakeLLM({ socratic: "Think about a firm deciding whether to borrow for a new plant. Would it go ahead?" });
  const s = setup({ llm });
  await toQuiz(s);
  await s.crew.onInbound(ME, { text: "B" });
  assert.equal(s.messenger.texts().at(-2), "Not quite. Think about a firm deciding whether to borrow for a new plant. Would it go ahead?");
});

test("dashboard Approve uses the same path, and approving twice writes once", async () => {
  const s = setup();
  await toQuiz(s);
  await s.crew.onInbound(ME, { text: "B" });
  await s.crew.approveFromDashboard(ME, "prop_1");
  await s.crew.approveFromDashboard(ME, "prop_1");
  await s.crew.onInbound(ME, { text: "YES" }); // late YES after dashboard approval
  assert.equal(s.calendar.events.length, 1);
});

test("a calendar failure keeps the proposal pending and says so", async () => {
  const calendar = new FakeCalendar();
  let fail = true;
  const real = calendar.createEvent.bind(calendar);
  calendar.createEvent = async (e) => { if (fail) throw new Error("google down"); return real(e); };
  const s = setup({ calendar });
  await toQuiz(s);
  await s.crew.onInbound(ME, { text: "B" });
  await s.crew.onInbound(ME, { text: "YES" });
  assert.match(s.last()!, /couldn't add that to your calendar/);
  assert.equal((await s.store.load(ME))!.proposals[0]!.status, "pending");
  fail = false;
  await s.crew.onInbound(ME, { text: "YES" });
  assert.equal(calendar.events.length, 1);
});

test("rapid-fire replies are processed in order, not interleaved", async () => {
  const s = setup();
  await toQuiz(s);
  await Promise.all([s.crew.onInbound(ME, { text: "B" }), s.crew.onInbound(ME, { text: "C" })]);
  const st = (await s.store.load(ME))!;
  assert.equal(st.pendingQuiz, undefined); // second wrong answer revealed and closed it
  assert.ok(Math.abs(st.mastery.ch5! - 0.245) < 1e-9); // 0.5 -> 0.35 -> 0.245
});

test("'what should I focus on' is answered from code, no LLM", async () => {
  const s = setup();
  await toQuiz(s);
  const before = s.llm.calls.length;
  await s.crew.onInbound(ME, { text: "what should I focus on?" });
  assert.equal(s.last(), "Focus on Ch. 5: Interest rates: you're at 50%, and Exam 2 is 25% of your grade in 6 days.");
  assert.equal(s.llm.calls.length, before);
});

test("reset returns to Day 1 but keeps the thread open for proactive texts", async () => {
  const s = setup();
  await toQuiz(s);
  await s.crew.resetDemo(ME);
  const st = (await s.store.load(ME))!;
  assert.equal(st.phase, "day1");
  assert.equal(st.parsed, false);
  assert.equal(st.openedByStudent, true);
  assert.equal(st.proposals.length, 0);
});

test("hard rule: only approve.ts can write to a calendar", () => {
  const dir = new URL("./engine/", import.meta.url);
  const offenders = readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .filter((f) => /createEvent|CalendarWriter/.test(readFileSync(new URL(f, dir), "utf8")))
    .sort();
  assert.deepEqual(offenders, ["approve.ts", "crew.ts"]); // crew.ts only stores the writer and hands it to approve.ts
  const crew = readFileSync(new URL("crew.ts", dir), "utf8");
  assert.equal(/createEvent/.test(crew), false);
  for (const f of ["planner.ts", "tutor.ts", "scout.ts", "ctx.ts"]) {
    assert.equal(/calendar/i.test(readFileSync(new URL(f, dir), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")), false, `${f} must not reference a calendar`);
  }
});

test("switching state and resetting keep the Photon route, so texts still reach the phone", async () => {
  const s = setup();
  const route = { spaceId: "pho_spc_x", senderId: "pho_usr_y" };
  await s.crew.onInbound(ME, { text: "Hi", route });
  await s.crew.switchToWeek6(ME);
  assert.deepEqual((await s.store.load(ME))!.route, route);
  await s.crew.resetDemo(ME);
  assert.deepEqual((await s.store.load(ME))!.route, route);
});

test("by default the proposal uses the code's exact wording even if the model offers another", async () => {
  const llm = new FakeLLM({ proposal: "Based on your mastery, I propose a review on Tuesday. Reply YES or NO." });
  const s = setup({ llm, llmProposals: false });
  await toQuiz(s);
  await s.crew.onInbound(ME, { text: "B" });
  assert.equal(s.last(), "Exam 2 is 25% and chapter 5 is your weak spot. Want me to add 30 minutes of review on Tuesday? Reply YES or NO.");
  assert.equal(s.llm.calls.some((c) => c.task === "proposal"), false);
});

test("the quiz and the proposal agree on how far away the exam is, at any time of day", async () => {
  for (const when of ["2026-11-13T22:55:00-05:00", "2026-11-15T12:00:00-05:00", "2026-11-15T08:01:00-05:00"]) {
    const s = setup({ clock: new Date(when), llmProposals: false });
    await toQuiz(s);
    const st = (await s.store.load(ME))!;
    const exam = new Date(st.exams[0]!.date);
    assert.equal(weekdayName(exam, TZ), s.messenger.texts().at(-1)!.match(/before (\w+)\./)![1], when);
    await s.crew.onInbound(ME, { text: "what should I focus on?" });
    assert.match(s.last()!, /in 6 days\.$/, when);
  }
});
