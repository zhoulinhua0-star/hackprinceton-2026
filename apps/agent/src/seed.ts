// Demo seed data. Day 1 = fresh student. Week 6 = syllabus parsed, quiz history, mastery.
import { localDay, zoned } from "@syllabus-crew/core";
import type { StudentState } from "@syllabus-crew/core";

const base = (id: string): StudentState => ({
  id, phase: "day1", openedByStudent: false, parsed: false,
  courses: [], exams: [], topics: [], mastery: {}, questions: [], unlockedQuestionIds: [], askedQuestionIds: [],
  inbox: [], foundMaterialIds: [], proposals: [], messages: [],
  counters: { day: "", quizzes: 0, nudges: 0 }, busy: [],
});

export const day1State = (id: string, openedByStudent = false): StudentState => ({ ...base(id), openedByStudent });

/** What the staged syllabus photo "parses" to. Loaded instead of calling Textract + the LLM. */
export function stagedParse(now: Date, tz = "America/New_York") {
  const [y, m, d] = localDay(now, tz).split("-").map(Number) as [number, number, number];
  const exam = zoned(y, m, d + 6, 10, 0, tz); // exactly 6 calendar days out, 10am
  return {
    courses: [{ id: "macro", name: "Macro" }],
    exams: [{ id: "exam2", courseId: "macro", name: "Exam 2", weight: 0.25, date: exam.toISOString(), topicIds: ["ch4", "ch5", "ch6"] }],
    topics: [
      { id: "ch4", courseId: "macro", name: "Ch. 4: Money supply", short: "chapter 4" },
      { id: "ch5", courseId: "macro", name: "Ch. 5: Interest rates", short: "chapter 5" },
      { id: "ch6", courseId: "macro", name: "Ch. 6: Fiscal policy", short: "chapter 6" },
    ],
    summary: "Got it. Exam 2 is 25% and covers chapters 4-6. Week 9 looks heavy.",
  };
}

const QUESTIONS = [
  { id: "q-ch4-1", topicId: "ch4", prompt: "When the central bank buys government bonds, what happens to the money supply?",
    choices: { A: "It increases", B: "It decreases", C: "It stays the same" }, correct: "A" as const,
    explanation: "Buying bonds puts cash into banks, which increases the money supply.",
    socratic: "When the central bank pays for the bonds, where does that money end up?" },
  { id: "q-ch6-1", topicId: "ch6", prompt: "A government increases spending without raising taxes. What happens to the budget deficit?",
    choices: { A: "It shrinks", B: "It grows", C: "It is unchanged" }, correct: "B" as const,
    explanation: "More spending with the same tax revenue widens the gap.",
    socratic: "If spending goes up and tax revenue stays put, which side of the ledger is bigger?" },
  // Grounded in the staged "Week 6 slides"; unlocked when Scout finds them.
  { id: "q-ch5-1", topicId: "ch5", sourceId: "w6-slides",
    prompt: "If the Fed raises rates, what happens to investment spending?",
    choices: { A: "Falls", B: "Rises", C: "No change" }, correct: "A" as const,
    explanation: "Higher rates make borrowing costlier, so firms invest less.",
    socratic: "If borrowing gets more expensive, would a firm build a new factory sooner or later?" },
  { id: "q-ch5-2", topicId: "ch5", sourceId: "w6-slides",
    prompt: "In the loanable funds model, what does a higher interest rate do to saving?",
    choices: { A: "Discourages it", B: "Encourages it", C: "Has no effect" }, correct: "B" as const,
    explanation: "A higher return on saving makes people save more.",
    socratic: "If a bank pays you more for every dollar you save, would you save more or less?" },
];

export function week6State(id: string, now: Date, openedByStudent = true, tz = "America/New_York"): StudentState {
  const p = stagedParse(now, tz);
  const s = base(id);
  return {
    ...s, id, phase: "week6", openedByStudent, parsed: true,
    courses: p.courses, exams: p.exams, topics: p.topics,
    mastery: { ch4: 0.82, ch5: 0.5, ch6: 0.61 },
    questions: QUESTIONS,
    unlockedQuestionIds: ["q-ch4-1", "q-ch6-1"],
    inbox: [{ id: "w6-slides", courseId: "macro", title: "Week 6 slides", sender: "Prof. Lee", questionIds: ["q-ch5-1", "q-ch5-2"] }],
    preferredWeekday: 2, // Tuesday
  };
}
