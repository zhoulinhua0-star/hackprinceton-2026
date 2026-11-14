// Tap-to-open cards (DECISIONS #106): one short line, then the link; updates reuse the link; a broken store never blocks a reply.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeCalendar, FakeCaller, FakeCardStore, FakeLLM, FakeMessenger, FixedClock, MemoryStore } from "@syllabus-crew/core";
import type { Card, ParsedSyllabus, RoundCard, SemesterCard, WeekCard, DrillCard } from "@syllabus-crew/core";
import { Crew } from "./index.ts";

const TZ = "America/New_York";
const ME = "+15555550100";
const ROUTE = { spaceId: "pho_spc_x", senderId: "pho_usr_y" };
const NOW = new Date("2026-11-14T12:00:00-05:00");
const LINK = /^https:\/\/cards\.test\/c\/[A-Za-z0-9]{24}$/;

const SYLLABUS: ParsedSyllabus = {
  courseName: "ECON 201", instructor: "Prof. Lee", term: "Fall 2026", termStartDate: null, notes: null,
  categories: [{ name: "Exam 1", weightPercent: 15 }, { name: "Final", weightPercent: 30 }],
  assessments: [
    { name: "Exam 1", kind: "exam", category: "Exam 1", date: "2026-11-20", week: null, topics: ["Ch. 1"] },
    { name: "Final", kind: "exam", category: "Final", date: null, week: null, topics: ["cumulative"] },
  ],
};

function setup(o: { store?: boolean } = {}) {
  const messenger = new FakeMessenger(), store = new MemoryStore(), cards = new FakeCardStore(), caller = new FakeCaller();
  const llm = new FakeLLM();
  llm.jsonByTask.write_drill = { question: "Why does a rate hike cut investment?", keyPoints: ["borrowing costs more", "fewer projects pay off", "investment falls"] };
  llm.jsonByTask.grade_drill = { covered: [0, 2], feedback: "You nailed the borrowing cost; the missing piece is why fewer projects pay off." };
  const crew = new Crew({ store, messenger, llm, calendar: new FakeCalendar(), clock: new FixedClock(NOW), tz: TZ, caller,
    ...(o.store === false ? {} : { cards }), opts: { proposalDelayMs: 0, nextQuestionDelayMs: 0, bypassLimits: true, dashboardUrl: "http://localhost:3000" } });
  const texts = () => messenger.texts();
  const card = <T extends Card>(url: string) => cards.cards.get(url.split("/").pop()!) as T;
  return { crew, messenger, store, cards, caller, texts, card, last: () => texts().at(-1)!, say: (text: string) => crew.onInbound(ME, { text }) };
}

test("syllabus read: the summary without the localhost link, then the semester card; the open question shows on it", async () => {
  const s = setup();
  await s.crew.onInbound(ME, { text: "Hi", route: ROUTE });
  await s.say("skip"); await s.say("skip"); await s.say("Macro");
  const before = s.texts().length;
  await s.crew.applySyllabus(ME, SYLLABUS);
  const sent = s.texts().slice(before);
  assert.doesNotMatch(sent[0]!, /localhost/);
  assert.match(sent[1]!, LINK);
  const c = s.card<SemesterCard>(sent[1]!);
  assert.equal(c.kind, "semester");
  assert.equal(c.course, "ECON 201");
  assert.ok(c.items.some((i) => i.name === "Exam 1" && i.focus), "the worry marks the exam ahead");
  assert.equal(c.ask, "When is Final?");
  assert.doesNotMatch(JSON.stringify(c), /5555550100|pho_/); // no phone number, no Photon ids on a public page
  // Answering the question updates the same card and sends no new link.
  const n = s.texts().length;
  await s.say("December 16");
  assert.equal(s.texts().slice(n).filter((t) => LINK.test(t)).length, 0);
  const updated = s.card<SemesterCard>(sent[1]!);
  assert.equal(updated.ask, undefined);
  assert.ok(updated.items.some((i) => i.name === "Final" && i.dateISO));
});

