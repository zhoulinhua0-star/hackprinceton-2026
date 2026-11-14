import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeCalendar, FakeLLM, FakeMessenger, FixedClock, MemoryStore } from "@syllabus-crew/core";
import type { ParsedSyllabus } from "@syllabus-crew/core";
import { Crew } from "./index.ts";

const TZ = "America/New_York";
const ME = "+15555550100";
const ROUTE = { spaceId: "pho_spc_x", senderId: "pho_usr_y" };
const SYLLABUS: ParsedSyllabus = {
  courseName: "LIT 101: Antiquity", instructor: null, term: "Fall 2026", termStartDate: "2026-09-02", notes: null,
  categories: [{ name: "Writing", weightPercent: 30 }],
  assessments: [{ name: "Essay #3", kind: "paper", category: "Writing", date: "2026-11-30", week: null, topics: ["Selections from The Book of Songs", "Homer, The Odyssey, Books 1–13", "Said, Orientalism, pp. 1-50"] }],
};
function llm() {
  const f = new FakeLLM();
  f.jsonByTask.write_questions = (user: string) => {
    const topic = user.match(/Reading \/ topic: (.*)/)![1]!;
    return { questions: [1, 2, 3, 4].map((n) => ({ prompt: `Main idea of ${topic}, part ${n}?`, correctAnswer: `Right ${n}`, distractors: [`Wrong a${n}`, `Wrong b${n}`], explanation: `Because ${n}.`, socratic: `Think about ${topic}, ${n}?`, confidence: "high" })) };
  };
  f.jsonByTask.verify_question = (user: string) => ({ answers: [...user.matchAll(/id=(\S+)\n[^\n]*\nA\) ([^\n]*)\nB\) ([^\n]*)\nC\) ([^\n]*)/g)].map((m) => ({ id: m[1]!, letter: (["A", "B", "C"] as const)[[m[2], m[3], m[4]].findIndex((c) => c!.startsWith("Right"))]! })) });
  return f;
}
async function setup(o: { at?: Date; sessionLength?: number } = {}) {
  const messenger = new FakeMessenger(), store = new MemoryStore(), clock = new FixedClock(o.at ?? new Date("2026-11-14T12:00:00-05:00"));
  const crew = new Crew({ store, messenger, llm: llm(), calendar: new FakeCalendar(), clock, tz: TZ, opts: { proposalDelayMs: 0, nextQuestionDelayMs: 0, sessionLength: o.sessionLength ?? 5 } });
  await crew.onInbound(ME, { text: "Hi", route: ROUTE });
  await crew.applySyllabus(ME, SYLLABUS);
  await crew.generateQuestions(ME);
  return { crew, messenger, store, last: () => messenger.sent.at(-1)!.text, texts: () => messenger.texts() };
}
type S = Awaited<ReturnType<typeof setup>>;
const pending = async (s: S) => { const st = (await s.store.load(ME))!; const q = st.questions.find((x) => x.id === st.pendingQuiz!.questionId)!; return { q, right: q.correct, wrong: (["A", "B", "C"] as const).find((l) => l !== q.correct)! }; };

test("a round keeps going by itself: right answer, then the next question, to the end and a summary", async () => {
  const s = await setup();
  await s.crew.onInbound(ME, { text: "quiz me" });
  assert.match(s.last(), /^Question 1 of 5 · /);
  for (let n = 2; n <= 5; n++) {
    await s.crew.onInbound(ME, { text: (await pending(s)).right });
    assert.match(s.texts().at(-2)!, /^Correct! /);
    assert.match(s.last(), new RegExp(`^Question ${n} of 5 · `)); // arrived without asking
  }
  await s.crew.onInbound(ME, { text: (await pending(s)).right });
  assert.match(s.texts().at(-2)!, /^Correct! /);
  assert.match(s.last(), /^That's the round\. 5 done, 5 right on the first try\. Weakest right now: .+ \(\d+%\)\. Say "quiz me" for another\.$/);
  const st = (await s.store.load(ME))!;
  assert.equal(st.session, undefined);
  assert.equal(st.pendingQuiz, undefined);
});

test("the quiz layout: progress header, the question, one choice per line, readable topic names", async () => {
  const s = await setup();
  await s.crew.onInbound(ME, { text: "quiz me" });
  assert.match(s.last(), /^Question 1 of 5 · (The Book of Songs|Homer, The Odyssey|Said, Orientalism)\n\nMain idea of .*\?\n\nA\) .*\nB\) .*\nC\) .*\n\nStuck\? Just text "hint" and I'll give you a nudge\.$/);
  assert.doesNotMatch(s.last().split("\n")[0]!, /Selections from|pp\. |through/); // the header uses the short name
  assert.doesNotMatch(s.last(), /before \w+day/);
});

