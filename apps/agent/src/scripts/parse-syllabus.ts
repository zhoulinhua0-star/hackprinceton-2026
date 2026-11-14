// Try the real reader on a file. Costs a few cents of Bedrock.
//   npm run parse -w @syllabus-crew/agent -- ../../seed/macro-syllabus.jpg
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { crunchWeeks, describe, nextQuestion } from "@syllabus-crew/core";
import type { Attachment } from "@syllabus-crew/core";
import { BedrockLLM } from "../adapters/bedrock.ts";
import { readSyllabus } from "../engine/syllabus.ts";

const files = process.argv.slice(2);
if (!files.length) throw new Error("usage: parse <file.pdf|image> [more page images...]");
const TYPES: Record<string, Attachment["mediaType"]> = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
const attachments = files.map((f) => {
  const mediaType = TYPES[extname(f).toLowerCase()];
  if (!mediaType) throw new Error(`unsupported file type: ${f}`);
  return { mediaType, base64: readFileSync(f).toString("base64") };
});

const tz = process.env.STUDENT_TIMEZONE ?? "America/New_York";
const llm = new BedrockLLM({ region: process.env.AWS_REGION!, defaultModel: process.env.BEDROCK_MODEL_DEFAULT!, strongModel: process.env.BEDROCK_MODEL_STRONG! });
const t = Date.now();
const r = await readSyllabus(llm, attachments, tz);
console.log(`${((Date.now() - t) / 1000).toFixed(1)}s, ${r.attempts} attempt(s)`);
if (!r.ok) {
  console.log("FAILED:", r.errors);
  const a = (r.lastRaw as any)?.assessments ?? [];
  for (const x of a) console.log(`  ${x.kind} ${x.weightPercent}% ${x.date ?? ""} ${x.name}`);
  process.exit(1);
}
console.log("\n== parsed ==\n" + JSON.stringify(r.parsed, null, 2));
console.log("\n== agent would text ==\n" + describe(r.parsed, r.patch, tz, new Date()));
const q = nextQuestion(r.patch.missing, r.parsed.courseName);
console.log(q ? `\n== then ask ==\n${q}  (${r.patch.missing.length} open item(s))` : "\n== nothing missing ==");
console.log("\n== crunch weeks ==", JSON.stringify(crunchWeeks(r.patch.deadlines, tz)));