test("each card carries the line this student texts, for its reply buttons; none known, none written", async () => {
  const s = setup();
  await s.crew.onInbound(ME, { text: "Hi", route: { ...ROUTE, line: "+15555550177" } });
  await s.say("skip"); await s.say("skip"); await s.say("Macro");
  const before = s.texts().length;
  await s.crew.applySyllabus(ME, SYLLABUS);
  const link = s.texts().slice(before).find((t) => LINK.test(t))!;
  assert.equal(s.card<SemesterCard>(link).line, "+15555550177");

  const t = setup();
  await t.crew.onInbound(ME, { text: "Hi", route: ROUTE });
  await t.say("skip"); await t.say("skip"); await t.say("Macro");
  const b2 = t.texts().length;
  await t.crew.applySyllabus(ME, SYLLABUS);
  assert.equal(t.card<SemesterCard>(t.texts().slice(b2).find((x) => LINK.test(x))!).line, undefined);
});

test("TESTERS get the demo student's treatment; everyone else keeps the limits", async () => {
  const { bypassFor } = await import("./engine/ctx.ts");
  const deps = { opts: { bypassLimits: ["+15555550100", "+15555550111"] } } as Parameters<typeof bypassFor>[0];
  assert.equal(bypassFor(deps, "+15555550111"), true);
  assert.equal(bypassFor(deps, "+15555550222"), false);
});

test("no card store: the old text with the dashboard link, nothing else", async () => {
  const s = setup({ store: false });
  await s.crew.onInbound(ME, { text: "Hi", route: ROUTE });
  await s.say("skip"); await s.say("skip"); await s.say("skip");
  await s.crew.applySyllabus(ME, SYLLABUS);
  assert.ok(s.texts().some((t) => t.includes("Here's your semester: http://localhost:3000")));
  assert.ok(!s.texts().some((t) => LINK.test(t)));
});

test("a broken card store never blocks a reply: the text still goes out, with the dashboard link", async () => {
  const s = setup();
  s.cards.fail = true;
  await s.crew.onInbound(ME, { text: "Hi", route: ROUTE });
  await s.say("skip"); await s.say("skip"); await s.say("skip");
  await s.crew.applySyllabus(ME, SYLLABUS);
  assert.ok(s.texts().some((t) => t.includes("Here's your semester: http://localhost:3000")));
});

test("proposal: the text, then the week card; YES turns the same card to booked", async () => {
  const s = setup();
  await s.crew.onInbound(ME, { hasImage: true, route: ROUTE });
  await s.crew.switchToWeek6(ME);
  await s.crew.runScoutNow(ME); // Scout finds slides, Tutor sends a quiz
  const st = (await s.store.load(ME))!;
  const q = st.questions.find((x) => x.id === st.pendingQuiz!.questionId)!;
  await s.say(q.correct === "A" ? "B" : "A"); // a miss on the weak topic: hint, then the Planner proposes
  const link = s.last();
  assert.match(link, LINK);
  const w = s.card<WeekCard>(link);
  assert.equal(w.kind, "week");
  assert.equal(w.status, "pending");
  assert.ok(w.why.length >= 2);
  // Moving it: the "Moved" text, then the same card again under a new version, so iMessage draws the new time.
  await s.say(q.correct); // settle the open question first: a move is only read when no question is open
  await s.say("make it Monday at 2pm");
  assert.match(s.texts().at(-2)!, /^Moved: /);
  assert.match(s.last(), new RegExp(`^${link}\\?v=[a-z0-9]+$`));
  await s.say("YES");
  const i = s.texts().lastIndexOf(`${link}?v=booked`);
  assert.ok(i > 0, "the booked card was sent"); // the payoff picture: solid and "Booked"
  assert.match(s.texts()[i - 1]!, /^Done\./);
  assert.equal(s.card<WeekCard>(link).status, "approved");
});

