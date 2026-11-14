"use client";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_AGENT_NAME, daysUntil } from "@syllabus-crew/core";
import type { Exam, Proposal, Topic } from "@syllabus-crew/core";
import { useLive, usePresenterKey, type View } from "@/lib/use-state";
import { COLORS, Character, CrewTree, Explorer, agentOf, type AgentId } from "./crew";

// The student's timezone comes from the agent (STUDENT_TIMEZONE); New York until the first response arrives.
let TZ = "America/New_York";
const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, ...o }).format(new Date(iso));
const slotText = (p: Proposal) =>
  `${fmt(p.event.startISO, { weekday: "long" })} ${fmt(p.event.startISO, { hour: "numeric", minute: "2-digit" })}–${fmt(p.event.endISO, { hour: "numeric", minute: "2-digit" })}`;
const tone = (v: number) => (v < 0.5 ? "var(--bad)" : v < 0.7 ? "var(--warn)" : "var(--good)");
const ROLE: Record<Exclude<AgentId, "lead">, string> = { scout: "Scout", tutor: "Tutor", planner: "Planner", nudger: "Nudger" };

function MasteryRow({ topic, value, weakest }: { topic: Topic; value: number; weakest: boolean }) {
  const prev = useRef(value);
  const [delta, setDelta] = useState(0);
  useEffect(() => {
    if (Math.abs(value - prev.current) >= 0.005) {
      setDelta(Math.round((value - prev.current) * 100));
      prev.current = value;
      const t = setTimeout(() => setDelta(0), 6000);
      return () => clearTimeout(t);
    }
  }, [value]);
  return (
    <div className="bar-row">
      <span className={weakest ? "weakest" : ""}>{topic.name}</span>
      <div className="track"><div className={`fill ${delta < 0 ? "dropped" : ""}`} style={{ width: `${Math.round(value * 100)}%`, background: tone(value) }} /></div>
      <span className="pct">{Math.round(value * 100)}%{delta !== 0 && <small className={delta < 0 ? "down" : "up"}>{delta > 0 ? "+" : ""}{delta}</small>}</span>
    </div>
  );
}

