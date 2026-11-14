import type { CalendarWriter, Clock, LLM, LlmTask, Messenger, Store } from "./interfaces.ts";
import type { StudentState } from "./types.ts";

export class FakeMessenger implements Messenger {
  sent: { studentId: string; text: string }[] = [];
  constructor(private onSend?: (studentId: string, text: string) => void) {}
  async send(studentId: string, text: string) { this.sent.push({ studentId, text }); this.onSend?.(studentId, text); }
  texts() { return this.sent.map((s) => s.text); }
}

/** Returns canned text per task; "" (the default) makes agents use their built-in fallback wording. */
export class FakeLLM implements LLM {
  calls: { task: LlmTask; user: string }[] = [];
  json: unknown = undefined;
  /** Per-task JSON answers; a function receives the prompt text. Falls back to `json`. */
  jsonByTask: Partial<Record<LlmTask, unknown | ((user: string) => unknown)>> = {};
  constructor(private canned: Partial<Record<LlmTask, string | (() => string)>> = {}, private fail = false) {}
  async extractJson(task: LlmTask, input: { user: string; attachments: unknown[] }) {
    this.calls.push({ task, user: input.user });
    if (this.fail) throw new Error("LLM unavailable");
    const v = task in this.jsonByTask ? this.jsonByTask[task] : this.json;
    return typeof v === "function" ? (v as (u: string) => unknown)(input.user) : v;
  }
  async text(task: LlmTask, input: { system: string; user: string }) {
    this.calls.push({ task, user: input.user });
    if (this.fail) throw new Error("LLM unavailable");
    const c = this.canned[task];
    return typeof c === "function" ? c() : (c ?? "");
  }
}

export class FakeCalendar implements CalendarWriter {
  events: { id: string; title: string; startISO: string; endISO: string }[] = [];
  private n = 0;
  async createEvent(e: { title: string; startISO: string; endISO: string; key?: string; owner?: string }) {
    const ev = { id: `fake_evt_${++this.n}`, title: e.title, startISO: e.startISO, endISO: e.endISO };
    this.events.push(ev);
    return { id: ev.id };
  }
  async deleteEvent(id: string) { this.events = this.events.filter((e) => e.id !== id); }
}

export class MemoryStore implements Store {
  private m = new Map<string, StudentState>();
  async ids() { return [...this.m.keys()]; }
  async load(id: string) { const s = this.m.get(id); return s ? structuredClone(s) : undefined; }
  async save(s: StudentState) { this.m.set(s.id, structuredClone(s)); }
}

export class FixedClock implements Clock {
  constructor(public t: Date) {}
  now() { return this.t; }
  advance(ms: number) { this.t = new Date(this.t.getTime() + ms); }
}
