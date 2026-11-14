import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeCalendar, FakeLLM, FakeMessenger, FixedClock, MemoryStore } from "@syllabus-crew/core";
import type { ParsedSyllabus } from "@syllabus-crew/core";
import { Crew } from "./index.ts";
import { courseShort } from "./engine/planner.ts";

const TZ = "America/New_York";
const ME = "+15555550100";
const ROUTE = { spaceId: "pho_spc_x", senderId: "pho_usr_y" };
const NOW = new Date("2026-11-14T12:00:00-05:00");

const SYLLABUS: ParsedSyllabus = {
  courseName: "LIT 101: Antiquity", instructor: null, term: "Fall 2026", termStartDate: "2026-09-02", notes: null,
  categories: [{ name: "Writing", weightPercent: 30 }, { name: "Final", weightPercent: 30 }],
  assessments: [
    { name: "Essay #3", kind: "paper", category: "Writing", date: "2026-11-30", week: null, topics: ["Reading A", "Reading B", "Reading C"] },
    { name: "Final Exam", kind: "exam", category: "Final", date: "2026-12-07", week: null, topics: ["cumulative"] },
  ],
};

/** A model that writes 3 questions per topic ("Right <topic> n" is the correct answer) and a checker that finds it. */
function scriptedLlm(o: { badCheckOn?: (id: string) => boolean; fail?: boolean; lowConfidence?: boolean; delayMs?: number } = {}) {
  const llm = new FakeLLM();
  llm.jsonByTask.write_questions = async (user: string) => {
    if (o.fail) throw new Error("bedrock down");
    if (o.delayMs) await new Promise((r) => setTimeout(r, o.delayMs));
    const topic = user.match(/Reading \/ topic: (.*)/)![1]!;
    return { questions: [1, 2, 3, 4].map((n) => ({
      prompt: `What is the main idea of ${topic}, part ${n}?`, correctAnswer: `Right ${topic} ${n}`, distractors: [`Wrong one ${n}`, `Wrong two ${n}`],
      explanation: `Because ${topic} says so.`, socratic: `What does ${topic} emphasise, ${n}?`, confidence: o.lowConfidence ? "low" : "high" })) };
  };
  llm.jsonByTask.verify_question = (user: string) => ({
    answers: [...user.matchAll(/id=(\S+)\n[^\n]*\nA\) ([^\n]*)\nB\) ([^\n]*)\nC\) ([^\n]*)/g)].map((m) => {
      const letter = [m[2], m[3], m[4]].findIndex((c) => c!.startsWith("Right"));
      const right = (["A", "B", "C"] as const)[letter]!;
      return { id: m[1]!, letter: o.badCheckOn?.(m[1]!) ? (right === "A" ? "B" : "A") : right };
    }),
  });
  return llm;
}

function setup(o: { llm?: FakeLLM; at?: Date } = {}) {
  const messenger = new FakeMessenger(), calendar = new FakeCalendar(), store = new MemoryStore(), clock = new FixedClock(o.at ?? NOW);
  const crew = new Crew({ store, messenger, llm: o.llm ?? scriptedLlm(), calendar, clock, tz: TZ, opts: { proposalDelayMs: 0, nextQuestionDelayMs: 0, dashboardUrl: "http://localhost:3000" } });
  return { crew, messenger, calendar, store, last: () => messenger.sent.at(-1)!.text, texts: () => messenger.texts() };
}
const live = async (s: ReturnType<typeof setup>) => { await s.crew.onInbound(ME, { text: "Hi", route: ROUTE }); await s.crew.applySyllabus(ME, SYLLABUS); };
async function until(cond: () => Promise<boolean>) { for (let i = 0; i < 200; i++) { if (await cond()) return; await new Promise((r) => setTimeout(r, 5)); } throw new Error("timed out"); }

