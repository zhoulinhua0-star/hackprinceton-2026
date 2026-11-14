import { SYLLABUS_SCHEMA, toPatch, validateParsed } from "@syllabus-crew/core";
import type { Attachment, LLM, ParsedSyllabus, Patch } from "@syllabus-crew/core";
import { rules } from "./ctx.ts";

export type ReadResult = { ok: true; parsed: ParsedSyllabus; patch: Patch; attempts: number } | { ok: false; errors: string[]; attempts: number; lastRaw?: unknown };

/** Reads a syllabus (PDF or page images). The model's answer is validated; one retry feeds the errors back. */
export async function readSyllabus(llm: LLM, attachments: Attachment[], tz: string, now: Date = new Date()): Promise<ReadResult> {
  const today = now.toISOString().slice(0, 10);
  const base = `Today's date is ${today}. Read the attached syllabus and record it with the tool. Pages are in order. When the syllabus gives dates without a year, use the year that puts the term closest to today.`;
  let errors: string[] = [];
  let lastRaw: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const user = attempt === 1 ? base : `${base}\n\nYour previous answer was rejected:\n- ${errors.join("\n- ")}\nFix exactly these problems.`;
    try {
      const raw = await llm.extractJson("parse_syllabus", { system: rules("syllabus"), user, attachments, toolName: "record_syllabus", schema: SYLLABUS_SCHEMA });
      lastRaw = raw;
      const v = validateParsed(raw, now);
      if (v.ok) return { ok: true, parsed: v.value, patch: toPatch(v.value, tz), attempts: attempt };
      errors = v.errors;
    } catch (e) {
      errors = [`model call failed: ${e instanceof Error ? e.message : String(e)}`];
    }
  }
  return { ok: false, errors, attempts: 2, lastRaw };
}
