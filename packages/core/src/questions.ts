// Quiz questions written by the model, checked by code. The model supplies the words (a correct answer and two wrong
// ones); code decides the A/B/C order, validates the format, and keeps only questions an independent check agrees with.
import type { Choice, Question } from "./types.ts";

export interface RawQuestion { prompt: string; correctAnswer: string; distractors: string[]; explanation: string; socratic: string; confidence: "high" | "low" }

export const QUESTIONS_SCHEMA = {
  type: "object", additionalProperties: false, required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["prompt", "correctAnswer", "distractors", "explanation", "socratic", "confidence"],
        properties: {
          prompt: { type: "string", description: "The question, under 200 characters, answerable without the page in front of you" },
          correctAnswer: { type: "string", description: "The one correct answer, short (under 70 characters)" },
          distractors: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 2, description: "Two plausible but wrong answers, each short" },
          explanation: { type: "string", description: "One sentence saying why the correct answer is right" },
          socratic: { type: "string", description: "One short guiding question for a student who got it wrong. It must NOT reveal or contain the correct answer." },
          confidence: { enum: ["high", "low"], description: "high only if you are certain this is accurate and standard for this material" },
        },
      },
    },
  },
} as const;

export const VERIFY_SCHEMA = {
  type: "object", additionalProperties: false, required: ["answers"],
  properties: { answers: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "letter"], properties: { id: { type: "string" }, letter: { enum: ["A", "B", "C", "unsure"] } } } } },
} as const;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export type Checked = { ok: true; q: RawQuestion } | { ok: false; reason: string };

/** Format and safety checks on one raw question. */
export function validateRaw(raw: unknown): Checked {
  const o = raw as any;
  if (!o || typeof o !== "object") return { ok: false, reason: "not an object" };
  for (const k of ["prompt", "correctAnswer", "explanation", "socratic"]) if (typeof o[k] !== "string" || !o[k].trim()) return { ok: false, reason: `${k} missing` };
  if (!Array.isArray(o.distractors) || o.distractors.length !== 2 || o.distractors.some((d: unknown) => typeof d !== "string" || !d.trim())) return { ok: false, reason: "need exactly two distractors" };
  if (o.confidence !== "high") return { ok: false, reason: "model was not confident" };
  const q: RawQuestion = { prompt: o.prompt.trim(), correctAnswer: o.correctAnswer.trim(), distractors: o.distractors.map((d: string) => d.trim()), explanation: o.explanation.trim(), socratic: o.socratic.trim(), confidence: "high" };
  if (q.prompt.length > 220) return { ok: false, reason: "prompt too long" };
  if (q.explanation.length > 220 || q.socratic.length > 220) return { ok: false, reason: "explanation/hint too long" };
  const choices = [q.correctAnswer, ...q.distractors];
  if (choices.some((c) => c.length > 90)) return { ok: false, reason: "a choice is too long" };
  if (new Set(choices.map(norm)).size !== 3) return { ok: false, reason: "choices are not distinct" };
  if (choices.some((c) => /\b(all|none|both) of the above\b/i.test(c))) return { ok: false, reason: "'of the above' choice" };
  if (norm(q.socratic).includes(norm(q.correctAnswer)) && norm(q.correctAnswer).length >= 4) return { ok: false, reason: "the hint contains the answer" };
  if (!/[?]$/.test(q.socratic)) return { ok: false, reason: "the hint is not a question" };
  return { ok: true, q };
}

// ---- seeded shuffle (so the same question always has the same order) ----
function hash(str: string): number { let h = 1779033703 ^ str.length; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return h >>> 0; }
function rng(seed: number) { return () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function shuffleSeeded<T>(xs: readonly T[], seed: string): T[] {
  const a = [...xs], r = rng(hash(seed));
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}

/** Puts a validated raw question into A/B/C form. Code, not the model, decides which letter is correct. */
export function buildQuestion(raw: RawQuestion, topicId: string, id: string, sourceId?: string): Question {
  const order = shuffleSeeded([raw.correctAnswer, ...raw.distractors], id);
  const letters: Choice[] = ["A", "B", "C"];
  const choices = { A: order[0]!, B: order[1]!, C: order[2]! } as Record<Choice, string>;
  const correct = letters[order.indexOf(raw.correctAnswer)]!;
  return { id, topicId, prompt: raw.prompt, choices, correct, explanation: raw.explanation, socratic: raw.socratic, generated: true, ...(sourceId ? { sourceId } : {}) };
}

/** Splits the model's list into valid questions and reasons for the rest. */
export function checkList(json: unknown): { valid: RawQuestion[]; rejected: string[] } {
  const list = (json as any)?.questions;
  if (!Array.isArray(list)) return { valid: [], rejected: ["no questions array"] };
  const valid: RawQuestion[] = [], rejected: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const c = validateRaw(item);
    if (!c.ok) { rejected.push(c.reason); continue; }
    if (seen.has(norm(c.q.prompt))) { rejected.push("duplicate question"); continue; }
    seen.add(norm(c.q.prompt));
    valid.push(c.q);
  }
  return { valid, rejected };
}

/** What the independent checker sees: the question and its choices, never the answer. */
export function renderForVerification(qs: Question[]): string {
  return qs.map((q) => `id=${q.id}\n${q.prompt}\nA) ${q.choices.A}\nB) ${q.choices.B}\nC) ${q.choices.C}`).join("\n\n");
}

/** Keeps only the questions the independent checker answered the same way as the key. */
export function keepAgreed(qs: Question[], verification: unknown): { kept: Question[]; dropped: number } {
  const answers = new Map<string, string>();
  for (const a of ((verification as any)?.answers ?? []) as { id?: unknown; letter?: unknown }[]) if (typeof a?.id === "string" && typeof a.letter === "string") answers.set(a.id, a.letter);
  const kept = qs.filter((q) => answers.get(q.id) === q.correct);
  return { kept, dropped: qs.length - kept.length };
}