test("a finished round: one short line, then the round card with the miss explained and mastery before/after", async () => {
  const s = setup();
  await s.crew.onInbound(ME, { hasImage: true, route: ROUTE });
  await s.crew.switchToWeek6(ME);
  await s.crew.runScoutNow(ME);
  await s.say("skip"); // leave Scout's one-off question
  await s.say("NO"); // and the Planner's proposal, if one came
  await s.say("quiz me");
  for (let i = 0; i < 12 && (await s.store.load(ME))!.session; i++) {
    const st = (await s.store.load(ME))!;
    const q = st.questions.find((x) => x.id === st.pendingQuiz?.questionId);
    if (!q) break;
    await s.say(st.session!.asked === 1 && st.pendingQuiz!.attempts === 0 ? (q.correct === "A" ? "B" : "A") : q.correct);
  }
  const link = s.last();
  assert.match(link, LINK);
  assert.match(s.texts().at(-2)!, /^That's the round: \d of \d on the first try\.$/);
  const r = s.card<RoundCard>(link);
  assert.equal(r.kind, "round");
  assert.equal(r.right, r.total - 1);
  const miss = r.questions.find((q) => !q.firstTry)!;
  assert.ok(miss.chose && miss.correct && miss.explanation);
  assert.ok(r.mastery.length >= 1);
});

test("a graded voice drill: the feedback line, then the drill card with the answer; no long recap", async () => {
  const s = setup();
  await s.crew.onInbound(ME, { hasImage: true, route: ROUTE });
  await s.crew.switchToWeek6(ME);
  await s.say("CALL");
  const call = s.caller.calls[0]!;
  s.caller.finish(call.callId, { state: "done", answered: true, durationSecs: 161, transcript: [
    { role: "agent", text: "Why does a rate hike cut investment?" }, { role: "user", text: "Because borrowing costs more, so companies invest less." },
  ] });
  await s.crew.checkDrills(ME);
  const link = s.texts().findLast((t) => LINK.test(t))!; // the photo already brought a semester card
  assert.ok(link);
  const i = s.texts().lastIndexOf(link);
  assert.equal(s.texts()[i - 1], "You nailed the borrowing cost; the missing piece is why fewer projects pay off.");
  const d = s.card<DrillCard>(link);
  assert.deepEqual([d.covered, d.missed], [["borrowing costs more", "investment falls"], ["fewer projects pay off"]]);
  assert.equal(d.answer, "borrowing costs more. fewer projects pay off. investment falls.");
  assert.equal(d.durationSecs, 161);
  assert.ok(!s.texts().some((t) => t.startsWith("Voice drill,")));
});

// ---------- regressions from the real phone (Nov 14) ----------
test("the chat model never sees card URLs, so it can't claim 'your quiz is at that link'", async () => {
  const s = setup();
  const llm = (s.crew as unknown as { deps: { llm: FakeLLM } }).deps.llm;
  await s.crew.onInbound(ME, { text: "Hi", route: ROUTE });
  await s.say("skip"); await s.say("skip"); await s.say("skip");
  await s.crew.applySyllabus(ME, SYLLABUS);
  assert.ok(s.texts().some((t) => LINK.test(t)));
  await s.say("December 16"); // the open syllabus question first
  await s.say("tell me something fun about economics");
  const call = llm.calls.filter((c) => c.task === "smalltalk").at(-1)!;
  assert.doesNotMatch(call.user, /https?:\/\//);
  assert.match(call.user, /tap-to-open card/);
});

test("'where is my quiz' asks for a quiz: the open one again, or a new one", async () => {
  const s = setup();
  await s.crew.onInbound(ME, { hasImage: true, route: ROUTE });
  await s.crew.switchToWeek6(ME);
  await s.crew.runScoutNow(ME);
  await s.say("Where is my quiz");
  assert.match(s.last(), /^Still waiting on this one:/);
  const st = (await s.store.load(ME))!;
  await s.say(st.questions.find((x) => x.id === st.pendingQuiz!.questionId)!.correct);
  await s.say("NO");
  await s.say("give me a quiz");
  assert.match(s.last(), /\nA\)|A\) /);
});

