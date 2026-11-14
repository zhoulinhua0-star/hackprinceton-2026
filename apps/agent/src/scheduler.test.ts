import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeCalendar, FakeLLM, FakeMessenger, FixedClock, MemoryStore } from "@syllabus-crew/core";
import type { ParsedSyllabus } from "@syllabus-crew/core";
import { Crew } from "./index.ts";

const TZ = "America/New_York";
const ME = "+15555550100";
const ROUTE = { spaceId: "pho_spc_x", senderId: "pho_usr_y" };
const at = (iso: string) => new Date(iso);
const SYLLABUS: ParsedSyllabus = {
  courseName: "LIT 101: Antiquity", instructor: null, term: "Fall 2026", termStartDate: "2026-09-02", notes: null,
  categories: [{ name: "Writing", weightPercent: 30 }],
  assessments: [{ name: "Essay #3", kind: "paper", category: "Writing", date: "2026-11-18", week: null, topics: ["The Book of Songs", "Homer, The Odyssey"] }],
};
function llm() {
  const f = new FakeLLM();
  f.jsonByTask.write_questions = (user: string) => { const topic = user.match(/Reading \/ topic: (.*)/)![1]!; return { questions: [1, 2, 3, 4].map((n) => ({ prompt: `Main idea of ${topic}, part ${n}?`, correctAnswer: `Right ${n}`, distractors: [`Wrong a${n}`, `Wrong b${n}`], explanation: `Because ${n}.`, socratic: `Think about ${topic}, ${n}?`, confidence: "high" })) }; };
  f.jsonByTask.verify_question = (user: string) => ({ answers: [...user.matchAll(/id=(\S+)\n[^\n]*\nA\) ([^\n]*)\nB\) ([^\n]*)\nC\) ([^\n]*)/g)].map((m) => ({ id: m[1]!, letter: (["A", "B", "C"] as const)[[m[2], m[3], m[4]].findIndex((c) => c!.startsWith("Right"))]! })) });
  return f;
}
async function setup(start = "2026-11-14T12:00:00-05:00", withQuestions = true) {
  const messenger = new FakeMessenger(), store = new MemoryStore(), clock = new FixedClock(at(start)), calendar = new FakeCalendar();
  const crew = new Crew({ store, messenger, llm: llm(), calendar, clock, tz: TZ, opts: { proposalDelayMs: 0, nextQuestionDelayMs: 0 } });
  await crew.onInbound(ME, { text: "Hi", route: ROUTE });
  await crew.applySyllabus(ME, SYLLABUS);
  if (withQuestions) await crew.generateQuestions(ME);
  messenger.sent.length = 0;
  const jump = (iso: string) => { clock.t = at(iso); };
  const weak = async () => { const st = (await store.load(ME))!; st.mastery = { [st.exams[0]!.topicIds[0]!]: 0.3 }; await store.save(st); };
  const quiet = async (ms = 31 * 60_000) => { clock.advance(ms); }; // let "the student is chatting" pass
  return { crew, messenger, store, clock, jump, weak, quiet, texts: () => messenger.texts(), last: () => messenger.sent.at(-1)!.text, state: async () => (await store.load(ME))! };
}
type S = Awaited<ReturnType<typeof setup>>;
const say = (s: S, text: string) => s.crew.onInbound(ME, { text });
const tickAt = async (s: S, iso: string, o = {}) => { s.jump(iso); return (await s.crew.tickStudent(ME, o))!; };

test("'remind me Sunday to start the essay' is understood, confirmed, and stored", async () => {
  const s = await setup();
  await say(s, "remind me Sunday to start the essay");
  assert.equal(s.last(), "Got it. I'll remind you tomorrow at 9:00 AM to start the essay.");
  const r = (await s.state()).reminders![0]!;
  assert.deepEqual([r.text, r.status, r.dueISO], ["start the essay", "pending", "2026-11-15T14:00:00.000Z"]);
});

test("unclear reminder requests ask for what's missing", async () => {
  const s = await setup();
  await say(s, "remind me to do laundry");
  assert.match(s.last(), /^When should I remind you\?/);
  await say(s, "remind me tomorrow");
  assert.equal(s.last(), "What should I remind you about?");
  assert.deepEqual((await s.state()).reminders ?? [], []);
});

