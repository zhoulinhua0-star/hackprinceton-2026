"use client";
import { useEffect, useRef, useState } from "react";
import type { Exam, Msg, Proposal, Topic, Course, Deadline } from "@syllabus-crew/core";

export interface View {
  phase: "day1" | "week6" | "live" | null;
  deadlines?: Deadline[];
  reminders?: { text: string; dueISO: string }[]; scheduler?: "off" | "dry" | "on";
  questionCount?: number; questionsStatus?: "generating" | "ready" | "failed";
  parsed?: boolean;
  courses?: Course[]; exams?: Exam[]; topics?: Topic[];
  mastery?: Record<string, number>;
  proposals?: Proposal[]; messages?: Msg[];
  stagedPhoto?: boolean; agentName?: string; vibe?: "chill" | "strict" | "hype";
  foundMaterialIds?: string[]; pendingQuiz?: boolean; studentTail?: string; calendarMode?: "google" | "local"; tz?: string;
}

/** Polls the agent through the dashboard's API. Polling keeps the stage setup simple and survives restarts. */
export function useLive(intervalMs = 1500) {
  const [view, setView] = useState<View | null>(null);
  const [offline, setOffline] = useState(false);
  const alive = useRef(true);
  const seq = useRef({ started: 0, applied: 0 });
  useEffect(() => {
    alive.current = true;
    const tick = async () => {
      const mine = ++seq.current.started;
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        const body = res.ok ? await res.json() : null;
        // A slow earlier response must never overwrite a newer one.
        if (!alive.current || mine < seq.current.applied) return;
        seq.current.applied = mine;
        if (body) { setView(body); setOffline(false); } else setOffline(true);
      } catch { if (alive.current && mine >= seq.current.applied) setOffline(true); }
    };
    tick();
    const t = setInterval(tick, intervalMs);
    return () => { alive.current = false; clearInterval(t); };
  }, [intervalMs]);
  return { view, offline };
}

/** Controls are always unlocked: the dashboard is reachable from this laptop only (see hasKey in lib/agent.ts). */
export function usePresenterKey(): string | null {
  return "local";
}