function ExamCard({ exam, v }: { exam: Exam; v: View }) {
  const course = v.courses?.find((c) => c.id === exam.courseId);
  const topics = exam.topicIds.map((id) => v.topics!.find((t) => t.id === id)!).filter(Boolean);
  const weakest = [...topics].sort((a, b) => (v.mastery?.[a.id] ?? 0.5) - (v.mastery?.[b.id] ?? 0.5))[0];
  const days = daysUntil(exam.date, new Date(), TZ);
  const proposal = [...(v.proposals ?? [])].reverse().find((p) => p.topicId === weakest?.id && p.status !== "declined");
  const hasHistory = Object.keys(v.mastery ?? {}).length > 0;
  return (
    <section className="card enter">
      <div className="exam-head">
        <div>
          <h2 className="exam-title">{exam.name}<span>in {days} {days === 1 ? "day" : "days"}</span></h2>
          <div className="when">{course?.name ? `${course.name} · ` : ""}{fmt(exam.date, { weekday: "long", month: "long", day: "numeric" })}</div>
        </div>
        <div className="weight"><b>{Math.round(exam.weight * 100)}%</b>of your grade</div>
      </div>
      {hasHistory ? (
        <>
          <div className="bars">{topics.map((t) => <MasteryRow key={t.id} topic={t} value={v.mastery?.[t.id] ?? 0.5} weakest={t.id === weakest?.id} />)}</div>
          <div className="plan">
            {proposal?.status === "approved" ? <><b>Scheduled:</b> {slotText(proposal)}, {proposal.label}.</>
              : proposal ? <><b>Proposed:</b> {slotText(proposal)}, {proposal.label}. Waiting for your yes.</>
              : weakest ? <><b>Weakest:</b> {weakest.name}. I'll propose a review block if it slips below 50%.</> : null}
          </div>
        </>
      ) : (
        <p className="empty" style={{ marginTop: 18 }}>{topics.length ? <>Covers {topics.slice(0, 3).map((t) => t.short).join(", ")}{topics.length > 3 ? ` and ${topics.length - 3} more` : ""}.</> : "No topic list in the syllabus."}</p>
      )}
    </section>
  );
}

function ProposalCard({ p, canAct, act }: { p: Proposal; canAct: boolean; act: (id: string, verb: "approve" | "decline") => void }) {
  return (
    <div className="proposal">
      <p>{p.text.replace(/\s*Reply YES or NO\.?$/, "")}</p>
      <div className="slot">{slotText(p)} · {p.event.title}</div>
      {p.status === "pending" ? (
        <div className="btns">
          <button className="btn primary" disabled={!canAct} onClick={() => act(p.id, "approve")} title={canAct ? "" : "View-only: open with the presenter key"}>Approve</button>
          <button className="btn" disabled={!canAct} onClick={() => act(p.id, "decline")}>Not now</button>
          <span className="badge wait">Waiting for your reply</span>
        </div>
      ) : p.status === "approved" ? <span className="badge ok">Added to calendar</span> : <span className="badge no">Skipped</span>}
    </div>
  );
}

/** The live iMessage thread, in a phone. Each run of texts is labelled with the crew member that sent it. */
function Thread({ v, name }: { v: View | null; name: string }) {
  const box = useRef<HTMLDivElement>(null);
  const msgs = v?.messages ?? [];
  const last = msgs.at(-1);
  // Follow the newest message itself, not the count: the list is capped, so the count stops changing.
  // Scroll the thread, never the page: the reader may be further down.
  useEffect(() => { const b = box.current; if (b) b.scrollTo({ top: b.scrollHeight, behavior: "smooth" }); }, [last?.at, last?.text]);
  return (
    <aside className="phone" aria-label={`iMessage thread with ${name}`}>
      <div className="phone-head"><Character kind="lead" size={44} /><span><b>{name}</b> · iMessage{v?.studentTail ? ` · ••• ${v.studentTail}` : ""}</span></div>
      <div className="msgs" ref={box}>
        {msgs.length === 0 ? <p className="none">No texts yet. Message the Syllabus Crew line and the thread shows up here.</p>
          : msgs.map((m, i) => {
            const who = agentOf(m.kind), prev = msgs[i - 1];
            const labelled = m.dir === "out" && (!prev || prev.dir === "in" || agentOf(prev.kind) !== who);
            return (
              <div key={`${m.at}-${m.dir}-${i}`} style={{ display: "contents" }}>
                {labelled && <div className="who"><i style={{ background: COLORS[who] }} />{who === "lead" ? name : ROLE[who]}</div>}
                <div className={`bubble ${m.dir}`}>{m.text}</div>
              </div>
            );
          })}
      </div>
    </aside>
  );
}

export default function Home() {
  const { view, offline } = useLive();
  if (view?.tz) TZ = view.tz;
  const key = usePresenterKey();
  const parsed = !!view?.parsed && !!view.exams?.length;
  const name = view?.agentName || DEFAULT_AGENT_NAME;

  async function act(id: string, verb: "approve" | "decline") {
    await fetch(`/api/proposals/${id}/${verb}`, { method: "POST", headers: { "x-demo-key": key ?? "" } });
  }

  const exams = [...(view?.exams ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = exams.filter((e) => daysUntil(e.date, new Date(), TZ) >= 0);
  const examCards = (upcoming.length ? upcoming : exams).filter((e) => e.weight >= 0.1 || e.topicIds.length).slice(0, 3);
  // Every dated item (small ones too), soonest first; passed ones are dimmed.
  const timeline = (view?.deadlines?.length ? view.deadlines : exams.map((e) => ({ name: e.name, date: e.date, weight: e.weight })))
    .map((d) => ({ ...d, days: daysUntil(d.date, new Date(), TZ) })).sort((a, b) => a.date.localeCompare(b.date));
  const proposals = [...(view?.proposals ?? [])].reverse();
  const events = proposals.filter((p) => p.status === "approved");

  return (
    <div className="wrap">
      <header className="top">
        <a className="brand" href="/"><Character kind="lead" size={34} />Syllabus Crew</a>
        <div className="status">
          {view?.vibe && <span className="chip">Vibe: {view.vibe}</span>}
          {view?.stagedPhoto === false && <span className="chip">Texted photos: read for real</span>}
          {view?.scheduler === "on" && <span className="chip">Nudges on</span>}
          {view?.scheduler === "dry" && <span className="chip">Nudges: dry run</span>}
          {view?.calendarMode && <span className="chip">{view.calendarMode === "google" ? "Google Calendar connected" : "Calendar: local"}</span>}
          {view?.phase === "live" && view.questionsStatus === "generating" && <span className="chip">Writing quiz questions…</span>}
          {view?.phase === "live" && view.questionsStatus !== "generating" && !!view.questionCount && <span className="chip">{view.questionCount} quiz questions ready</span>}
          {view?.phase && <span className="chip">{view.phase === "week6" ? "Week 6" : view.phase === "live" ? "Your semester" : "Day 1"}</span>}
          <span className="live"><i className={`dot ${offline ? "off" : ""}`} />{offline ? "Agent offline" : "Live"}</span>
          <a className="chip link" href="/demo">Demo controls →</a>
        </div>
      </header>
      {offline && <div className="offline">The dashboard can't reach the agent. Check that it is running.</div>}
      {!parsed && (
        <section className="hero enter">
          <h1>Text <em>{name}</em> your syllabus.</h1>
          <p>A PDF is all it needs. It reads the syllabus, quizzes you by text, and asks before it adds anything to your calendar.</p>
        </section>
      )}
      <main className="grid">
        <div className="col">
          {!parsed ? (
            <section className="card enter">
              <h3>Your semester appears here</h3>
              <div className="list">
                <div className="row"><span>Every exam and deadline<br /><small>With how much of your grade each one is worth.</small></span></div>
                <div className="row"><span>How well you know each topic<br /><small>The bars move with every quiz answer you text.</small></span></div>
                <div className="row"><span>Study blocks it proposes<br /><small>Nothing reaches your calendar without your YES.</small></span></div>
              </div>
            </section>
          ) : (
            <>
              {examCards.map((e) => <ExamCard key={e.id} exam={e} v={view!} />)}
              {proposals.some((p) => p.status === "pending") && (
                <section className="card ask-card enter">
                  <h3>Needs your yes</h3>
                  {proposals.filter((p) => p.status === "pending").map((p) => <ProposalCard key={p.id} p={p} canAct={!!key} act={act} />)}
                </section>
              )}
              <section className="card enter" style={{ animationDelay: ".12s" }}>
                <h3>Semester</h3>
                <div className="list">
                  {timeline.slice(0, 14).map((d, i) => (
                    <div className="row" key={`${d.name}-${i}`} style={{ opacity: d.days < 0 ? 0.5 : 1 }}>
                      <span>{d.name}<br /><small>{fmt(d.date, { weekday: "short", month: "short", day: "numeric" })}{d.weight >= 0.01 ? ` · ${Math.round(d.weight * 100)}% of grade` : ""}</small></span>
                      <small>{d.days < 0 ? "done" : d.days === 0 ? "today" : `${d.days} ${d.days === 1 ? "day" : "days"}`}</small>
                    </div>
                  ))}
                  {timeline.length > 14 && <p className="empty" style={{ paddingTop: 10 }}>and {timeline.length - 14} more</p>}
                </div>
              </section>
              {!!view!.reminders?.length && (
                <section className="card enter" style={{ animationDelay: ".18s" }}>
                  <h3>Reminders</h3>
                  <div className="list">{view!.reminders.map((r, i) => <div className="row" key={i}><span>{r.text}</span><small>{fmt(r.dueISO, { weekday: "short", hour: "numeric", minute: "2-digit" })}</small></div>)}</div>
                </section>
              )}
              <section className="card enter" style={{ animationDelay: ".24s" }}>
                <h3>On your calendar</h3>
                {events.length === 0 ? <p className="empty">Nothing added yet. {name} asks before adding anything.</p>
                  : <div className="list">{events.map((p) => <div className="row" key={p.id}><span>{p.event.title}<br /><small>{slotText(p)}{p.calendarLink && <> · <a href={p.calendarLink} target="_blank" rel="noreferrer">Open in Google Calendar ↗</a></>}</small></span><span className="badge ok">Added</span></div>)}</div>}
              </section>
              {proposals.some((p) => p.status === "declined") && <p className="empty" style={{ paddingLeft: 8 }}>{proposals.filter((p) => p.status === "declined").length} proposal skipped.</p>}
            </>
          )}
        </div>
        <Thread v={view} name={name} />
      </main>
      <CrewTree name={name} named={!!view?.agentName} />
      <Explorer name={name} />
      <footer className="foot">
        <span>Syllabus Crew · HackPrinceton Fall 2026</span>
        <a href="/demo">Demo controls</a><a href="/upload">Upload a syllabus</a><a href="/join">Join QR</a>
      </footer>
    </div>
  );
}