test("a reminder is delivered at its time, once, and is never capped or muted", async () => {
  const s = await setup();
  await say(s, "remind me Sunday to start the essay");
  await say(s, "mute for 2 days");
  await s.crew.tickStudent(ME);
  assert.equal(s.messenger.sent.length, 2); // only the two replies so far
  const r = await tickAt(s, "2026-11-15T09:00:30-05:00");
  assert.equal(s.last(), "Reminder: start the essay.");
  assert.equal(r.actions[0]!.sent, true);
  assert.equal((await s.state()).reminders![0]!.status, "sent");
  const n = s.messenger.sent.length;
  await tickAt(s, "2026-11-15T09:05:00-05:00");
  assert.equal(s.messenger.sent.length, n); // not twice
});

test("a reminder due in quiet hours waits until the morning", async () => {
  const s = await setup("2026-11-14T23:30:00-05:00");
  await say(s, "remind me tomorrow at 2am to take the medication");
  await tickAt(s, "2026-11-15T02:00:30-05:00");
  assert.equal(s.messenger.sent.filter((m) => /^Reminder/.test(m.text)).length, 0);
  const r = await tickAt(s, "2026-11-15T08:05:00-05:00");
  assert.match(s.last(), /^Sorry, this is late\. You asked me to remind you to take the medication\./);
  assert.equal(r.actions[0]!.sent, true);
});

test("the morning quiz: once a day, mid-morning, with a greeting", async () => {
  const s = await setup();
  const r = await tickAt(s, "2026-11-15T09:30:00-05:00");
  assert.equal(r.actions.at(-1)!.kind, "morning_quiz");
  assert.match(s.last(), /^Morning! Quick one · /);
  assert.equal((await s.state()).nudges!.at(-1)!.kind, "morning");
  const n = s.messenger.sent.length;
  await tickAt(s, "2026-11-15T10:30:00-05:00"); // same day: nothing more
  assert.equal(s.messenger.sent.length, n);
});

test("no morning quiz in the afternoon or at night, and none for someone with nothing to ask", async () => {
  const s = await setup();
  await tickAt(s, "2026-11-15T14:00:00-05:00"); // a nudge may go out mid-afternoon, but never the morning quiz
  await tickAt(s, "2026-11-15T03:00:00-05:00");
  assert.equal(s.messenger.sent.filter((m) => /^Morning!/.test(m.text)).length, 0);
  assert.equal(s.messenger.sent.filter((m) => m.studentId === ME).length <= 1, true);
  const empty = await setup("2026-11-14T12:00:00-05:00", false);
  const r = await tickAt(empty, "2026-11-15T09:30:00-05:00");
  assert.equal(empty.messenger.sent.length, 0);
  assert.ok(r.actions.some((a) => /no unasked questions/.test(a.reason ?? "")));
});

