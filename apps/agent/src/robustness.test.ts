import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeCalendar, FakeLLM, FixedClock, MemoryStore } from "@syllabus-crew/core";
import type { Messenger } from "@syllabus-crew/core";
import { Crew } from "./index.ts";
import { makeCtx } from "./engine/ctx.ts";
import { onMasteryChange } from "./engine/planner.ts";
import { calendarRouter } from "./adapters/calendar-router.ts";
import { FileStore } from "./adapters/file-store.ts";
import { isStale, toInbound } from "./adapters/photon.ts";
import { week6State } from "./seed.ts";

const TZ = "America/New_York";
const ME = "+15555550100";
const OTHER = "+15555550199";
const NOON = new Date("2026-11-15T12:00:00-05:00");

class FlakyMessenger implements Messenger {
  sent: string[] = [];
  failOn: ((text: string) => boolean) | undefined;
  async send(_id: string, text: string) {
    if (this.failOn?.(text)) throw new Error("photon 503");
    this.sent.push(text);
  }
}
function setup(o: { at?: Date; bypass?: boolean | string[] } = {}) {
  const msg = new FlakyMessenger(), calendar = new FakeCalendar(), store = new MemoryStore(), clock = new FixedClock(o.at ?? NOON);
  const crew = new Crew({ store, messenger: msg, llm: new FakeLLM(), calendar, clock, tz: TZ, opts: { proposalDelayMs: 0, nextQuestionDelayMs: 0, bypassLimits: o.bypass ?? false } });
  return { crew, msg, calendar, store, clock, last: () => msg.sent.at(-1) };
}
async function toQuiz(s: ReturnType<typeof setup>) {
  await s.crew.onInbound(ME, { text: "Hi" });
  await s.crew.switchToWeek6(ME);
  await s.crew.runScoutNow(ME);
}

test("a failed send leaves no phantom quiz and does not spend the daily cap", async () => {
  const s = setup();
  await s.crew.onInbound(ME, { text: "Hi" });
  await s.crew.switchToWeek6(ME);
  s.msg.failOn = () => true;
  await assert.rejects(() => s.crew.sendQuizNow(ME), /photon 503/);
  const st = (await s.store.load(ME))!;
  assert.equal(st.pendingQuiz, undefined);
  assert.equal(st.counters.quizzes, 0);
  s.msg.failOn = undefined;
  assert.equal(await s.crew.sendQuizNow(ME), true);
});

test("a failed send does not mark Scout's material as found, so Scout retries", async () => {
  const s = setup();
  await s.crew.onInbound(ME, { text: "Hi" });
  await s.crew.switchToWeek6(ME);
  s.msg.failOn = () => true;
  await assert.rejects(() => s.crew.runScoutNow(ME), /photon 503/);
  assert.deepEqual((await s.store.load(ME))!.foundMaterialIds, []);
  s.msg.failOn = undefined;
  assert.equal(await s.crew.runScoutNow(ME), true);
  assert.match(s.msg.sent.at(-2)!, /Prof\. Lee posted Week 6 slides/);
});

