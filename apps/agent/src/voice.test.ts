import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeCalendar, FakeCaller, FakeLLM, FixedClock, MemoryStore, canDrill, drillMastery, drillRecap, keywordGrade, validateGrade } from "@syllabus-crew/core";
import type { Messenger } from "@syllabus-crew/core";
import { Crew } from "./index.ts";
import { toStatus } from "./adapters/elevenlabs.ts";

const TZ = "America/New_York";
const ME = "+15555550100";
const NOON = new Date("2026-11-15T12:00:00-05:00");
class Out implements Messenger { sent: string[] = []; async send(_id: string, t: string) { this.sent.push(t); } }

function setup(o: { caller?: boolean; bypass?: boolean; at?: Date; grade?: unknown } = {}) {
  const msg = new Out(), store = new MemoryStore(), clock = new FixedClock(o.at ?? NOON), caller = new FakeCaller();
  const llm = new FakeLLM();
  llm.jsonByTask.write_drill = { question: "Why does a rate hike cut investment?", keyPoints: ["borrowing costs more", "fewer projects pay off", "investment falls"] };
  llm.jsonByTask.grade_drill = o.grade ?? { covered: [0, 2], feedback: "You nailed the borrowing cost, but missed why fewer projects pay off." };
  const crew = new Crew({ store, messenger: msg, llm, calendar: new FakeCalendar(), clock, tz: TZ, caller: o.caller === false ? undefined : caller,
    opts: { proposalDelayMs: 0, nextQuestionDelayMs: 0, bypassLimits: o.bypass ?? true, voiceNumber: "+16097854521" } });
  return { crew, msg, store, clock, caller, last: () => msg.sent.at(-1)!, say: (text: string) => crew.onInbound(ME, { text }) };
}
async function week6(s: ReturnType<typeof setup>) { await s.crew.onInbound(ME, { hasImage: true }); await s.crew.switchToWeek6(ME); }

test("offer, CALL, the phone rings with the drill, and the recap text moves mastery in code", async () => {
  const s = setup();
  await week6(s);
  assert.deepEqual(await s.crew.offerDrillNow(ME), { sent: true });
  assert.match(s.last(), /^Exam 2 is in \d+ days and chapter \d is at \d+%\. Want a 3-minute voice drill\? Reply CALL\.$/);
  assert.equal(s.caller.calls.length, 0); // nothing rings before CALL

  await s.say("CALL");
  assert.match(s.last(), /^Calling you now from \(609\) 785-4521: a 3-minute drill on chapter \d\.$/);
  assert.equal(s.caller.calls.length, 1);
  const call = s.caller.calls[0]!;
  assert.equal(call.to, ME);
  assert.equal(call.variables.question, "Why does a rate hike cut investment?");
  assert.equal(call.variables.key_points, "borrowing costs more; fewer projects pay off; investment falls");
  const topicId = (await s.store.load(ME))!.drills![0]!.topicId;
  const before = (await s.store.load(ME))!.mastery[topicId] ?? 0.5;

  assert.equal(await s.crew.checkDrills(ME), 0); // still on the call
  s.caller.finish(call.callId, { state: "done", answered: true, durationSecs: 161, transcript: [
    { role: "agent", text: "Why does a rate hike cut investment?" },
    { role: "user", text: "Because borrowing costs more, so companies invest less overall." },
  ] });
  assert.equal(await s.crew.checkDrills(ME), 1);
  const d = (await s.store.load(ME))!.drills![0]!;
  assert.equal(d.status, "done");
  assert.equal(d.score, 2 / 3);
  assert.equal(d.masteryAfter, drillMastery(before, 2 / 3));
  assert.deepEqual(d.missed, ["fewer projects pay off"]);
  assert.ok(s.msg.sent.some((t) => t.startsWith("Voice drill, 2:41. You nailed the borrowing cost") && t.endsWith("The answer: fewer projects pay off.")));
  assert.equal(await s.crew.checkDrills(ME), 0); // recapped once
});

