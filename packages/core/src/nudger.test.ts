import { test } from "node:test";
import assert from "node:assert/strict";
import { candidates, decideMorningQuiz, decideNudge, ignoredStreak, windowDays } from "./nudger.ts";
import type { StudentState } from "./types.ts";

const TZ = "America/New_York";
const NOW = new Date("2026-11-14T12:00:00-05:00"); // Saturday noon: inside the 9am-8pm window
const h = (n: number) => new Date(NOW.getTime() + n * 3_600_000).toISOString();
const q = (id: string, topicId: string) => ({ id, topicId, prompt: "p", choices: { A: "a", B: "b", C: "c" }, correct: "A" as const, explanation: "e", socratic: "s?" });

function S(o: Partial<StudentState> = {}): StudentState {
  return {
    id: "+1", phase: "live", openedByStudent: true, parsed: true, courses: [{ id: "c", name: "C" }],
    exams: [{ id: "e1", courseId: "c", name: "Essay #3", weight: 0.3, date: "2026-11-18T15:00:00.000Z", topicIds: ["t1", "t2"] }], // 4 days out
    topics: [], mastery: {}, questions: [q("q1", "t1"), q("q2", "t2")], unlockedQuestionIds: ["q1", "q2"], askedQuestionIds: [],
    inbox: [], foundMaterialIds: [], proposals: [], messages: [], counters: { day: "2026-11-14", quizzes: 0, nudges: 0 }, busy: [],
    route: { spaceId: "s", senderId: "r" }, nudges: [], ...o,
  } as StudentState;
}
const sends = (s: StudentState, o?: { force?: boolean }, now = NOW) => decideNudge(s, now, TZ, o);
const reason = (d: ReturnType<typeof decideNudge>) => (d.send ? "SEND" : d.reason);

test("windowDays: stakes decide how early to mention something", () => {
  assert.deepEqual([0.3, 0.25, 0.15, 0.1, 0.06, 0.02].map(windowDays), [7, 7, 4, 4, 2, 1]);
});

test("a weak topic on a high-stakes assessment gets a mastery nudge", () => {
  const d = sends(S({ mastery: { t1: 0.35, t2: 0.8 } }));
  assert.ok(d.send && d.candidate.kind === "mastery" && d.candidate.topicId === "t1" && d.candidate.days === 4);
});

test("a decently known topic still gets a light quiz nudge if the date is 2+ days away", () => {
  const d = sends(S({ mastery: { t1: 0.8, t2: 0.9 } }));
  assert.ok(d.send && d.candidate.kind === "quiz");
});

test("no questions to quiz on: a plain deadline reminder, only within a day", () => {
  const noQs = { questions: [], unlockedQuestionIds: [] };
  assert.equal(reason(sends(S(noQs))), "nothing worth a nudge"); // 4 days out, nothing to quiz on
  const tomorrow = S({ ...noQs, exams: [{ ...S().exams[0]!, date: "2026-11-15T15:00:00.000Z" }] });
  const d = sends(tomorrow);
  assert.ok(d.send && d.candidate.kind === "deadline" && d.candidate.days === 1);
});

test("stakes scale the lead time: a 2% item is silent until the day before", () => {
  const small = (date: string) => S({ questions: [], exams: [{ ...S().exams[0]!, weight: 0.02, date }] });
  assert.equal(reason(sends(small("2026-11-17T15:00:00.000Z"))), "nothing worth a nudge");
  assert.equal(sends(small("2026-11-15T15:00:00.000Z")).send, true);
});

test("the highest-priority item is chosen; each is nudged once a day", () => {
  const s = S({
    exams: [{ id: "e1", courseId: "c", name: "Quiz", weight: 0.05, date: "2026-11-15T15:00:00.000Z", topicIds: ["t1"] }, { id: "e2", courseId: "c", name: "Final", weight: 0.3, date: "2026-11-15T15:00:00.000Z", topicIds: ["t2"] }],
    mastery: { t1: 0.3, t2: 0.3 },
  });
  const cs = candidates(s, NOW, TZ);
  assert.deepEqual(cs.map((c) => c.examName), ["Final", "Quiz"]);
  const again = S({ ...s, nudges: [{ at: h(-5), kind: "mastery", key: cs[0]!.key }] });
  assert.equal(candidates(again, NOW, TZ)[0]!.examName, "Quiz"); // Final was already nudged today
});