test("a wrong first answer gets the hint and waits; the retry then moves the round on", async () => {
  const s = await setup();
  await s.crew.onInbound(ME, { text: "quiz me" });
  await s.crew.onInbound(ME, { text: (await pending(s)).wrong });
  assert.match(s.texts().find((t) => /^Not quite/.test(t))!, /^Not quite\. Think about /);
  assert.doesNotMatch(s.last(), /^Question 2/); // no new question yet: they are still on this one
  assert.equal((await s.store.load(ME))!.pendingQuiz!.attempts, 1);
  await s.crew.onInbound(ME, { text: (await pending(s)).right });
  assert.match(s.texts().at(-2)!, /^Correct! /);
  assert.match(s.last(), /^Question 2 of 5 · /);
  assert.equal((await s.store.load(ME))!.session!.firstTry, 0); // got it, but not on the first try
});

test("two misses reveal the answer and the round moves on", async () => {
  const s = await setup();
  await s.crew.onInbound(ME, { text: "quiz me" });
  await s.crew.onInbound(ME, { text: (await pending(s)).wrong });
  const { q } = await pending(s);
  await s.crew.onInbound(ME, { text: (["A", "B", "C"] as const).find((l) => l !== q.correct)! });
  assert.match(s.texts().at(-2)!, /^The answer is [ABC]\) /);
  assert.match(s.last(), /^Question 2 of 5 · /);
});

test("'stop' leaves the round; the open question can still be answered, without a new one following", async () => {
  const s = await setup();
  await s.crew.onInbound(ME, { text: "quiz me" });
  await s.crew.onInbound(ME, { text: "stop" });
  assert.equal(s.last(), `Okay, that's enough for now. Say "quiz me" whenever you want more.`);
  assert.equal((await s.store.load(ME))!.session, undefined);
  await s.crew.onInbound(ME, { text: (await pending(s)).right });
  assert.match(s.last(), /^Correct! /); // nothing after it
});

test("'skip' passes on a question and, in a round, the next one arrives", async () => {
  const s = await setup();
  await s.crew.onInbound(ME, { text: "quiz me" });
  const first = (await s.store.load(ME))!.pendingQuiz!.questionId;
  await s.crew.onInbound(ME, { text: "skip" });
  assert.equal(s.texts().at(-2), "Skipped.");
  assert.match(s.last(), /^Question 2 of 5 · /);
  const st = (await s.store.load(ME))!;
  assert.ok(st.askedQuestionIds.includes(first));
  assert.notEqual(st.pendingQuiz!.questionId, first);
});

test("a quiz the student asks for ignores quiet hours and the daily cap, all the way through the round", async () => {
  const s = await setup({ at: new Date("2026-11-15T02:00:00-05:00"), sessionLength: 5 });
  await s.crew.onInbound(ME, { text: "quiz me" });
  assert.match(s.last(), /^Question 1 of 5/); // 2am, and the agent texts back: they asked
  for (let n = 0; n < 4; n++) await s.crew.onInbound(ME, { text: (await pending(s)).right });
  assert.match(s.last(), /^Question 5 of 5/); // past the 3-a-day limit, still going
  assert.equal((await s.store.load(ME))!.counters.quizzes, 5);
});