test("no answer: a 'missed you' text, no mastery change; a slow model falls back to keyword grading", async () => {
  const s = setup();
  await week6(s);
  await s.say("drill me");
  s.caller.finish(s.caller.calls[0]!.callId, { state: "done", answered: false, transcript: [] });
  await s.crew.checkDrills(ME);
  assert.equal(s.last(), "Missed you. Text CALL when you're free for the drill.");
  assert.equal((await s.store.load(ME))!.drills![0]!.status, "missed");

  const k = setup({ grade: { nonsense: true } });
  await week6(k);
  await k.say("call me");
  k.caller.finish(k.caller.calls[0]!.callId, { state: "done", answered: true, durationSecs: 90, transcript: [{ role: "user", text: "borrowing costs go up and investment falls" }] });
  await k.crew.checkDrills(ME);
  const d = (await k.store.load(ME))!.drills![0]!;
  assert.equal(d.status, "done");
  assert.deepEqual(d.covered, ["borrowing costs more", "investment falls"]);
});

test("rules: no call without voice set up, outside 9am-8pm, twice a day, or while a call is open", async () => {
  const off = setup({ caller: false });
  await week6(off);
  await off.say("CALL");
  assert.match(off.last(), /aren't switched on yet/);

  const night = setup({ bypass: false, at: new Date("2026-11-15T21:30:00-05:00") });
  await week6(night);
  await night.say("CALL");
  assert.match(night.last(), /only call between 9am and 8pm/);
  assert.equal(night.caller.calls.length, 0);

  const s = setup({ bypass: false });
  await week6(s);
  await s.say("CALL");
  await s.say("CALL");
  assert.match(s.last(), /already on a drill call/);
  s.caller.finish(s.caller.calls[0]!.callId, { state: "done", answered: true, durationSecs: 60, transcript: [{ role: "user", text: "borrowing costs more" }] });
  await s.crew.checkDrills(ME);
  await s.say("CALL");
  assert.match(s.last(), /today's voice drill done/);
  assert.equal(s.caller.calls.length, 1);
});

test("a call that fails to start leaves no open drill; a call that never ends times out", async () => {
  const s = setup();
  await week6(s);
  s.caller.failPlace = true;
  await s.say("CALL");
  assert.match(s.last(), /couldn't place the call/);
  assert.equal(((await s.store.load(ME))!.drills ?? []).length, 0);

  s.caller.failPlace = false;
  await s.say("CALL");
  s.clock.advance(11 * 60_000);
  await s.crew.checkDrills(ME);
  assert.equal(s.last(), "The call didn't go through. Text CALL to try again.");
  assert.equal((await s.store.load(ME))!.drills![0]!.status, "failed");
});

test("NO to a drill offer drops it; 'Call me' mid-question ends the round and drills that topic (real-phone run, Nov 15)", async () => {
  const s = setup();
  await week6(s);
  await s.crew.offerDrillNow(ME);
  await s.say("no");
  assert.equal(s.last(), "No problem. Text CALL whenever you want a voice drill.");
  await s.crew.runScoutNow(ME);
  const open = (await s.store.load(ME))!;
  const topic = open.questions.find((q) => q.id === open.pendingQuiz!.questionId)!.topicId;
  await s.say("Call me"); // a quiz is open: before, this went to chat and the model said "I can't take calls"
  assert.equal(s.caller.calls.length, 1);
  const st = (await s.store.load(ME))!;
  assert.equal(st.pendingQuiz, undefined, "the open question is dropped, not graded");
  assert.ok(!st.askedQuestionIds.includes(open.pendingQuiz!.questionId), "so it can come back another time");
  assert.equal(st.drills![0]!.topicId, topic, "the call drills the topic they were on");

  // When the call can't happen (outside 9am-8pm), it says why and the question stays open.
  const n = setup({ bypass: false, at: new Date("2026-11-15T21:30:00-05:00") });
  await week6(n);
  await n.crew.runScoutNow(ME);
  await n.say("can you call me");
  assert.match(n.last(), /only call between 9am and 8pm/);
  assert.ok((await n.store.load(ME))!.pendingQuiz, "the question is still open");
});

test("core: drill math, grade checks, keyword matching, the call window and the ElevenLabs mapping", () => {
  assert.equal(drillMastery(0.35, 2 / 3), 0.492);
  assert.equal(drillMastery(0.8, 0), 0.56);
  assert.equal(drillMastery(0.5, 0), 0.35); // "I don't know" costs the same as a wrong A/B/C answer
  assert.deepEqual(validateGrade({ covered: [2, 0, 0, 9, -1], feedback: " Nice. " }, 3), { covered: [0, 2], feedback: "Nice." });
  assert.equal(validateGrade({ covered: "x", feedback: "y" }, 3), null);
  assert.deepEqual(keywordGrade(["higher borrowing costs", "investment falls"], "um so borrowing gets costlier"), [0]);
  assert.equal(drillRecap({ id: "d", topicId: "t", question: "q", keyPoints: [], status: "done", startedAt: "", durationSecs: 161, masteryBefore: 0.35, masteryAfter: 0.49 }, "chapter 5", "Good."), "Voice drill, 2:41. Good. chapter 5: 35% → 49%.");
  assert.equal(drillRecap({ id: "d", topicId: "t", question: "q", keyPoints: [], status: "done", startedAt: "", durationSecs: 46, masteryBefore: 0.5, masteryAfter: 0.35, missed: ["Higher rates raise the cost of borrowing.", "So investment spending falls."] }, "chapter 5", "Saying it back was a good start."),
    "Voice drill, 0:46. Saying it back was a good start. chapter 5: 50% → 35%.\n\nThe answer: Higher rates raise the cost of borrowing. So investment spending falls.");
  const st = { drills: [] } as unknown as Parameters<typeof canDrill>[0];
  assert.deepEqual(canDrill(st, new Date("2026-11-15T08:30:00-05:00"), TZ, false), { ok: false, reason: "hours" });
  assert.deepEqual(canDrill(st, new Date("2026-11-15T08:30:00-05:00"), TZ, true), { ok: true });

  assert.deepEqual(toStatus({ status: "processing" }), { state: "pending" });
  assert.deepEqual(toStatus({ status: "done", metadata: { call_duration_secs: 42, phone_call: { call_result: "answered" } }, transcript: [{ role: "agent", message: "Hi" }, { role: "user", message: "hello" }, { role: "user", message: null }] }),
    { state: "done", durationSecs: 42, answered: true, transcript: [{ role: "agent", text: "Hi" }, { role: "user", text: "hello" }] });
  assert.equal(toStatus({ status: "done", metadata: { phone_call: { call_result: "no_answer" } }, transcript: [] }).answered, false);
  assert.equal(toStatus({ status: "failed" }).state, "failed");
});

test("a voice note with no transcript gets a plain answer; the fallback grade has no double period (real phone, Nov 15)", async () => {
  const s = setup({ grade: { nonsense: true } }); // the model's grade is unusable: the keyword fallback writes the feedback
  await week6(s);
  await s.say("[voice message]");
  assert.equal(s.last(), "I couldn't make out that voice note. Text it to me, or reply CALL and we can talk it through.");
  await s.say("CALL");
  const call = s.caller.calls[0]!;
  s.caller.finish(call.callId, { state: "done", answered: true, durationSecs: 49, transcript: [{ role: "user", text: "idk" }] });
  await s.crew.checkDrills(ME);
  const recap = s.msg.sent.find((t) => t.startsWith("Voice drill,"))!;
  assert.doesNotMatch(recap, /\.\./);
  assert.match(recap, /Next time, cover: borrowing costs more\./);
  assert.doesNotMatch(recap, /Good start/, "no praise for 0 points");
});

test("'what should I be focusing on this week' gets the focus answer in code, even with a proposal waiting (Nov 15)", async () => {
  const s = setup({ grade: { covered: [], feedback: "Not this time." } });
  await week6(s);
  await s.say("CALL");
  s.caller.finish(s.caller.calls[0]!.callId, { state: "done", answered: true, durationSecs: 49, transcript: [{ role: "user", text: "idk" }] });
  await s.crew.checkDrills(ME);
  assert.match(s.last(), /Reply YES or NO\.$/, "the weak drill brought a proposal, as on the phone");
  await s.say("So what should I be focusing on this week?");
  assert.match(s.last(), /^Focus on .+: you're at \d+%, and .+ is \d+% of your grade in \d+ days\.$/);
  await s.say("No"); // the proposal is still the open item
  assert.ok(s.msg.sent.slice(-2).includes("No problem, I won't add it."));
});