test("a nudge scaled to the stakes and the student's weak spot, then YES starts a 3-question round on that topic", async () => {
  const s = await setup();
  await s.weak();
  const r = await tickAt(s, "2026-11-14T13:00:00-05:00");
  assert.equal(r.actions.at(-1)!.kind, "nudge");
  assert.match(s.last(), /^Essay #3 is due in 4 days \(30% of your grade\), and you're at 30% on The Book of Songs\. Want a quick 3-question round on it\? Reply YES or NO\.$/);
  const st = await s.state();
  assert.equal(st.counters.nudges, 1);
  assert.ok(st.pendingOffer);
  await say(s, "YES");
  assert.match(s.last(), /^Question 1 of 3 · The Book of Songs/);
});

test("NO to a nudge is respected, and the same item isn't nudged again that day", async () => {
  const s = await setup();
  await s.weak();
  await tickAt(s, "2026-11-14T13:00:00-05:00");
  await say(s, "no");
  assert.equal(s.last(), "No problem. I'll check in again another time.");
  const n = s.messenger.sent.length;
  await tickAt(s, "2026-11-14T19:00:00-05:00"); // later the same day
  assert.equal(s.messenger.sent.length, n);
});

test("an unanswered offer expires, and a late YES does nothing", async () => {
  const s = await setup();
  await s.weak();
  await tickAt(s, "2026-11-14T13:00:00-05:00");
  s.jump("2026-11-14T20:00:00-05:00");
  await say(s, "yes");
  assert.match(s.last() ?? "", /^Nothing to confirm right now\./);
});

test("a dry run reports what it would do and sends nothing", async () => {
  const s = await setup();
  await s.weak();
  const r = await tickAt(s, "2026-11-14T13:00:00-05:00", { dryRun: true });
  assert.equal(s.messenger.sent.length, 0);
  const nudge = r.actions.find((a) => a.kind === "nudge")!;
  assert.equal(nudge.sent, false);
  assert.match(nudge.text!, /^Essay #3 is due in 4 days/);
  assert.deepEqual((await s.state()).nudges ?? [], []); // and it left no trace
});

test("the hard rules hold on every tick: quiet hours, the window, active chat", async () => {
  const s = await setup();
  await s.weak();
  for (const iso of ["2026-11-14T02:00:00-05:00", "2026-11-14T08:30:00-05:00", "2026-11-14T21:00:00-05:00"]) {
    const r = await tickAt(s, iso);
    assert.equal(r.actions.some((a) => a.sent), false, iso);
  }
  assert.equal(s.messenger.sent.length, 0);
  await say(s, "what should I focus on?"); // chatting now
  s.messenger.sent.length = 0;
  s.clock.advance(5 * 60_000);
  assert.equal((await s.crew.tickStudent(ME))!.actions.some((a) => a.sent), false);
});

test("force (the demo control) sends at any hour, and still never interrupts an open question", async () => {
  const s = await setup();
  await s.weak();
  const r = await tickAt(s, "2026-11-14T02:00:00-05:00", { force: true });
  assert.equal(r.actions.some((a) => a.kind === "nudge" && a.sent), true);
  const open = await setup();
  await open.weak();
  await say(open, "quiz me");
  open.messenger.sent.length = 0;
  await tickAt(open, "2026-11-14T13:00:00-05:00", { force: true });
  assert.equal(open.messenger.sent.length, 0);
});

test("two ignored nudges and the agent backs off; answering one resets it", async () => {
  const s = await setup();
  await s.weak();
  const st = await s.state();
  st.nudges = [{ at: "2026-11-12T13:00:00.000Z", kind: "quiz", key: "a" }, { at: "2026-11-13T13:00:00.000Z", kind: "mastery", key: "b" }]; // two nudges, never answered
  await s.store.save(st);
  const r = await tickAt(s, "2026-11-14T13:00:00-05:00");
  assert.equal(s.messenger.sent.length, 0);
  assert.ok(r.actions.some((a) => /backing off/.test(a.reason ?? "")), JSON.stringify(r.actions));
  const replied = await s.state();
  replied.messages.push({ dir: "in", text: "ok thanks", at: "2026-11-13T15:00:00.000Z" }); // they answered the later one
  await s.store.save(replied);
  await tickAt(s, "2026-11-14T13:30:00-05:00");
  assert.equal(s.messenger.sent.length, 1); // nudging resumes
});

test("'pause', 'stop nudging me' and 'resume' control nudges", async () => {
  const s = await setup();
  await s.weak();
  await say(s, "pause nudges for 2 days");
  assert.match(s.last(), /^Okay, I'll stay quiet for 2 days\. Reminders you set still come through\./);
  const before = s.messenger.sent.length;
  await tickAt(s, "2026-11-14T15:00:00-05:00");
  assert.equal(s.messenger.sent.length, before);
  await say(s, "resume");
  assert.equal(s.last(), "Back on. I'll nudge you when something's coming up.");
  await say(s, "stop nudging me");
  assert.match(s.last(), /^Okay, no more nudges\./);
  assert.ok((await s.state()).prefs!.mutedUntil!.startsWith("2099"));
});

test("Scout's texts count toward the daily nudge limit and obey quiet hours", async () => {
  const s = await setup("2026-11-14T12:00:00-05:00");
  await s.crew.switchToWeek6(ME);
  s.crew.setBypass(false);
  assert.equal(await s.crew.runScoutNow(ME), true);
  assert.equal((await s.state()).counters.nudges, 1);
  assert.equal((await s.state()).nudges!.at(-1)!.kind, "scout");
  const night = await setup("2026-11-14T02:00:00-05:00");
  await night.crew.switchToWeek6(ME);
  night.crew.setBypass(false);
  assert.equal(await night.crew.runScoutNow(ME), false);
});

test("tickAll covers every student and never texts one who hasn't texted the line", async () => {
  const s = await setup("2026-11-15T09:30:00-05:00");
  const stranger = "+15555550999";
  await s.store.save({ ...(await s.state()), id: stranger, openedByStudent: false, route: undefined });
  const all = await s.crew.tickAll();
  assert.equal(all[stranger]!.actions[0]!.reason, "student has not texted the line");
  assert.ok(s.messenger.sent.every((m) => m.studentId === ME));
  assert.ok(s.messenger.sent.length >= 1); // the morning quiz went to the real student
});
