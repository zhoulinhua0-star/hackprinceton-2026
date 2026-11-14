import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanName, isNameQuestion, parseNameAnswer, parseRename, parseVibe, parseVibeCommand, voice } from "./naming.ts";

test("a name answer: plain, with a lead-in, with punctuation", () => {
  assert.deepEqual(parseNameAnswer("Juno"), { kind: "name", name: "Juno" });
  assert.deepEqual(parseNameAnswer("call you Momo!"), { kind: "name", name: "Momo" });
  assert.deepEqual(parseNameAnswer("I'll call you Big Mac"), { kind: "name", name: "Big Mac" });
  assert.deepEqual(parseNameAnswer("how about Pip?"), { kind: "name", name: "Pip" });
});

test("passing on the name gives the default; a sentence or a link is unclear", () => {
  for (const t of ["skip", "idk", "you pick", "whatever", "no"]) assert.deepEqual(parseNameAnswer(t), { kind: "default" }, t);
  assert.equal(parseNameAnswer("I have an exam tomorrow and need help").kind, "unclear");
  assert.equal(parseNameAnswer("http://evil.example").kind, "unclear");
  assert.equal(cleanName("x".repeat(21)), null);
});

test("rename commands, and things that are not renames", () => {
  assert.equal(parseRename("call yourself Kiki"), "Kiki");
  assert.equal(parseRename("I'll call you Momo"), "Momo");
  assert.equal(parseRename("your name is now Pip."), "Pip");
  assert.equal(parseRename("change your name to Dean"), "Dean");
  assert.equal(parseRename("call me later"), null);
  assert.equal(parseRename("quiz me"), null);
});

test("vibes: words, numbers, and the command form", () => {
  assert.equal(parseVibe("CHILL"), "chill");
  assert.equal(parseVibe("2"), "strict");
  assert.equal(parseVibe("hype mode"), "hype");
  assert.equal(parseVibe("B"), null);
  assert.equal(parseVibeCommand("be strict"), "strict");
  assert.equal(parseVibeCommand("switch to hype"), "hype");
  assert.equal(parseVibeCommand("chill"), null); // a bare word outside onboarding changes nothing
  assert.equal(parseVibeCommand("2"), null);
});

test("the default voice keeps the original wording", () => {
  assert.equal(voice(undefined).correct, "Correct!");
  assert.equal(voice("chill").miss, "Not quite.");
  assert.notEqual(voice("strict").miss, voice("hype").miss);
  assert.ok(isNameQuestion("what's your name?"));
  assert.ok(!isNameQuestion("quiz me"));
});
