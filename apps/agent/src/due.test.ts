import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeCalendar, FakeLLM, FakeMessenger, FixedClock, MemoryStore, isDueQuestion } from "@syllabus-crew/core";
import type { ParsedSyllabus } from "@syllabus-crew/core";
import { Crew } from "./index.ts";

const TZ = "America/New_York";
const ME = "+15555550100";
const ROUTE = { spaceId: "pho_spc_x", senderId: "pho_usr_y" };
const SYLLABUS: ParsedSyllabus = {
  courseName: "LIT 101: Antiquity", instructor: null, term: "Fall 2026", termStartDate: "2026-09-02", notes: null,
  categories: [{ name: "Writing", weightPercent: 30 }, { name: "Exams", weightPercent: 40 }],
  assessments: [
    { name: "Essay #2", kind: "paper", category: "Writing", date: "2026-10-01", week: null, topics: ["Homer"] },
    { name: "Essay #3", kind: "paper", category: "Writing", date: "2026-11-30", week: null, topics: ["The Book of Songs"] },
    { name: "Midterm", kind: "exam", category: "Exams", date: "2026-11-20", week: null, topics: ["Homer, The Odyssey"] },
  ],
};
async function setup(o: { llm?: FakeLLM } = {}) {
  const messenger = new FakeMessenger(), store = new MemoryStore(), clock = new FixedClock(new Date("2026-11-14T12:00:00-05:00"));
  const llm = o.llm ?? new FakeLLM();
  const crew = new Crew({ store, messenger, llm, calendar: new FakeCalendar(), clock, tz: TZ, opts: { proposalDelayMs: 0, nextQuestionDelayMs: 0, companionWaitMs: 20 } });
  await crew.onInbound(ME, { text: "Hi", route: ROUTE });
  await crew.applySyllabus(ME, SYLLABUS);
  return { crew, messenger, llm, last: () => messenger.sent.at(-1)!.text, count: () => messenger.sent.length };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("due-date questions are recognized, small talk isn't", () => {
  for (const t of ["What's the time for my next assignment", "Next essay?", "when is my midterm", "what's due this week", "any deadlines coming up?"]) assert.ok(isDueQuestion(t), t);
  for (const t of ["Now I am gonna test u with the real pdf, r u ready?", "quiz me", "thanks!"]) assert.ok(!isDueQuestion(t), t);
});

test("next assignment: answered from the syllabus in code, soonest first, past items skipped", async () => {
  const s = await setup();
  await s.crew.onInbound(ME, { text: "What's the time for my next assignment" });
  assert.match(s.last(), /^Next up: Midterm: Fri, Nov 20 \(40%\)\.\n\nAfter that:\n• Essay #3: Mon, Nov 30 \(15%\)$/);
  assert.doesNotMatch(s.last(), /Essay #2/); // already past
});

test("next essay: only essays", async () => {
  const s = await setup();
  await s.crew.onInbound(ME, { text: "Next essay?" });
  assert.equal(s.last(), "Next up: Essay #3: Mon, Nov 30 (15%).");
});

test("free chat sees the syllabus, so it can't claim it has none", async () => {
  const llm = new FakeLLM({ smalltalk: "Sure." });
  const s = await setup({ llm });
  await s.crew.onInbound(ME, { text: "tell me about this class" });
  const seen = llm.calls.filter((c) => c.task === "smalltalk").at(-1)!.user;
  assert.match(seen, /The student's syllabus \(LIT 101: Antiquity\)\. Coming up:\n- Midterm, Fri, Nov 20, 40% of the grade/);
  assert.match(seen, /Never say you don't have their syllabus/);
});

test("'Check it' before the file arrives: no reply of its own once the file comes", async () => {
  const s = await setup();
  const before = s.count();
  await s.crew.onInbound(ME, { text: "Check it" });
  assert.equal(s.count(), before); // nothing yet
  await s.crew.onInbound(ME, { hasImage: true }); // the file follows (no loader: handled as a photo)
  const afterFile = s.count();
  await sleep(60);
  assert.equal(s.count(), afterFile); // the companion text never got its own reply
});

test("'Check it' with no file: asks for it after a moment", async () => {
  const s = await setup();
  await s.crew.onInbound(ME, { text: "check it" });
  await sleep(60);
  assert.equal(s.last(), "Send it over and I'll take a look. A syllabus works best as a PDF.");
});

test("loose quiz requests start a quiz; questions about a quiz's date don't", async () => {
  const s = await setup();
  for (const t of ["Write me quiz", "test me", "can I get some practice questions?", "let's do a quiz", "give me a quiz"]) {
    await s.crew.onInbound(ME, { text: t });
    assert.match(s.last(), /writing your (first )?questions|^Question 1 of|Still waiting on this one/, t);
  }
  await s.crew.onInbound(ME, { text: "stop" });
  await s.crew.onInbound(ME, { text: "when is the next quiz?" });
  assert.doesNotMatch(s.last(), /^Question 1 of|writing your/);
});

test("YES to a round offer with no questions yet starts the writer instead of a dead end", async () => {
  const s = await setup();
  const st = (await (s.crew as any).deps.store.load(ME))!;
  st.pendingOffer = { kind: "round", expiresAt: new Date("2026-11-14T20:00:00-05:00").toISOString() };
  await (s.crew as any).deps.store.save(st);
  await s.crew.onInbound(ME, { text: "yes" });
  assert.match(s.last(), /writing your (first )?questions/);
});
