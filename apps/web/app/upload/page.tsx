"use client";
import { useRef, useState } from "react";
import { usePresenterKey } from "@/lib/use-state";
import { Character } from "../crew";

type Result = { kind: "idle" } | { kind: "working" } | { kind: "ok"; summary: string; asking: string | null } | { kind: "duplicate" } | { kind: "error"; message: string };

export default function Upload() {
  const key = usePresenterKey();
  const input = useRef<HTMLInputElement>(null);
  const [names, setNames] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const [result, setResult] = useState<Result>({ kind: "idle" });

  async function submit() {
    const files = Array.from(input.current?.files ?? []);
    if (!files.length || result.kind === "working") return;
    setResult({ kind: "working" });
    const form = new FormData();
    for (const f of files) form.append("file", f);
    try {
      const res = await fetch("/api/syllabus", { method: "POST", headers: { "x-demo-key": key ?? "" }, body: form });
      const body = await res.json().catch(() => ({}));
      setResult(res.ok && body.ok ? (body.duplicate ? { kind: "duplicate" } : { kind: "ok", summary: body.summary, asking: body.asking }) : { kind: "error", message: body.error ?? `Something went wrong (${res.status}).` });
    } catch { setResult({ kind: "error", message: "Could not reach the dashboard server." }); }
  }

  return (
    <main className="demo">
      <div className="demo-head">
        <Character kind="tutor" size={64} />
        <div>
          <h1>Upload a syllabus</h1>
          <p>{key ? "The agent reads it and texts the student." : "Locked: open this page once with ?key=… to unlock."}</p>
        </div>
      </div>
      {/* The file input covers the whole box, so both a click and a dropped file reach it. */}
      <div className={`drop${over ? " over" : ""}${key ? "" : " locked"}`} onDragEnter={() => setOver(true)} onDragLeave={() => setOver(false)} onDrop={() => setOver(false)}>
        <b>{names.length ? `${names.length} file${names.length === 1 ? "" : "s"} chosen` : "Drop a syllabus here"}</b>
        <p>{names.length ? "Click or drop again to change." : "A PDF, or its pages as images in order. Or click to choose."}</p>
        {names.length > 0 && <p className="files">{names.join(", ")}</p>}
        <input ref={input} type="file" multiple aria-label="Syllabus files" accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => setNames(Array.from(e.target.files ?? []).map((f) => f.name))} disabled={!key} />
      </div>
      <button className="btn primary wide" disabled={!key || !names.length || result.kind === "working"} onClick={submit}>
        {result.kind === "working" ? "Reading the syllabus… about 15 seconds" : "Read it and text the student"}
      </button>
      {result.kind !== "idle" && result.kind !== "working" && (
        <div className="result box" role="status">
          {result.kind === "ok" && (<><p style={{ color: "var(--good)", margin: "0 0 8px", fontWeight: 600 }}>Done. The agent texted:</p>
            <p style={{ margin: 0 }}>“{result.summary}”</p>
            {result.asking && <p style={{ margin: "10px 0 0" }}>Then asked: “{result.asking}”</p>}</>)}
          {result.kind === "duplicate" && <p style={{ margin: 0 }}>That exact syllabus is already installed, so I did nothing and sent no text. To start over, press Reset demo on the demo controls.</p>}
          {result.kind === "error" && <p style={{ color: "var(--bad)", margin: 0 }}>{result.message}</p>}
        </div>
      )}
      <p className="nav"><a href="/">← Dashboard</a> · <a href="/demo">Demo controls</a></p>
    </main>
  );
}