test("a screenshot after the syllabus is in: no 'send a PDF' reply; the next text goes to the model with the image", async () => {
  const s = setup();
  const llm = (s.crew as unknown as { deps: { llm: FakeLLM } }).deps.llm;
  await s.crew.onInbound(ME, { hasImage: true, route: ROUTE }); // the staged syllabus: parsed
  const n = s.texts().length;
  await s.crew.onInbound(ME, { hasImage: true, file: async () => ({ mediaType: "image/png", base64: "iVBORw0KGgo=" }) });
  assert.equal(s.texts().length, n, "nothing sent yet: waiting for the text that goes with it");
  await s.say("but here you said you added a few questions?");
  const call = llm.calls.filter((c) => c.task === "smalltalk").at(-1)!;
  assert.equal(call.images, 1);
  assert.match(call.user, /attached screenshot/);
  assert.ok(!s.texts().some((t) => /can't read photos/.test(t)));
});

test("Week 6 round: questions say 'Question n of 5', not 'Quick one'", async () => {
  const s = setup();
  await s.crew.onInbound(ME, { hasImage: true, route: ROUTE });
  await s.crew.switchToWeek6(ME);
  await s.say("quiz me");
  assert.match(s.last(), /^Question 1 of \d · /);
});

test("after 'stop', answering the open question offers nothing more", async () => {
  const s = setup();
  await s.crew.onInbound(ME, { hasImage: true, route: ROUTE });
  await s.crew.switchToWeek6(ME);
  await s.say("quiz me");
  await s.say("stop");
  const st = (await s.store.load(ME))!;
  await s.say(st.questions.find((x) => x.id === st.pendingQuiz!.questionId)!.correct);
  assert.match(s.last(), /^Correct!/);
  assert.equal((await s.store.load(ME))!.pendingOffer, undefined);
});

// ---------- #108: the conversation keeps moving after YES/NO; proposals never interrupt a round ----------
async function week6Miss(s: ReturnType<typeof setup>) {
  await s.crew.onInbound(ME, { hasImage: true, route: ROUTE });
  await s.crew.switchToWeek6(ME);
  await s.crew.runScoutNow(ME);
  const st = (await s.store.load(ME))!;
  const q = st.questions.find((x) => x.id === st.pendingQuiz!.questionId)!;
  await s.say(q.correct === "A" ? "B" : "A"); // a miss: hint, then the proposal
  return q;
}

test("NO: Syl brings the open question straight back, and doesn't propose the same thing again that day", async () => {
  const s = setup();
  const q = await week6Miss(s);
  await s.say("NO");
  assert.equal(s.texts().at(-2), "No problem, I won't add it.");
  assert.match(s.last(), /^Back to the question:\n\nQuick one on chapter 5/);
  await s.say("idk"); // give up: the answer is revealed; chapter 5 is still weak
  assert.match(s.texts().join("\n"), new RegExp(`The answer is ${q.correct}\\)`));
  assert.ok(!s.texts().slice(-3).some((t) => /Reply YES or NO\.$/.test(t)), "no second proposal right after a NO");
  assert.equal((await s.store.load(ME))!.proposals.filter((p) => p.status === "pending").length, 0);
});

test("YES: after the booked card, the open question comes back", async () => {
  const s = setup();
  await week6Miss(s);
  await s.say("YES");
  assert.match(s.last(), /^Back to the question:/);
});

test("inside a round, a miss gets the hint only; the Planner's proposal waits for the recap", async () => {
  const s = setup();
  await s.crew.onInbound(ME, { hasImage: true, route: ROUTE });
  await s.crew.switchToWeek6(ME);
  await s.say("quiz me");
  for (let i = 0; i < 15 && (await s.store.load(ME))!.session; i++) {
    const st = (await s.store.load(ME))!;
    const q = st.questions.find((x) => x.id === st.pendingQuiz?.questionId);
    if (!q) break;
    await s.say("idk"); // miss everything: hint, then the answer
    assert.ok(!/Reply YES or NO\.$/.test(s.last()) || !(await s.store.load(ME))!.session, "no proposal while the round is running");
  }
  const t = s.texts();
  const recap = t.findIndex((x) => /^That's the round/.test(x));
  assert.ok(recap > 0);
  assert.ok(t.slice(recap).some((x) => /Reply YES or NO\.$/.test(x)), "the proposal comes after the recap");
  assert.ok(!t.slice(0, recap).some((x) => /Reply YES or NO\.$/.test(x)));
});