test("generation writes verified questions for the topics that matter, unlocks them, and tells the student", async () => {
  const s = setup();
  await live(s);
  const r = await s.crew.generateQuestions(ME, { announce: true });
  assert.deepEqual(r, { started: true, added: 9 }); // 3 readings x 3; "cumulative" is skipped
  const st = (await s.store.load(ME))!;
  assert.equal(st.questions.length, 9);
  assert.equal(st.unlockedQuestionIds.length, 9);
  assert.equal(st.questionsStatus, "ready");
  assert.ok(st.questions.every((q) => q.generated && q.choices[q.correct].startsWith("Right")));
  assert.equal(s.last(), 'I wrote 9 practice questions for your upcoming work. Say "quiz me" whenever you want one.');
  assert.equal(new Set(st.questions.map((q) => q.id)).size, 9);
});

test("questions the independent check disagrees with are dropped", async () => {
  const s = setup({ llm: scriptedLlm({ badCheckOn: (id) => id.endsWith("-2") }) });
  await live(s);
  assert.equal((await s.crew.generateQuestions(ME)).added, 6);
  assert.equal((await s.store.load(ME))!.questions.some((q) => q.id.endsWith("-2")), false);
});

test("low-confidence questions are never kept", async () => {
  const s = setup({ llm: scriptedLlm({ lowConfidence: true }) });
  await live(s);
  const r = await s.crew.generateQuestions(ME, { announce: true });
  assert.equal(r.added, 0);
  assert.equal((await s.store.load(ME))!.questionsStatus, "failed");
  assert.doesNotMatch(s.last(), /practice question/);
});

test("a model outage fails quietly: status failed, no crash, no text", async () => {
  const s = setup({ llm: scriptedLlm({ fail: true }) });
  await live(s);
  const before = s.messenger.sent.length;
  assert.equal((await s.crew.generateQuestions(ME, { announce: true })).added, 0);
  assert.equal((await s.store.load(ME))!.questionsStatus, "failed");
  assert.equal(s.messenger.sent.length, before);
  // and the student can try again later
  const retry = setup({ llm: scriptedLlm() });
  await live(retry);
  assert.equal((await retry.crew.generateQuestions(ME)).added, 9);
});

test("only one writer runs at a time, and the student's replies are not held up meanwhile", async () => {
  const s = setup({ llm: scriptedLlm({ delayMs: 60 }) });
  await live(s);
  const first = s.crew.generateQuestions(ME);
  await new Promise((r) => setTimeout(r, 10));
  const second = await s.crew.generateQuestions(ME);
  assert.equal(second.reason, "already writing");
  const t = Date.now();
  await s.crew.onInbound(ME, { text: "what should I focus on?" }); // answered while the model is still working
  assert.ok(Date.now() - t < 50, "reply was blocked by the writer");
  assert.equal((await first).added, 9);
});

test("nothing real to write for a demo student, or when enough questions already exist", async () => {
  const s = setup();
  await s.crew.onInbound(ME, { text: "Hi", route: ROUTE });
  await s.crew.switchToWeek6(ME);
  assert.equal((await s.crew.generateQuestions(ME)).reason, "no real syllabus installed");
  await live(s);
  await s.crew.generateQuestions(ME);
  assert.equal((await s.crew.generateQuestions(ME)).reason, "nothing to write");
});

test("'quiz me' with no questions starts the writer, then the quiz uses the reading's name, and the loop continues", async () => {
  const s = setup();
  await live(s);
  await s.crew.onInbound(ME, { text: "quiz me" });
  assert.equal(s.last(), "I'm writing your first questions now. I'll text you when they're ready.");
  await until(async () => (await s.store.load(ME))!.questionsStatus === "ready");
  await until(async () => /practice questions/.test(s.last()));
  await s.crew.onInbound(ME, { text: "quiz me" });
  assert.match(s.last(), /^Question 1 of 5 · Reading [ABC]\n\nWhat is the main idea of Reading [ABC], part \d\?\n\nA\) .*\nB\) .*\nC\) .*\n\nStuck\? Just text "hint"/);

  const st = (await s.store.load(ME))!;
  const q = st.questions.find((x) => x.id === st.pendingQuiz!.questionId)!;
  const wrong = (["A", "B", "C"] as const).find((l) => l !== q.correct)!;
  await s.crew.onInbound(ME, { text: wrong });
  assert.match(s.texts().at(-2)!, /^Not quite\. What does Reading [ABC] emphasise, \d\?$/); // the model's hint, not the answer
  assert.doesNotMatch(s.texts().at(-2)!, /Right Reading/);
  assert.match(s.last(), /^Essay #3 is 30% and Reading [ABC] is your weak spot\. Want me to add 30 minutes of review on \w+day\? Reply YES or NO\.$/);
  await s.crew.onInbound(ME, { text: "YES" });
  assert.match(s.last(), /^Done\. \w+day \d:\d\d-\d:\d\d, Reading [ABC] review\.$/);
  assert.equal(s.calendar.events.length, 1);
  assert.match(s.calendar.events[0]!.title, /^LIT 101: Reading [ABC] review$/); // the short course name, not the long title
});

