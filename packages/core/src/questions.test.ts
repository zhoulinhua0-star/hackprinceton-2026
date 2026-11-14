import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuestion, checkList, keepAgreed, renderForVerification, shuffleSeeded, validateRaw } from "./questions.ts";
import type { RawQuestion } from "./questions.ts";

const GOOD: RawQuestion = { prompt: "In the Odyssey, what keeps Odysseus from reaching Ithaca for ten years?", correctAnswer: "Poseidon's anger", distractors: ["A plague among his crew", "Penelope's suitors"], explanation: "Poseidon is furious that Odysseus blinded his son Polyphemus.", socratic: "Whose son did Odysseus blind, and how might that god react?", confidence: "high" };

test("validateRaw accepts a good question", () => assert.equal(validateRaw(GOOD).ok, true));

test("validateRaw rejects each kind of bad question", () => {
  const bad = (o: Partial<RawQuestion> | unknown) => { const r = validateRaw({ ...GOOD, ...(o as object) }); assert.equal(r.ok, false); return r.ok ? "" : r.reason; };
  assert.match(bad({ confidence: "low" }), /confident/);
  assert.match(bad({ prompt: "x".repeat(300) }), /too long/);
  assert.match(bad({ correctAnswer: "y".repeat(95) }), /choice is too long/);
  assert.equal(validateRaw({ ...GOOD, correctAnswer: "He kills a court official and must escape punishment" }).ok, true); // ~52 characters is normal for these answers
  assert.match(bad({ distractors: ["Poseidon's anger", "A plague"] }), /not distinct/);
  assert.match(bad({ distractors: ["Only one"] }), /two distractors/);
  assert.match(bad({ distractors: ["A plague", "All of the above"] }), /of the above/);
  assert.match(bad({ socratic: "Is it Poseidon's anger that stops him?" }), /contains the answer/);
  assert.match(bad({ socratic: "Think about the sea god." }), /not a question/);
  assert.match(bad({ explanation: "" }), /explanation missing/);
  assert.equal(validateRaw(null).ok, false);
});

test("a short correct answer in the hint is only rejected when it is long enough to be a real giveaway", () => {
  assert.equal(validateRaw({ ...GOOD, correctAnswer: "A", distractors: ["B stuff", "C stuff"], socratic: "Does a king act alone?" }).ok, true);
});

test("buildQuestion: code decides the order; the letter always points at the right text; deterministic per id", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const q = buildQuestion(GOOD, "t", `gen-t-${i}`);
    assert.equal(q.choices[q.correct], GOOD.correctAnswer);
    assert.deepEqual([q.choices.A, q.choices.B, q.choices.C].sort(), [GOOD.correctAnswer, ...GOOD.distractors].sort());
    assert.deepEqual(buildQuestion(GOOD, "t", `gen-t-${i}`), q);
    seen.add(q.correct);
  }
  assert.deepEqual([...seen].sort(), ["A", "B", "C"]); // not always the same position
  assert.equal(buildQuestion(GOOD, "t", "x").generated, true);
});

test("shuffleSeeded is a permutation and stable", () => {
  const a = shuffleSeeded([1, 2, 3, 4, 5], "s");
  assert.deepEqual([...a].sort(), [1, 2, 3, 4, 5]);
  assert.deepEqual(shuffleSeeded([1, 2, 3, 4, 5], "s"), a);
});

test("checkList drops invalid, low-confidence and duplicate questions with reasons", () => {
  const r = checkList({ questions: [GOOD, { ...GOOD }, { ...GOOD, prompt: "Another?", confidence: "low" }, { ...GOOD, prompt: "Different one?" }, "junk"] });
  assert.equal(r.valid.length, 2);
  assert.deepEqual(r.rejected.sort(), ["duplicate question", "model was not confident", "not an object"].sort());
  assert.deepEqual(checkList(undefined).rejected, ["no questions array"]);
});

test("the independent check: only questions answered the same way as the key survive", () => {
  const qs = [buildQuestion(GOOD, "t", "a"), buildQuestion({ ...GOOD, prompt: "Second?" }, "t", "b"), buildQuestion({ ...GOOD, prompt: "Third?" }, "t", "c"), buildQuestion({ ...GOOD, prompt: "Fourth?" }, "t", "d")];
  const wrong = (["A", "B", "C"] as const).find((l) => l !== qs[1]!.correct)!;
  const r = keepAgreed(qs, { answers: [{ id: "a", letter: qs[0]!.correct }, { id: "b", letter: wrong }, { id: "c", letter: "unsure" }] }); // d missing entirely
  assert.deepEqual(r.kept.map((q) => q.id), ["a"]);
  assert.equal(r.dropped, 3);
  assert.deepEqual(keepAgreed(qs, null).kept, []);
});

test("the checker never sees the answer key", () => {
  const q = buildQuestion(GOOD, "t", "a");
  const text = renderForVerification([q]);
  assert.match(text, /id=a/);
  assert.match(text, /A\) .*\nB\) .*\nC\) /);
  assert.equal(text.includes(GOOD.explanation), false);
  assert.equal(/correct|answer is/i.test(text.replace(q.prompt, "")), false);
});