test("calendar write succeeds but the confirmation text fails: the event is recorded, never a false 'couldn't add it'", async () => {
  const s = setup();
  await toQuiz(s);
  await s.crew.onInbound(ME, { text: "B" });
  s.msg.failOn = () => true;
  await assert.rejects(() => s.crew.onInbound(ME, { text: "YES" }), /photon 503/);
  assert.equal(s.calendar.events.length, 1);
  assert.equal((await s.store.load(ME))!.proposals[0]!.status, "approved");
  s.msg.failOn = undefined;
  assert.equal(s.msg.sent.some((t) => /couldn't add/.test(t)), false);
  await s.crew.onInbound(ME, { text: "YES" });
  assert.equal(s.last(), "Nothing to confirm right now.");
  assert.equal(s.calendar.events.length, 1);
});

test("a proposal whose text could not be sent is withdrawn (YES can't approve something never shown)", async () => {
  const s = setup();
  await toQuiz(s);
  s.msg.failOn = (t) => /Reply YES or NO/.test(t);
  await assert.rejects(() => s.crew.onInbound(ME, { text: "B" }), /photon 503/);
  assert.equal((await s.store.load(ME))!.proposals.length, 0);
  s.msg.failOn = undefined;
  await s.crew.onInbound(ME, { text: "YES" });
  assert.equal(s.calendar.events.length, 0);
});

test("Scout does not text during quiet hours (unless bypassed for that student)", async () => {
  const night = new Date("2026-11-15T02:00:00-05:00");
  const s = setup({ at: night });
  await s.crew.onInbound(ME, { text: "Hi" });
  await s.crew.switchToWeek6(ME);
  const before = s.msg.sent.length;
  assert.equal(await s.crew.runScoutNow(ME), false);
  assert.equal(s.msg.sent.length, before);
  assert.deepEqual((await s.store.load(ME))!.foundMaterialIds, []); // nothing consumed: it will find it in the morning
  s.crew.setBypass([ME]);
  assert.equal(await s.crew.runScoutNow(ME), true);
});

test("bypass applies only to the listed student, never to a stranger", async () => {
  const s = setup({ at: new Date("2026-11-15T23:30:00-05:00"), bypass: [ME] });
  for (const id of [ME, OTHER]) { await s.crew.onInbound(id, { text: "Hi" }); await s.crew.switchToWeek6(id); }
  assert.equal(await s.crew.sendQuizNow(ME), true);
  assert.equal(await s.crew.sendQuizNow(OTHER), false);
});

test("an open quiz is never overwritten; 'quiz me' repeats it; a demo control may replace it", async () => {
  const s = setup();
  await toQuiz(s);
  const q1 = s.last()!;
  const st1 = (await s.store.load(ME))!.pendingQuiz!;
  await s.crew.onInbound(ME, { text: "quiz me" });
  assert.equal(s.last(), `Still waiting on this one:\n\n${q1}`);
  assert.equal((await s.store.load(ME))!.pendingQuiz!.questionId, st1.questionId);
  assert.equal((await s.store.load(ME))!.counters.quizzes, 1); // no slot burned
  await s.crew.sendQuizNow(ME); // demo control: force
  const st2 = (await s.store.load(ME))!;
  assert.notEqual(st2.pendingQuiz!.questionId, st1.questionId);
  assert.ok(st2.askedQuestionIds.includes(st1.questionId)); // the abandoned one counts as asked
});

test("only one proposal is open at a time, so YES/NO is never ambiguous", async () => {
  const store = new MemoryStore(), msg = new FlakyMessenger();
  const state = week6State(ME, NOON, true, TZ);
  state.mastery = { ch4: 0.3, ch5: 0.3, ch6: 0.8 };
  const deps = { store, messenger: msg, llm: new FakeLLM(), clock: new FixedClock(NOON), tz: TZ, opts: { bypassLimits: false, dashboardUrl: "", proposalDelayMs: 0, llmTimeoutMs: 100, llmProposals: false, sessionLength: 5, nextQuestionDelayMs: 0 } };
  const ctx = makeCtx(deps, state);
  await onMasteryChange(ctx, "ch5");
  await onMasteryChange(ctx, "ch4");
  assert.equal(state.proposals.length, 1);
  assert.equal(msg.sent.length, 1);
});

test("rate limit: a sender flooding the line is ignored after 40 texts an hour; the next hour works", async () => {
  const s = setup();
  for (let i = 0; i < 45; i++) await s.crew.onInbound(OTHER, { text: `hi ${i}` });
  assert.equal(s.msg.sent.length, 40);
  s.clock.advance(3_600_001);
  await s.crew.onInbound(OTHER, { text: "back" });
  assert.equal(s.msg.sent.length, 41);
});

test("the stored thread is capped at 200 messages", async () => {
  const s = setup();
  for (let batch = 0; batch < 6; batch++) {
    for (let i = 0; i < 30; i++) await s.crew.onInbound(ME, { text: `m${batch}-${i}` });
    s.clock.advance(3_600_001);
  }
  assert.equal((await s.store.load(ME))!.messages.length, 200);
});

test("the focus answer only triggers on real focus questions", async () => {
  const s = setup();
  await toQuiz(s);
  await s.crew.onInbound(ME, { text: "I'm studying for bio" });
  assert.doesNotMatch(s.last()!, /^Focus on/);
  await s.crew.onInbound(ME, { text: "what should I study?" });
  assert.match(s.last()!, /^Focus on/);
});

test("calendar router: real Google only for the demo student; strangers get the local stand-in", async () => {
  const local = new FakeCalendar(), google = new FakeCalendar();
  let connected = true;
  const logs: string[] = [];
  const router = calendarRouter({ google: { isConnected: () => connected, createEvent: (e) => google.createEvent(e), deleteEvent: (id) => google.deleteEvent(id) }, local, owner: ME, log: (s) => logs.push(s) });
  const ev = { title: "t", startISO: "2026-11-17T21:00:00.000Z", endISO: "2026-11-17T21:30:00.000Z" };
  await router.createEvent({ ...ev, owner: ME });
  await router.createEvent({ ...ev, owner: OTHER });
  await router.createEvent({ ...ev }); // no owner at all
  assert.equal(google.events.length, 1);
  assert.equal(local.events.length, 2);
  connected = false;
  await router.createEvent({ ...ev, owner: ME });
  assert.equal(local.events.length, 3);
  await assert.rejects(() => router.deleteEvent!("sc" + "a".repeat(30)), /not connected/); // a Google event is never silently "deleted" locally
  connected = true;
  await router.deleteEvent!("sc" + "a".repeat(30));
  await router.deleteEvent!("fake_evt_1");
  assert.equal(local.events.length, 2);
});

test("a stale Photon message (from before this process started) is ignored", () => {
  const started = Date.parse("2026-11-15T12:00:00Z");
  assert.equal(isStale("2026-11-15T11:50:00Z", started), true);
  assert.equal(isStale("2026-11-15T11:59:30Z", started), false); // within the grace window (clock skew)
  assert.equal(isStale("2026-11-15T12:00:05Z", started), false);
  assert.equal(isStale(undefined, started), false);
  assert.equal(toInbound({ id: "pho_msg_1", platform: "imessage", status: "received", createdAt: "2026-11-15T11:00:00Z", content: { type: "text", text: "x" }, sentBy: { kind: "human", handle: "+1" }, space: { id: "s", kind: "direct" }, receivedBy: { id: "r" } })!.createdAt, "2026-11-15T11:00:00Z");
});

test("a corrupt state file is backed up before it is replaced", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bk-"));
  const path = join(dir, "state.json");
  writeFileSync(path, "{broken");
  const st = new FileStore(path);
  assert.equal(await st.load("+1"), undefined);
  assert.equal(readdirSync(dir).some((f) => f.startsWith("state.json.corrupt-")), true);
  assert.equal(existsSync(path), true); // original left in place until the next save
});
