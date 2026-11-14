import { readFileSync } from "node:fs";
import type { Attachment, Caller, CardStore, Clock, LLM, LlmTask, Messenger, Store, StudentState } from "@syllabus-crew/core";

export interface Opts {
  /** Demo controls bypass quiet hours and daily caps. */
  bypassLimits: Bypass;
  dashboardUrl: string;
  /** Pause before the proposal text, so it lands after the follow-up. */
  proposalDelayMs: number;
  llmTimeoutMs: number;
  /** Let the model word proposals (guarded). Off by default: the demo uses the code's exact wording. */
  llmProposals: boolean;
  /** How many questions a practice round has when the student asks for a quiz. */
  sessionLength: number;
  /** Pause before the next question arrives, so it reads like a person typing. */
  nextQuestionDelayMs: number;
  /** Stage demo: a texted photo loads the stored Macro syllabus instantly instead of being read. */
  stagedPhoto: boolean;
  /** How long to wait after the last texted page before reading, so a multi-page syllabus is read as one. */
  intakeWaitMs: number;
  /** The number voice drills call from, as the student will see it ("+16097854521"). */
  voiceNumber?: string;
  /** The iMessage line's number ("+1628..."), for the contact card. Unset = no card. */
  lineNumber?: string;
}

/** Demo controls and the demo student bypass quiet hours and caps. `true` = everyone; a list = only those students. */
export type Bypass = boolean | string[];

/** What the Planner, Tutor and Scout may use. Deliberately has no calendar. */
export interface Deps { store: Store; messenger: Messenger; llm: LLM; clock: Clock; tz: string; opts: Opts; /** Voice drills; unset = not set up. */ caller?: Caller; /** Tap-to-open cards; unset = text only. */ cards?: CardStore }

export interface Ctx { deps: Deps; state: StudentState; say(text: string, kind?: string): Promise<void>; commit(): Promise<void> }

export function makeCtx(deps: Deps, state: StudentState): Ctx {
  const commit = () => deps.store.save(state);
  return {
    deps, state, commit,
    // Send first, then record. If the send throws, nothing about this message (or the state change that
    // led to it, such as an open quiz or a spent daily cap) is persisted, so the thread and state never disagree.
    async say(text, kind) {
      await deps.messenger.send(state.id, text);
      state.messages.push({ dir: "out", text, at: deps.clock.now().toISOString(), kind });
      state.messages = state.messages.slice(-200);
      await commit();
    },
  };
}

export function rules(name: string): string {
  try { return readFileSync(new URL(`../../../../agents/${name}.md`, import.meta.url), "utf8"); } catch { return ""; }
}

/** LLM call with a timeout and a guaranteed fallback, so slow Wi-Fi or an outage never stalls the thread. */
export async function safeText(
  deps: Deps, task: LlmTask, agent: string, user: string, fallback: string, accept: (t: string) => boolean = () => true, systemExtra = "",
  images?: Attachment[],
): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const out = await Promise.race([
      deps.llm.text(task, { system: rules(agent) + systemExtra, user, ...(images?.length ? { images } : {}) }),
      new Promise<string>((_, rej) => { timer = setTimeout(() => rej(new Error("llm timeout")), deps.opts.llmTimeoutMs); }),
    ]);
    const t = out?.trim();
    return t && accept(t) ? t : fallback;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

/** The line this student texts: the one their Photon seat landed on, else the configured line (DECISIONS #110). */
export const lineFor = (deps: Deps, state: StudentState): string | undefined => state.route?.line ?? deps.opts.lineNumber;

export const bypassFor = (deps: Deps, studentId: string): boolean =>
  deps.opts.bypassLimits === true || (Array.isArray(deps.opts.bypassLimits) && deps.opts.bypassLimits.includes(studentId));

export const sleep = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());