test("the round ends early, with a summary, when the questions run out", async () => {
  const s = await setup({ sessionLength: 20 }); // asks for more than exist (9)
  await s.crew.onInbound(ME, { text: "quiz me" });
  for (let n = 0; n < 9; n++) await s.crew.onInbound(ME, { text: (await pending(s).catch(() => null))?.right ?? "A" });
  assert.match(s.last(), /^That's the round\. 9 done, 9 right on the first try\./);
  assert.equal((await s.store.load(ME))!.session, undefined);
});

test("the round summary names the weakest topic by mastery", async () => {
  const s = await setup({ sessionLength: 2 });
  await s.crew.onInbound(ME, { text: "quiz me" });
  await s.crew.onInbound(ME, { text: (await pending(s)).wrong });
  await s.crew.onInbound(ME, { text: (await pending(s)).right }); // second try right
  await s.crew.onInbound(ME, { text: (await pending(s)).right });
  assert.match(s.last(), /^That's the round\. 2 done, 1 right on the first try\. Weakest right now: .+ \(\d+%\)\. Say "quiz me" for another\.$/);
});

test("the agent never starts a round on its own: Scout-style quizzes are single questions with no follow-up", async () => {
  const s = await setup();
  await s.crew.sendQuizNow(ME); // the demo control: a single question, not a round
  assert.doesNotMatch(s.last(), /^Question \d of/);
  assert.match(s.last(), /^Quick one · /);
  await s.crew.onInbound(ME, { text: (await pending(s)).right });
  assert.match(s.texts().at(-2)!, /^Correct! /);
  assert.match(s.last(), /^(\d+ more are|One more is) ready( on .+)?\. Want (them|it)\? Reply YES\.$/); // an offer, not a question: nothing starts without a YES
  assert.equal((await s.store.load(ME))!.session, undefined);
  assert.equal((await s.store.load(ME))!.pendingQuiz, undefined);
});

test("natural ways of asking for more start a round when nothing is open", async () => {
  for (const phrase of ["next", "more", "again", "keep going", "Another question?"]) {
    const s = await setup();
    await s.crew.onInbound(ME, { text: phrase });
    assert.match(s.last(), /^Question 1 of 5 · /, phrase);
  }
});

test("a mistyped or decorated answer still counts, and a stray short reply asks for A, B or C", async () => {
  const s = await setup();
  await s.crew.onInbound(ME, { text: "quiz me" });
  await s.crew.onInbound(ME, { text: `${(await pending(s)).right}\\` });
  assert.match(s.texts().at(-2)!, /^Correct! /);
  assert.match(s.last(), /^Question 2 of 5 · /);
  await s.crew.onInbound(ME, { text: "??" });
  assert.equal(s.last(), "Reply A, B or C.");
  assert.equal((await s.store.load(ME))!.pendingQuiz!.attempts, 0);
});

test("'I don't know' is a miss: a hint the first time, the answer the second, then the round moves on", async () => {
  const s = await setup();
  await s.crew.onInbound(ME, { text: "quiz me" });
  const first = (await s.store.load(ME))!;
  const topic = first.questions.find((q) => q.id === first.pendingQuiz!.questionId)!.topicId;
  const before = first.mastery[topic] ?? 0.5;
  await s.crew.onInbound(ME, { text: "I do not know" });
  assert.match(s.last(), /^Not quite\. Think about /); // the hint, not small talk; no proposal mid-round (#108)
  const mid = (await s.store.load(ME))!;
  assert.equal(mid.pendingQuiz!.attempts, 1);
  assert.ok((mid.mastery[topic] ?? 0.5) < before); // it counted as a miss
  await s.crew.onInbound(ME, { text: "idk" });
  assert.match(s.texts().at(-2)!, /^The answer is [ABC]\) /);
  assert.match(s.last(), /^Question 2 of 5 · /);
});

test("a hint request gives the hint for free: no miss, the question stays open", async () => {
  const s = await setup();
  await s.crew.onInbound(ME, { text: "quiz me" });
  const before = (await s.store.load(ME))!;
  await s.crew.onInbound(ME, { text: "hint" });
  assert.match(s.last(), /^Hint: Think about /);
  const after = (await s.store.load(ME))!;
  assert.deepEqual(after.mastery, before.mastery);
  assert.equal(after.pendingQuiz!.attempts, 0);
  assert.equal(after.pendingQuiz!.hinted, true);
});

test("the hint tip appears once: on the first question of a round, and on one-off quizzes, not on every question", async () => {
  const s = await setup();
  await s.crew.onInbound(ME, { text: "quiz me" });
  assert.match(s.last(), /Stuck\? Just text "hint"/);
  await s.crew.onInbound(ME, { text: (await pending(s)).right });
  assert.match(s.last(), /^Question 2 of 5/);
  assert.doesNotMatch(s.last(), /Stuck\?/);
  const single = await setup();
  await single.crew.sendQuizNow(ME);
  assert.match(single.last(), /^Quick one · .*Stuck\? Just text "hint"/s);
});

test("'idk' right after a hint is giving up: the answer is revealed and the round moves on (no second hint)", async () => {
  const s = await setup();
  await s.crew.onInbound(ME, { text: "quiz me" });
  await s.crew.onInbound(ME, { text: "hint" });
  assert.match(s.last(), /^Hint: /);
  await s.crew.onInbound(ME, { text: "idk" });
  const tail = s.texts().slice(-2); // the reveal, then the next question (the Planner waits for the recap, #108)
  assert.match(tail[0]!, /^The answer is [ABC]\) /);
  assert.match(tail[1]!, /^Question 2 of 5 · /);
  assert.equal(s.texts().filter((t) => /^Not quite/.test(t)).length, 0); // never a second hint
});