test("hard rules: quiet hours, the 9-8 window, the daily limit, the minimum gap, active chat", () => {
  const w = { mastery: { t1: 0.3 } };
  assert.equal(reason(sends(S(w), {}, new Date("2026-11-14T02:00:00-05:00"))), "quiet hours");
  assert.equal(reason(sends(S(w), {}, new Date("2026-11-14T08:30:00-05:00"))), "outside the 9am-8pm window");
  assert.equal(reason(sends(S(w), {}, new Date("2026-11-14T21:00:00-05:00"))), "outside the 9am-8pm window");
  assert.equal(reason(sends(S({ ...w, counters: { day: "2026-11-14", quizzes: 0, nudges: 3 } }))), "daily limit reached");
  assert.equal(sends(S({ ...w, counters: { day: "2026-11-13", quizzes: 0, nudges: 3 } })).send, true); // yesterday's count doesn't carry over
  assert.equal(reason(sends(S({ ...w, nudges: [{ at: h(-2), kind: "quiz", key: "other" }] }))), "too soon after the last nudge");
  assert.equal(sends(S({ ...w, nudges: [{ at: h(-5), kind: "quiz", key: "other" }], messages: [{ dir: "in", text: "hi", at: h(-4.5) }] })).send, true);
  assert.equal(reason(sends(S({ ...w, messages: [{ dir: "in", text: "hi", at: h(-0.2) }] }))), "the student is chatting right now");
});

test("never while something is already waiting, never for someone who hasn't texted, never while muted", () => {
  const w = { mastery: { t1: 0.3 } };
  assert.equal(sends(S({ ...w, pendingQuiz: { questionId: "q1", attempts: 0 } })).send, false);
  assert.equal(sends(S({ ...w, pendingOffer: { kind: "round", expiresAt: h(2) } })).send, false);
  assert.equal(sends(S({ ...w, proposals: [{ id: "p", status: "pending" } as any] })).send, false);
  assert.equal(reason(sends(S({ ...w, openedByStudent: false }))), "student has not texted the line");
  assert.equal(reason(sends(S({ ...w, route: undefined }))), "student has not texted the line");
  assert.equal(reason(sends(S({ ...w, prefs: { mutedUntil: h(48) } }))), "muted by the student");
  assert.equal(sends(S({ ...w, prefs: { mutedUntil: h(-1) } })).send, true); // the mute has ended
});

test("backing off: two nudges ignored in a row stops the nudging, except a high-stakes deadline tomorrow", () => {
  const ignored = [{ at: h(-30), kind: "quiz" as const, key: "a" }, { at: h(-20), kind: "mastery" as const, key: "b" }];
  const w = { mastery: { t1: 0.3 } };
  assert.equal(ignoredStreak(S({ ...w, nudges: ignored }), NOW), 2);
  assert.equal(reason(sends(S({ ...w, nudges: ignored }))), "backing off: the last two went unanswered");
  const urgent = S({ ...w, nudges: ignored, exams: [{ ...S().exams[0]!, date: "2026-11-15T15:00:00.000Z" }] });
  assert.equal(sends(urgent).send, true);
  const replied = S({ ...w, nudges: ignored, messages: [{ dir: "in", text: "ok", at: h(-19) }] }); // answered the later one
  assert.equal(ignoredStreak(replied, NOW), 0);
  assert.equal(sends(replied).send, true);
});

test("a nudge too recent to judge is not counted as ignored; Scout texts never count", () => {
  assert.equal(ignoredStreak(S({ nudges: [{ at: h(-2), kind: "quiz", key: "a" }] }), NOW), 0);
  assert.equal(ignoredStreak(S({ nudges: [{ at: h(-40), kind: "scout", key: "s" }, { at: h(-30), kind: "scout", key: "s2" }] }), NOW), 0);
});

