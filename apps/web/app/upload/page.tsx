"use client";
import { useRef, useState } from "react";
import { usePresenterKey } from "@/lib/use-state";

type Result = { kind: "idle" } | { kind: "working" } | { kind: "ok"; summary: string; asking: string | null } | { kind: "duplicate" } | { kind: "error"; message: string };

export default function Upload() {
  const key = usePresenterKey();
  const input = useRef<HTMLInputElement>(null);
  const [names, setNames] = useState<string[]>([]);
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
      <h1>Upload a syllabus</h1>
      <p>{key ? "Choose the syllabus PDF, or its pages as images in order. The agent reads it and texts the student." : "Locked: open this page once with ?key=… to unlock."}</p>
      <div className="btns">
        <input ref={input} type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => setNames(Array.from(e.target.files ?? []).map((f) => f.name))} disabled={!key} />
        {names.length > 0 && <p style={{ margin: "4px 0 0", fontSize: 14 }}>{names.join(", ")}</p>}
        <button className="primary" disabled={!key || !names.length || result.kind === "working"} onClick={submit}>
          {result.kind === "working" ? "Reading the syllabus… about 15 seconds" : "Read it and text the student"}
        </button>
      </div>
      <div className="result">
        {result.kind === "ok" && (<><p style={{ color: "var(--good)", margin: "0 0 8px" }}>Done. The agent texted:</p>
          <p style={{ color: "var(--ink)", margin: 0 }}>“{result.summary}”</p>
          {result.asking && <p style={{ color: "var(--ink)", marginTop: 10 }}>Then asked: “{result.asking}”</p>}</>)}
        {result.kind === "duplicate" && <p style={{ color: "var(--ink)" }}>That exact syllabus is already installed, so I did nothing and sent no text. To start over, press Reset demo on the demo controls.</p>}
        {result.kind === "error" && <p style={{ color: "var(--bad)" }}>{result.message}</p>}
      </div>
      <p style={{ marginTop: 28 }}><a href="/">← Dashboard</a> · <a href="/demo">Demo controls</a></p>
    </main>
  );
}