test("'not sure' while a proposal is waiting is about the proposal, not the quiz", async () => {
  const s = await setup();
  await s.crew.sendQuizNow(ME); // a single question: proposals never come mid-round
  await s.crew.onInbound(ME, { text: (await pending(s)).wrong }); // a miss: hint, and a proposal follows
  assert.match(s.last(), /Reply YES or NO\.$/);
  await s.crew.onInbound(ME, { text: "not sure" });
  assert.match(s.last(), /Reply YES to add it to your calendar, or NO to skip it/);
  assert.equal((await s.store.load(ME))!.pendingQuiz!.attempts, 1); // the quiz was not touched
});

test("'I don't know' with no question open is ordinary chat", async () => {
  const s = await setup();
  await s.crew.onInbound(ME, { text: "I do not know" });
  assert.doesNotMatch(s.last(), /^Not quite|^The answer is/);
});

test("'skip' with a question AND a proposal open skips the question, not the proposal", async () => {
  const s = await setup();
  await s.crew.sendQuizNow(ME); // a single question: proposals never come mid-round
  await s.crew.onInbound(ME, { text: (await pending(s)).wrong }); // a miss: hint + a study-block proposal is now waiting
  assert.match(s.last(), /Reply YES or NO\.$/);
  const before = (await s.store.load(ME))!;
  await s.crew.onInbound(ME, { text: "skip" });
  const after = (await s.store.load(ME))!;
  assert.ok(after.askedQuestionIds.includes(before.pendingQuiz!.questionId)); // the question was skipped
  assert.equal(after.proposals.find((p) => p.status === "pending")?.id, before.proposals.find((p) => p.status === "pending")!.id); // the proposal is still waiting
  assert.equal(s.last(), "Skipped.");
  await s.crew.onInbound(ME, { text: "no" }); // NO answers the proposal
  assert.equal((await s.store.load(ME))!.proposals.some((p) => p.status === "pending"), false);
});

test("'skip' with only a proposal waiting declines it", async () => {
  const s = await setup();
  await s.crew.sendQuizNow(ME);
  await s.crew.onInbound(ME, { text: (await pending(s)).wrong });
  const st = (await s.store.load(ME))!; st.pendingQuiz = undefined; await s.store.save(st); // answered elsewhere: only the proposal is left
  await s.crew.onInbound(ME, { text: "skip" });
  assert.ok(s.texts().includes("No problem, I won't add it.")); // then the follow-up (#108)
});
