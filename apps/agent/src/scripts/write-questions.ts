// Real model, real syllabus: writes and double-checks questions for the next few topics and prints them for review.
//   npm run questions -w @syllabus-crew/agent -- ../../seed/private/real-syllabus.pdf [topics=3] [perTopic=3]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { rankTopics, toPatch } from "@syllabus-crew/core";
import type { ParsedSyllabus, StudentState } from "@syllabus-crew/core";
import { BedrockLLM } from "../adapters/bedrock.ts";
import { readSyllabus } from "../engine/syllabus.ts";
import { writeQuestions } from "../engine/questions.ts";

const [file, nTopics = "3", perTopic = "3"] = process.argv.slice(2);
if (!file) throw new Error("usage: questions <syllabus.pdf> [topics] [perTopic]");
const tz = process.env.STUDENT_TIMEZONE ?? "America/New_York";
const llm = new BedrockLLM({ region: process.env.AWS_REGION!, defaultModel: process.env.BEDROCK_MODEL_DEFAULT!, strongModel: process.env.BEDROCK_MODEL_STRONG! });

const cache = new URL("../../../../.data/last-parse.json", import.meta.url).pathname;
let parsed: ParsedSyllabus;
if (existsSync(cache) && JSON.parse(readFileSync(cache, "utf8")).file === file) parsed = JSON.parse(readFileSync(cache, "utf8")).parsed;
else {
  const r = await readSyllabus(llm, [{ mediaType: file.endsWith(".pdf") ? "application/pdf" : "image/jpeg", base64: readFileSync(file).toString("base64") }], tz);
  if (!r.ok) throw new Error(`parse failed: ${r.errors.join("; ")}`);
  parsed = r.parsed;
  mkdirSync(new URL("../../../../.data", import.meta.url).pathname, { recursive: true });
  writeFileSync(cache, JSON.stringify({ file, parsed }));
}

const patch = toPatch(parsed, tz);
const state = { exams: patch.exams, mastery: {}, topics: patch.topics, courses: patch.courses } as unknown as StudentState;
const jobs = rankTopics(state, new Date(), tz)
  .map(({ topicId }) => ({ topicId, topic: patch.topics.find((t) => t.id === topicId)!, exam: patch.exams.find((e) => e.topicIds.includes(topicId))! }))
  .filter((j) => !/^cumulative$/i.test(j.topic.name)).slice(0, Number(nTopics))
  .map((j) => ({ topicId: j.topicId, topic: j.topic.name, assessment: j.exam.name, course: patch.courses[0]!.name }));

console.log(`Writing ${perTopic} questions for ${jobs.length} topic(s):`); jobs.forEach((j) => console.log(`  - ${j.topic}  (${j.assessment})`));
const t = Date.now();
const { questions, stats } = await writeQuestions(llm, jobs, Number(perTopic));
console.log(`\n${((Date.now() - t) / 1000).toFixed(1)}s  ${JSON.stringify(stats)}\n`);
for (const q of questions) {
  console.log(`[${jobs.find((j) => j.topicId === q.topicId)!.topic}]`);
  console.log(`Q: ${q.prompt}\n  A) ${q.choices.A}\n  B) ${q.choices.B}\n  C) ${q.choices.C}\n  correct: ${q.correct}  | ${q.explanation}\n  hint: ${q.socratic}\n`);
}
