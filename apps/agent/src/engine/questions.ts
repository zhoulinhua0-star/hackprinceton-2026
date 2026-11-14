// Writing quiz questions for a real syllabus's topics. The model writes; code validates, shuffles, and an independent
// model call double-checks each answer key. Only questions that survive all of that are ever sent to a student.
import { QUESTIONS_SCHEMA, VERIFY_SCHEMA, buildQuestion, checkList, keepAgreed, renderForVerification } from "@syllabus-crew/core";
import type { LLM, Question } from "@syllabus-crew/core";
import { rules } from "./ctx.ts";

export interface TopicJob { topicId: string; topic: string; assessment: string; course: string }
export interface WriteStats { topics: number; written: number; invalid: number; disagreed: number; kept: number; failedTopics: number; reasons: Record<string, number>; errors: string[] }

/** Writes `perTopic` questions for each topic (a few at a time), then verifies them. `startAt` keeps ids unique across rounds. */
export async function writeQuestions(llm: LLM, jobs: TopicJob[], perTopic: number, startAt = 0, concurrency = 2): Promise<{ questions: Question[]; stats: WriteStats }> {
  const stats: WriteStats = { topics: jobs.length, written: 0, invalid: 0, disagreed: 0, kept: 0, failedTopics: 0, reasons: {}, errors: [] };
  const questions: Question[] = [];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const i = next++, job = jobs[i]!;
      try {
        const ask = (user: string) => llm.extractJson("write_questions", { system: rules("question-writer"), user, attachments: [], toolName: "record_questions", schema: QUESTIONS_SCHEMA });
        const base = `Course: ${job.course}\nAssignment this feeds: ${job.assessment}\nReading / topic: ${job.topic}\n\n`;
        let { valid, rejected } = checkList(await ask(`${base}Write ${perTopic + 1} different questions (a spare, in case one is rejected).`));
        stats.invalid += rejected.length;
        for (const r of rejected) stats.reasons[r] = (stats.reasons[r] ?? 0) + 1;
        if (valid.length < perTopic) { // one more try, telling the model exactly what was wrong
          const why = [...new Set(rejected)].map((r) => r === "a choice is too long" ? "an answer choice was too long (keep every choice under 70 characters)" : r).join("; ");
          const again = checkList(await ask(`${base}Write ${perTopic - valid.length + 1} more different questions. Earlier ones were rejected: ${why}. Avoid these questions: ${valid.map((q) => q.prompt).join(" | ") || "(none yet)"}`));
          stats.invalid += again.rejected.length;
          for (const r of again.rejected) stats.reasons[r] = (stats.reasons[r] ?? 0) + 1;
          valid = checkList({ questions: [...valid, ...again.valid] }).valid;
        }
        const built = valid.slice(0, perTopic).map((q, n) => buildQuestion(q, job.topicId, `gen-${job.topicId}-${startAt + n + 1}`));
        stats.written += built.length;
        if (!built.length) continue;
        const check = await llm.extractJson("verify_question", {
          system: "You are a careful teaching assistant. Answer each multiple-choice question yourself, using only what is widely established about the material. If you are not sure which choice is correct, answer \"unsure\".",
          user: renderForVerification(built), attachments: [], toolName: "record_answers", schema: VERIFY_SCHEMA,
        });
        const { kept, dropped } = keepAgreed(built, check);
        stats.disagreed += dropped; stats.kept += kept.length;
        questions.push(...kept);
      } catch (e) {
        stats.failedTopics += 1; // one topic failing never sinks the rest
        stats.errors.push(String(e instanceof Error ? e.message : e).slice(0, 160));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  return { questions, stats };
}