test("force (a demo control) skips the timing rules but never 'texted first' or 'something is waiting'", () => {
  const w = { mastery: { t1: 0.3 } };
  assert.equal(sends(S(w), { force: true }, new Date("2026-11-14T02:00:00-05:00")).send, true);
  assert.equal(sends(S({ ...w, counters: { day: "2026-11-14", quizzes: 0, nudges: 3 }, prefs: { mutedUntil: h(48) } }), { force: true }).send, true);
  assert.equal(sends(S({ ...w, pendingQuiz: { questionId: "q1", attempts: 0 } }), { force: true }).send, false);
  assert.equal(sends(S({ ...w, openedByStudent: false }), { force: true }).send, false);
});

test("a quiz offer on a weak topic beats a plain reminder, unless a big deadline is imminent", () => {
  const two = (weakDate: string, otherDate: string) => S({
    exams: [{ id: "e1", courseId: "c", name: "Essay", weight: 0.1, date: weakDate, topicIds: ["t1"] }, { id: "e2", courseId: "c", name: "Final", weight: 0.3, date: otherDate, topicIds: ["nope"] }],
    mastery: { t1: 0.2 }, questions: [q("q1", "t1")], unlockedQuestionIds: ["q1"],
  });
  const d = sends(two("2026-11-17T15:00:00.000Z", "2026-11-15T15:00:00.000Z".replace("15", "15")), { force: true }); // Final is 1 day out, 30%: imminent wins
  assert.ok(d.send && d.candidate.examName === "Final" && d.candidate.kind === "deadline");
  const e = sends(two("2026-11-17T15:00:00.000Z", "2026-11-22T15:00:00.000Z"), { force: true }); // Final is a week out: the weak topic gets the quiz offer
  assert.ok(e.send && e.candidate.kind === "mastery" && e.candidate.examName === "Essay");
});

test("a forced run (demo control) also ignores the lead-time window, so it can show a nudge for a faraway deadline", () => {
  const far = S({ mastery: { t1: 0.3 }, exams: [{ ...S().exams[0]!, date: "2026-11-30T15:00:00.000Z" }] }); // 16 days out
  assert.equal(reason(sends(far)), "nothing worth a nudge"); // the real rules stay quiet
  const d = sends(far, { force: true });
  assert.ok(d.send && d.candidate.kind === "mastery" && d.candidate.days === 16);
  const noQs = S({ questions: [], unlockedQuestionIds: [], exams: [{ ...S().exams[0]!, date: "2026-11-30T15:00:00.000Z" }] });
  const e = sends(noQs, { force: true });
  assert.ok(e.send && e.candidate.kind === "deadline");
});

test("morning quiz: mid-morning, once a day, not after practicing, not when ignored, not with nothing to ask", () => {
  const am = new Date("2026-11-14T09:30:00-05:00");
  const ok = (s: StudentState, now = am, o?: { force?: boolean }) => decideMorningQuiz(s, now, TZ, o);
  assert.equal(ok(S()).send, true);
  assert.equal(ok(S(), new Date("2026-11-14T14:00:00-05:00")).reason, "not morning");
  assert.equal(ok(S(), new Date("2026-11-14T08:00:00-05:00")).reason, "not morning");
  assert.equal(ok(S({ nudges: [{ at: am.toISOString(), kind: "morning", key: "m" }] })).reason, "already sent today's morning quiz");
  assert.equal(ok(S({ counters: { day: "2026-11-14", quizzes: 2, nudges: 0 } })).reason, "already practiced today");
  assert.equal(ok(S({ askedQuestionIds: ["q1", "q2"] })).reason, "no unasked questions");
  assert.equal(ok(S({ pendingQuiz: { questionId: "q1", attempts: 0 } })).reason, "a question or round is already open");
  assert.equal(ok(S({ prefs: { mutedUntil: "2027-01-01T00:00:00Z" } })).reason, "muted by the student");
  assert.equal(ok(S({ nudges: [{ at: "2026-11-12T15:00:00.000Z", kind: "morning", key: "a" }, { at: "2026-11-13T15:00:00.000Z", kind: "morning", key: "b" }] })).reason, "backing off: the last two went unanswered");
  assert.equal(ok(S(), new Date("2026-11-14T03:00:00-05:00"), { force: true }).send, true);
  assert.equal(ok(S({ openedByStudent: false }), am, { force: true }).send, false);
});
