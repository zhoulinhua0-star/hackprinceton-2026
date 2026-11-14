import type { Deadline, Missing, ParsedSyllabus } from "./syllabus.ts";

/** day1 / week6 are the two demo states; live = built from a real syllabus. */
export type Phase = "day1" | "week6" | "live";
export type Choice = "A" | "B" | "C";

export interface Course { id: string; name: string }
export interface Exam { id: string; courseId: string; name: string; weight: number; date: string; topicIds: string[] }
export interface Topic { id: string; courseId: string; name: string; short: string }

export interface Question {
  id: string;
  topicId: string;
  prompt: string;
  choices: Record<Choice, string>;
  correct: Choice;
  explanation: string;
  /** Seed Socratic hint, used as the fallback when the LLM is slow or unavailable. */
  socratic: string;
  sourceId?: string;
  /** Written by the model (and checked), as opposed to the hand-written demo seed. */
  generated?: boolean;
}

export interface Material { id: string; courseId: string; title: string; sender: string; questionIds: string[] }
export interface PendingQuiz { questionId: string; attempts: number; /** The student already asked for (and got) a hint. */ hinted?: boolean }

export interface Proposal {
  id: string;
  status: "pending" | "approved" | "declined";
  topicId: string;
  label: string;
  text: string;
  event: { title: string; startISO: string; endISO: string };
  createdAt: string;
  calendarEventId?: string;
  calendarLink?: string;
}

export interface Reminder { id: string; text: string; dueISO: string; status: "pending" | "sent"; createdAt: string; sentAt?: string }
export interface NudgeRecord { at: string; kind: "mastery" | "quiz" | "deadline" | "morning" | "scout"; key: string }
export interface Msg { dir: "in" | "out"; text: string; at: string; kind?: string }
export interface Counters { day: string; quizzes: number; nudges: number }
export interface Busy { startISO: string; endISO: string }

export interface StudentState {
  id: string;
  phase: Phase;
  /** True once the student has texted the line. The agent never texts anyone before this. */
  openedByStudent: boolean;
  parsed: boolean;
  courses: Course[];
  exams: Exam[];
  topics: Topic[];
  mastery: Record<string, number>;
  questions: Question[];
  unlockedQuestionIds: string[];
  askedQuestionIds: string[];
  /** Material Scout has not "found" yet (staged for the demo). */
  inbox: Material[];
  foundMaterialIds: string[];
  pendingQuiz?: PendingQuiz;
  proposals: Proposal[];
  messages: Msg[];
  counters: Counters;
  busy: Busy[];
  preferredWeekday?: number;
  /** Where to send texts for this student (Photon space + the agent's user id). */
  route?: { spaceId: string; senderId: string };
  /** The syllabus as read (live phase). Kept so the student's answers can update it. */
  syllabus?: ParsedSyllabus;
  /** Fingerprint of the uploaded file(s), so uploading the same thing twice does nothing. */
  syllabusHash?: string;
  /** Every dated item, including small ones (they count toward crunch weeks and show in the semester list). */
  deadlines?: Deadline[];
  /** The question the agent is waiting on (one at a time). */
  pendingAsk?: { missing: Missing; tries: number };
  /** A practice round the student asked for: questions keep coming after each answer until `total` are done. */
  session?: { total: number; asked: number; answered: number; firstTry: number; topicIds: string[] };
  /** Reminders the student asked for ("remind me Sunday to start the essay"). Always delivered. */
  reminders?: Reminder[];
  /** What the agent has sent on its own (nudges, morning quizzes, Scout), for backoff and "once a day" rules. */
  nudges?: NudgeRecord[];
  /** A yes/no question the agent asked on its own ("want a quick round?"). */
  pendingOffer?: { kind: "round"; topicId?: string; expiresAt: string };
  prefs?: { mutedUntil?: string };
  /** Where the quiz-question writer is: none yet, working, done, or failed. */
  questionsStatus?: "generating" | "ready" | "failed";
  /** Questions the student skipped; never asked again. */
  skippedAsks?: string[];
  /** What the student named their agent. Unset = the default name. */
  agentName?: string;
  /** How the agent talks (set phrases only). Unset = chill. */
  vibe?: "chill" | "strict" | "hype";
  /** First-contact questions still open: the name, then the vibe, then the class they worry about most. */
  pendingName?: { step: "name" | "vibe" | "focus"; tries: number };
  /** The student's answer to "which class worries you most?" (their words). */
  focusCourse?: string;
}
