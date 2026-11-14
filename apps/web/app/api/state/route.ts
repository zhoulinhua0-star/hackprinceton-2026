import { agentFetch } from "@/lib/agent";

export const dynamic = "force-dynamic";

// Read-only view of the student's state, with the phone number, Photon route and quiz answers removed.
export async function GET() {
  try {
    const res = await agentFetch("/api/state");
    if (!res.ok) return Response.json({ offline: true }, { status: 502 });
    const s = await res.json();
    if (!s.phase) return Response.json({ phase: null });
    const digits = String(s.id ?? "").replace(/\D/g, "");
    return Response.json({
      phase: s.phase, parsed: s.parsed, courses: s.courses, exams: s.exams, topics: s.topics, mastery: s.mastery,
      proposals: s.proposals, messages: (s.messages ?? []).slice(-60), foundMaterialIds: s.foundMaterialIds,
      pendingQuiz: !!s.pendingQuiz, studentTail: digits.slice(-4), calendarMode: s.calendarMode, tz: s.tz, deadlines: s.deadlines, reminders: (s.reminders ?? []).filter((r: { status: string }) => r.status === "pending").map((r: { text: string; dueISO: string }) => ({ text: r.text, dueISO: r.dueISO })), scheduler: s.scheduler, questionCount: (s.questions ?? []).length, questionsStatus: s.questionsStatus,
      agentName: s.agentName, vibe: s.vibe, stagedPhoto: s.stagedPhoto, storeMode: s.storeMode, voiceReady: s.voiceReady, voiceNumber: s.voiceNumber,
      // Drills without the call id (an internal handle) and without the key points beyond what the card shows.
      drills: (s.drills ?? []).slice(-3).map(({ callId: _callId, ...d }: { callId?: string } & Record<string, unknown>) => d),
    });
  } catch {
    return Response.json({ offline: true }, { status: 502 });
  }
}
