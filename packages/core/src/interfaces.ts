import type { StudentState } from "./types.ts";

export interface Messenger { send(studentId: string, text: string): Promise<void> }
export interface Clock { now(): Date }
export interface Store {
  ids(): Promise<string[]>;
  load(id: string): Promise<StudentState | undefined>;
  save(state: StudentState): Promise<void>;
}

export type LlmTask = "route" | "socratic" | "proposal" | "smalltalk" | "parse_syllabus" | "write_questions" | "verify_question" | "write_drill" | "grade_drill";
export interface Attachment { mediaType: "application/pdf" | "image/png" | "image/jpeg" | "image/webp" | "image/gif"; base64: string }
export interface LLM {
  text(task: LlmTask, input: { system: string; user: string }): Promise<string>;
  /** Reads documents/images and returns JSON that matches `schema` (forced tool call). The caller still validates it. */
  extractJson(task: LlmTask, input: { system: string; user: string; attachments: Attachment[]; toolName: string; schema: object }): Promise<unknown>;
}

/** Only the approve path may hold one of these. The Planner is built without it. */
export interface CalendarWriter {
  /** `key` makes the write idempotent: the same key can never create a second event. */
  createEvent(e: { title: string; startISO: string; endISO: string; key?: string; owner?: string }): Promise<{ id: string; link?: string }>;
  /** Used only by Reset demo, to remove events this agent created. */
  deleteEvent?(id: string): Promise<void>;
}

/** One line of a call transcript. */
export interface CallLine { role: "agent" | "user"; text: string }
/** Where a placed call stands. `pending` = still ringing, talking or being processed. */
export interface CallStatus { state: "pending" | "done" | "failed"; durationSecs?: number; transcript?: CallLine[]; answered?: boolean }
/** Places voice-drill phone calls (ElevenLabs over a Photon number). Behind an interface so tests use a fake. */
export interface Caller {
  placeCall(o: { to: string; variables: Record<string, string> }): Promise<{ callId: string }>;
  getCall(callId: string): Promise<CallStatus>;
}
