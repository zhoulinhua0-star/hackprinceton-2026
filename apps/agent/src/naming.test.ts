import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_AGENT_NAME, FakeCalendar, FakeLLM, FixedClock, MemoryStore } from "@syllabus-crew/core";
import type { Messenger } from "@syllabus-crew/core";
import { Crew } from "./index.ts";
import { nudgeText } from "./engine/nudger.ts";

const ME = "+15555550100";
class Out implements Messenger { sent: string[] = []; async send(_id: string, text: string) { this.sent.push(text); } }
function setup() {
  const msg = new Out(), store = new MemoryStore();
  const crew = new Crew({ store, messenger: msg, llm: new FakeLLM(), calendar: new FakeCalendar(), clock: new FixedClock(new Date("2026-11-15T12:00:00-05:00")), tz: "America/New_York", opts: { proposalDelayMs: 0, nextQuestionDelayMs: 0, bypassLimits: true } });
  return { crew, msg, store, last: () => msg.sent.at(-1)!, say: (text: string) => crew.onInbound(ME, { text }) };
}

test("first text: the agent introduces itself, takes a name, then a vibe", async () => {
  const s = setup();
  await s.say("Hi Syllabus Crew");
  assert.match(s.last(), /personal agent from Syllabus Crew/);
  assert.match(s.last(), /what do you want to call me/i);
  await s.say("Juno");
  assert.equal(s.last(), "Juno it is. How should I talk to you? Reply CHILL, STRICT or HYPE.");
  await s.say("hype");
  assert.equal(s.last(), "Hype it is. Let's go! Last one: which class worries you most this semester?");
  await s.say("Macro, honestly");
  assert.equal(s.last(), "Noted. Text me that syllabus as a PDF and I'll take it from there.");
  const st = (await s.store.load(ME))!;
  assert.equal(st.agentName, "Juno");
  assert.equal(st.vibe, "hype");
  assert.equal(st.focusCourse, "Macro, honestly");
  assert.equal(st.pendingName, undefined);
});

test("the agent can text first, but only into a thread it already has", async () => {
  const s = setup();
  assert.deepEqual(await s.crew.startOnboarding(ME), { sent: false, reason: "no thread yet: text the line once so there is a thread to reply in" });
  assert.equal(s.msg.sent.length, 0);
  await s.crew.onInbound(ME, { hasImage: true, route: { spaceId: "sp", senderId: "ag" } });
  await s.crew.resetDemo(ME); // Day 1 again; the thread is kept
  const before = s.msg.sent.length;
  assert.deepEqual(await s.crew.startOnboarding(ME), { sent: true });
  assert.equal(s.msg.sent.length, before + 1);
  assert.match(s.last(), /personal agent from Syllabus Crew[\s\S]*what do you want to call me/i);
  await s.say("Juno"); await s.say("skip"); await s.say("skip");
  assert.equal(s.last(), "No problem. Text me a syllabus as a PDF and I'll take it from there.");
  assert.equal((await s.store.load(ME))!.vibe, "chill");
});

test("skip keeps the default name; an unclear name is asked once more", async () => {
  const s = setup();
  await s.say("hey");
  await s.say("skip");
  assert.equal(s.last(), `${DEFAULT_AGENT_NAME} it is. How should I talk to you? Reply CHILL, STRICT or HYPE.`);
  assert.equal((await s.store.load(ME))!.agentName, undefined);

  const t = setup();
  await t.say("hey");
  await t.say("this is a very long sentence that is not a name at all");
  assert.match(t.last(), /^Just a name/);
  await t.say("Momo");
  assert.match(t.last(), /^Momo it is/);
});

test("a photo instead of a name goes straight to the syllabus, with the default name", async () => {
  const s = setup();
  await s.say("hi");
  await s.crew.onInbound(ME, { hasImage: true });
  assert.match(s.last(), /^Got it\. Exam 2 is 25%/);
  const st = (await s.store.load(ME))!;
  assert.equal(st.pendingName, undefined);
  assert.equal(st.agentName, undefined);
});

test("a photo as the very first message never asks for a name (the stage demo)", async () => {
  const s = setup();
  await s.crew.onInbound(ME, { hasImage: true });
  assert.equal(s.msg.sent.length, 1);
  assert.match(s.last(), /^Got it\. Exam 2 is 25%/);
  await s.say("hello");
  assert.doesNotMatch(s.last(), /what do you want to call me/i);
});