test("quiet hours suppress the announcement but not the saved questions", async () => {
  const s = setup({ at: new Date("2026-11-15T02:00:00-05:00") });
  await live(s);
  const before = s.messenger.sent.length;
  await s.crew.generateQuestions(ME, { announce: true });
  assert.equal((await s.store.load(ME))!.questions.length, 9);
  assert.equal(s.messenger.sent.length, before);
});

test("an answered question is not repeated until the rest have been asked", async () => {
  const s = setup();
  await live(s);
  await s.crew.generateQuestions(ME);
  s.crew.setBypass(true);
  const seen = new Set<string>();
  for (let i = 0; i < 9; i++) {
    await s.crew.sendQuizNow(ME);
    const st = (await s.store.load(ME))!;
    seen.add(st.pendingQuiz!.questionId);
  }
  assert.equal(seen.size, 9);
});

test("courseShort keeps the course code, drops the long title", () => {
  assert.equal(courseShort("LIT 101: Antiquity and Its Others"), "LIT 101");
  assert.equal(courseShort("Macro"), "Macro");
  assert.equal(courseShort(undefined), "Study");
  assert.equal(courseShort("A very long course name with no colon at all in it"), "A very long course name wit…");
});

test("startQuestions says at once whether the writer started, and why not", async () => {
  const s = setup();
  await s.crew.onInbound(ME, { text: "Hi", route: ROUTE });
  await s.crew.switchToWeek6(ME);
  assert.deepEqual(await s.crew.startQuestions(ME), { started: false, reason: "no real syllabus installed" }); // a demo state, not a real syllabus
  await live(s);
  let done = -1;
  assert.deepEqual(await s.crew.startQuestions(ME, {}, (d) => { done = d.added; }), { started: true });
  assert.equal((await s.store.load(ME))!.questionsStatus, "generating"); // already marked, writing continues behind the scenes
  await until(async () => done >= 0);
  assert.equal(done, 9);
  assert.deepEqual(await s.crew.startQuestions(ME), { started: false, reason: "nothing to write" });
});

test("proposals and calendar titles use the short reading name, not the raw page range", async () => {
  const s = setup();
  const named: ParsedSyllabus = { ...SYLLABUS, assessments: [{ ...SYLLABUS.assessments[0]!, topics: ["Said, Orientalism, 226-328", "Selections from The Book of Songs", "Homer, The Odyssey, Books 1–13"] }] };
  await s.crew.onInbound(ME, { text: "Hi", route: ROUTE });
  await s.crew.applySyllabus(ME, named);
  await s.crew.generateQuestions(ME);
  await s.crew.onInbound(ME, { text: "quiz me" });
  const st = (await s.store.load(ME))!;
  const q = st.questions.find((x) => x.id === st.pendingQuiz!.questionId)!;
  await s.crew.onInbound(ME, { text: (["A", "B", "C"] as const).find((l) => l !== q.correct)! });
  assert.match(s.last(), /^Essay #3 is 30% and (Said, Orientalism|The Book of Songs|Homer, The Odyssey) is your weak spot\./);
  assert.doesNotMatch(s.last(), /226-328|Selections from|Books 1/);
});
