"use client";
import { useState } from "react";
import { usePresenterKey } from "@/lib/use-state";

const CONTROLS = [
  { action: "week6", label: "Switch to Week 6", hint: "Fast forward: loads the parsed syllabus, quiz history and mastery." },
  { action: "scout", label: "Run Scout now", hint: "Finds the Week 6 slides, then sends the first quiz." },
  { action: "quiz", label: "Send quiz now", hint: "Sends the next question immediately." },
  { action: "questions", label: "Write quiz questions", hint: "For a real syllabus: writes and double-checks practice questions on the upcoming readings (about a minute)." },
  { action: "nudgedry", label: "Nudger: what would you do now? (dry run)", hint: "Applies the real rules (time window, daily limit, not mid-conversation) and shows the decision. Sends nothing." },
  { action: "nudge", label: "Run Nudger now", hint: "Skips the timing rules and sends the nudge that matters most right now, to show it live." },
  { action: "reset", label: "Reset demo", hint: "Back to Day 1: clears quiz state, proposals and mastery. The thread stays open." },
];

export default function Demo() {
  const key = usePresenterKey();
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(action: string) {
    if (busy) return; // a double click must not run a control twice
    setBusy(true);
    setResult("Working…");
    try {
      const res = await fetch(`/api/demo/${action}`, { method: "POST", headers: { "x-demo-key": key ?? "" } });
      const body = await res.json();
      if (res.ok && Array.isArray(body.actions)) { setResult(body.actions.length ? body.actions.map((a: { kind: string; sent: boolean; text?: string; reason?: string }) => `${a.kind}${a.sent ? " (sent)" : ""}: ${a.text ?? a.reason ?? ""}`).join("\n") : "Nothing to do."); setBusy(false); return; }
      setResult(res.ok ? (action === "questions" ? "Writing questions now. This takes about a minute; the dashboard header shows progress and your phone gets a text when they're ready." : `${action}: ${JSON.stringify(body)}`) : `${action}: ${body.error ?? res.status}`);
    } catch { setResult("Could not reach the dashboard server."); }
    setBusy(false);
  }
  return (
    <main className="demo">
      <h1>Demo controls</h1>
      <p>For the presenter. {key ? "Unlocked." : "Locked: open this page once with ?key=… to unlock."}</p>
      <div className="btns">
        {CONTROLS.map((c) => <button key={c.action} disabled={!key || busy} onClick={() => run(c.action)}>{c.label}<small>{c.hint}</small></button>)}
      </div>
      <div className="result">{result}</div>
      <p style={{ marginTop: 28 }}><a href="/">← Dashboard</a> · <a href="/upload">Upload a real syllabus</a></p>
    </main>
  );
}