test("a command during naming is handled as a command, not taken as a name", async () => {
  const s = setup();
  await s.say("hi");
  await s.say("remind me in 2 hours to start the essay");
  assert.match(s.last(), /^Got it\. I'll remind you/);
  assert.equal((await s.store.load(ME))!.agentName, undefined);
});

test("rename, vibe change and 'what's your name' work at any time, and survive Week 6", async () => {
  const s = setup();
  await s.say("hi"); await s.say("Juno"); await s.say("chill");
  await s.say("call yourself Kiki");
  assert.equal(s.last(), "Done. Call me Kiki.");
  await s.say("be strict");
  assert.match(s.last(), /^Strict it is/);
  await s.crew.switchToWeek6(ME);
  await s.say("what's your name?");
  assert.match(s.last(), /^I'm Kiki, your personal agent from Syllabus Crew/);
  assert.equal((await s.store.load(ME))!.vibe, "strict");
  await s.crew.resetDemo(ME); // a reset is a true Day 1: the name goes too
  assert.equal((await s.store.load(ME))!.agentName, undefined);
});

test("the vibe changes the wording of a miss, and of a nudge, but always keeps YES or NO", async () => {
  const s = setup();
  await s.say("hi"); await s.say("Pip"); await s.say("strict");
  await s.crew.switchToWeek6(ME);
  await s.crew.runScoutNow(ME);
  await s.say("B");
  assert.match(s.last(), /^Exam 2 is 25%|^Wrong\./); // the proposal may follow the hint
  assert.ok(s.msg.sent.some((t) => t.startsWith("Wrong. ")));

  const c = { kind: "mastery", examName: "Exam 2", days: 3, weight: 0.25, mastery: 0.35, score: 1, key: "k", topicId: "ch5" } as Parameters<typeof nudgeText>[0];
  for (const v of [undefined, "chill", "strict", "hype"] as const) assert.match(nudgeText(c, "Ch. 5: Interest rates", v), /Reply YES or NO\.$/);
  assert.equal(nudgeText(c, "Ch. 5: Interest rates", "chill"), nudgeText(c, "Ch. 5: Interest rates"));
  assert.notEqual(nudgeText(c, "Ch. 5: Interest rates", "strict"), nudgeText(c, "Ch. 5: Interest rates", "hype"));
});

// ---------- contact card (DECISIONS #105) ----------
class CardOut implements Messenger {
  sent: string[] = []; files: { filename: string; contentType: string; text: string }[] = []; failFiles = false;
  async send(_id: string, text: string) { this.sent.push(text); }
  async sendFile(_id: string, f: { bytes: Uint8Array; contentType: string; filename: string }) {
    if (this.failFiles) throw new Error("upload failed");
    this.files.push({ filename: f.filename, contentType: f.contentType, text: new TextDecoder().decode(f.bytes) });
  }
}
function cardSetup(lineNumber: string | undefined = "+15555550199") {
  const msg = new CardOut(), store = new MemoryStore();
  const crew = new Crew({ store, messenger: msg, llm: new FakeLLM(), calendar: new FakeCalendar(), clock: new FixedClock(new Date("2026-11-15T12:00:00-05:00")), tz: "America/New_York", opts: { proposalDelayMs: 0, nextQuestionDelayMs: 0, bypassLimits: true, lineNumber } });
  return { crew, msg, store, say: (text: string) => crew.onInbound(ME, { text }) };
}

test("brand-new student: after the vibe, the agent texts its card with the chosen name and face, then asks the last question", async () => {
  const s = cardSetup();
  await s.say("Hi Syllabus Crew"); await s.say("Juno"); await s.say("hype");
  assert.equal(s.msg.files.length, 1);
  const f = s.msg.files[0]!;
  assert.equal(f.filename, "Juno.vcf");
  assert.equal(f.contentType, "text/vcard");
  assert.match(f.text, /FN:Juno\r\n/);
  assert.match(f.text, /TEL;TYPE=CELL:\+15555550199/);
  assert.match(f.text, /PHOTO;ENCODING=b;TYPE=PNG:iVBORw0KGgo/); // a real PNG (the hype avatar)
  assert.deepEqual(s.msg.sent.slice(-2), [
    "Hype it is. Let's go!",
    "That's my card. Tap it, then Create New Contact, and my texts will show up as Juno with my face.\n\nLast one: which class worries you most this semester?",
  ]);
  const st = (await s.store.load(ME))!;
  assert.equal(st.cardFor, "Juno|hype");
  assert.equal(st.pendingName?.step, "focus");
  await s.say("Macro");
  assert.equal(s.msg.sent.at(-1), "Noted. Text me that syllabus as a PDF and I'll take it from there.");
});

test("a failed card never breaks onboarding: no mention of it, the last question still comes", async () => {
  const s = cardSetup();
  s.msg.failFiles = true;
  await s.say("Hi"); await s.say("skip"); await s.say("chill");
  assert.deepEqual(s.msg.sent.slice(-2), ["Chill it is. No pressure, just steady.", "Last one: which class worries you most this semester?"]);
  assert.equal((await s.store.load(ME))!.cardFor, undefined);
});

test("no line number configured: no card, the original single text", async () => {
  const s = cardSetup(""); // PHOTON_IMESSAGE_LINE unset
  await s.say("Hi"); await s.say("Juno"); await s.say("strict");
  assert.equal(s.msg.files.length, 0);
  assert.equal(s.msg.sent.at(-1), "Strict it is. I'll hold you to it. Last one: which class worries you most this semester?");
});

test("rename or vibe change after the card: a fresh card; the same name again sends nothing", async () => {
  const s = cardSetup();
  await s.say("Hi"); await s.say("Juno"); await s.say("chill"); await s.say("skip");
  await s.say("call yourself Max");
  assert.equal(s.msg.files.length, 2);
  assert.match(s.msg.files[1]!.text, /FN:Max\r\n/);
  assert.equal(s.msg.sent.at(-1), "Here's my updated card. Tap it to save the new one.");
  await s.say("be strict");
  assert.equal(s.msg.files.length, 3);
  assert.equal((await s.store.load(ME))!.cardFor, "Max|strict");
});

test("Reset makes the demo student brand new again: the next text starts over and a new card comes", async () => {
  const s = cardSetup();
  await s.crew.onInbound(ME, { text: "Hi", route: { spaceId: "sp", senderId: "ag" } });
  await s.say("Juno"); await s.say("chill"); await s.say("skip");
  await s.crew.resetDemo(ME);
  const st = (await s.store.load(ME))!;
  assert.equal(st.agentName, undefined); assert.equal(st.cardFor, undefined); assert.ok(st.route);
  await s.say("Hi Syllabus Crew");
  assert.match(s.msg.sent.at(-1)!, /what do you want to call me/i);
  await s.say("Nova"); await s.say("hype");
  assert.equal(s.msg.files.length, 2);
  assert.match(s.msg.files[1]!.text, /FN:Nova\r\n/);
});
