import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Store, StudentState } from "@syllabus-crew/core";

/** State in one JSON file, so restarting the agent mid-demo doesn't wipe it. In-memory reads, atomic writes. */
export class FileStore implements Store {
  private m = new Map<string, StudentState>();
  constructor(private path: string) {
    if (existsSync(path)) {
      try { for (const s of JSON.parse(readFileSync(path, "utf8")) as StudentState[]) this.m.set(s.id, s); } catch { try { copyFileSync(path, `${path}.corrupt-${Date.now()}`); } catch { /* nothing to back up */ } } // keep the bad file, start empty
    }
  }
  async ids() { return [...this.m.keys()]; }
  async load(id: string) { const s = this.m.get(id); return s ? structuredClone(s) : undefined; }
  async save(s: StudentState) {
    this.m.set(s.id, structuredClone(s));
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify([...this.m.values()]));
    renameSync(tmp, this.path);
  }
}
