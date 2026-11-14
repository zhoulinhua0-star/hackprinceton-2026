"use client";
import { useRef, useState } from "react";
import { usePresenterKey } from "@/lib/use-state";
import { Character } from "../crew";

const CONTROLS: { action: string; label: string; hint: string; danger?: boolean }[] = [
  { action: "hello", label: "Say hello (agent texts first)", hint: "The agent opens the thread: who it is, then asks for a name, a vibe and one question." },
  { action: "week6", label: "Switch to Week 6", hint: "Fast forward: loads the parsed syllabus, quiz history and mastery." },
  { action: "scout", label: "Run Scout now", hint: "Finds the Week 6 slides, then sends the first quiz." },
  { action: "quiz", label: "Send quiz now", hint: "Sends the next question immediately." },
  { action: "questions", label: "Write quiz questions", hint: "For a real syllabus: writes and double-checks practice questions on the upcoming readings (about a minute)." },
  { action: "nudgedry", label: "Nudger: what would you do now? (dry run)", hint: "Applies the real rules (time window, daily limit, not mid-conversation) and shows the decision. Sends nothing." },
  { action: "nudge", label: "Run Nudger now", hint: "Skips the timing rules and sends the nudge that matters most right now, to show it live." },
  { action: "drilloffer", label: "Offer a voice drill", hint: "Texts \"…want a 3-minute voice drill? Reply CALL.\" The phone rings only after the student replies CALL." },
  { action: "drill", label: "Call now (voice drill)", hint: "Skips the offer and rings the demo phone straight away, for testing the call." },
  { action: "reset", label: "Reset demo", hint: "Back to Day 1: clears quiz state, proposals and mastery. The thread stays open.", danger: true },
];

export default function Demo() {
  const key = usePresenterKey();
  const [result, setResult] = useState("");
  const [running, setRunning] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const busy = running !== null;

  async function run(action: string) {
    if (busy) return; // a double click must not run a control twice
    setRunning(action);
    setDone(null);
    setResult("Working…");
    let ok = false;
    try {
      const res = await fetch(`/api/demo/${action}`, { method: "POST", headers: { "x-demo-key": key ?? "" } });
      const body = await res.json();
      ok = res.ok;
      if (res.ok && Array.isArray(body.actions)) setResult(body.actions.length ? body.actions.map((a: { kind: string; sent: boolean; text?: string; reason?: string }) => `${a.kind}${a.sent ? " (sent)" : ""}: ${a.text ?? a.reason ?? ""}`).join("\n") : "Nothing to do.");
      else if (res.ok && action === "scout") setResult(body.found ? "Scout found the Week 6 slides and sent the first quiz." : `Scout found nothing. ${body.why ?? ""}`);
      else setResult(res.ok ? (action === "questions" ? "Writing questions now. This takes about a minute; the dashboard header shows progress and your phone gets a text when they're ready." : `${action}: ${JSON.stringify(body)}`) : `${action}: ${body.error ?? res.status}`);
    } catch { setResult("Could not reach the dashboard server."); }
    setRunning(null);
    if (ok) { // a short tick on the button that just ran
      setDone(action);
      clearTimeout(doneTimer.current);
      doneTimer.current = setTimeout(() => setDone(null), 1600);
    }
  }
  return (
    <main className="demo">
      <div className="demo-head">
        <Character kind="lead" size={64} />
        <div>
          <h1>Demo controls</h1>
          <p>For the presenter. {key ? "Unlocked." : "Locked: open this page once with ?key=… to unlock."}</p>
        </div>
      </div>
      <div className="controls">
        {CONTROLS.map((c) => (
          <button key={c.action} className={`btn ctl${c.danger ? " danger" : ""}${running === c.action ? " running" : ""}${done === c.action ? " done" : ""}`}
            disabled={!key || busy} onClick={() => run(c.action)}>{c.label}<small>{c.hint}</small></button>
        ))}
      </div>
      <div className={`result${result ? " box" : ""}`} key={result} role="status">{result}</div>
      <p className="nav"><a href="/">← Dashboard</a> · <a href="/upload">Upload a real syllabus</a></p>
    </main>
  );
}
