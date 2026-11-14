"use client";
import { useEffect, useRef, useState } from "react";
import { daysUntil } from "@syllabus-crew/core";
import type { Exam, Proposal, Topic } from "@syllabus-crew/core";
import { useLive, usePresenterKey, type View } from "@/lib/use-state";

// The student's timezone comes from the agent (STUDENT_TIMEZONE); New York until the first response arrives.
let TZ = "America/New_York";
const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, ...o }).format(new Date(iso));
const slotText = (p: Proposal) =>
  `${fmt(p.event.startISO, { weekday: "long" })} ${fmt(p.event.startISO, { hour: "numeric", minute: "2-digit" })}–${fmt(p.event.endISO, { hour: "numeric", minute: "2-digit" })}`;
const tone = (v: number) => (v < 0.5 ? "var(--bad)" : v < 0.7 ? "var(--warn)" : "var(--good)");

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
      <p className="eyebrow">{course?.name}</p>
      <div className="exam-head">
        <div>
          <h2 className="exam-title">{exam.name}<span>in {days} {days === 1 ? "day" : "days"}</span></h2>
          <div className="when">{fmt(exam.date, { weekday: "long", month: "long", day: "numeric" })}</div>
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
          <button className="primary" disabled={!canAct} onClick={() => act(p.id, "approve")} title={canAct ? "" : "View-only: open with the presenter key"}>Approve</button>
          <button disabled={!canAct} onClick={() => act(p.id, "decline")}>Not now</button>
          <span className="badge wait">Waiting for your reply</span>
        </div>
      ) : p.status === "approved" ? <span className="badge ok">Added to calendar</span> : <span className="badge no">Skipped</span>}
    </div>
  );
}

function Thread({ v }: { v: View | null }) {
  const end = useRef<HTMLDivElement>(null);
  const n = v?.messages?.length ?? 0;
  const last = v?.messages?.at(-1);
  // Follow the newest message itself, not the count: the list is capped, so the count stops changing.
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [last?.at, last?.text]);
  return (
    <aside className="card thread">
      <div className="thread-head"><b>Syllabus Crew</b><span>iMessage{v?.studentTail ? ` · ••• ${v.studentTail}` : ""}</span></div>
      <div className="msgs">
        {n === 0 ? <p className="none">Waiting for the first text. Message the Syllabus Crew line to start.</p>
          : v!.messages!.map((m, i) => <div key={`${m.at}-${m.dir}-${i}`} className={`bubble ${m.dir}`}>{m.text}</div>)}
        <div ref={end} />
      </div>
    </aside>
  );
}

export default function Home() {
  const { view, offline } = useLive();
  if (view?.tz) TZ = view.tz;
  const key = usePresenterKey();
  const parsed = !!view?.parsed && !!view.exams?.length;

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
    <>
      <header className="top">
        <div className="brand"><span className="mark">S</span>Syllabus Crew</div>
        <div className="status">
          {view?.scheduler === "on" && <span className="chip">Nudges on</span>}
          {view?.scheduler === "dry" && <span className="chip">Nudges: dry run</span>}
          {view?.calendarMode && <span className="chip">{view.calendarMode === "google" ? "Google Calendar connected" : "Calendar: local"}</span>}
          {view?.phase === "live" && view.questionsStatus === "generating" && <span className="chip">Writing quiz questions…</span>}
          {view?.phase === "live" && view.questionsStatus !== "generating" && !!view.questionCount && <span className="chip">{view.questionCount} quiz questions ready</span>}
          {view?.phase && <span className="chip">{view.phase === "week6" ? "Week 6" : view.phase === "live" ? "Your semester" : "Day 1"}</span>}
          <span><i className={`dot ${offline ? "off" : ""}`} />{offline ? "Agent offline" : "Live"}</span>
        </div>
      </header>
      {offline && <div className="offline">The dashboard can't reach the agent. Check that it is running.</div>}
      <main className="grid">
        <div className="col">
          {!parsed ? (
            <section className="card hero enter">
              <h1>Text it a photo of your syllabus.</h1>
              <p>That's the setup. Your semester appears here.</p>
            </section>
          ) : (
            <>
              {examCards.map((e) => <ExamCard key={e.id} exam={e} v={view!} />)}
              {proposals.some((p) => p.status === "pending") && (
                <section className="card enter">
                  <p className="eyebrow">Needs your yes</p>
                  {proposals.filter((p) => p.status === "pending").map((p) => <ProposalCard key={p.id} p={p} canAct={!!key} act={act} />)}
                </section>
              )}
              <section className="card enter" style={{ animationDelay: ".12s" }}>
                <p className="eyebrow">Semester</p>
                <div className="list">
                  {timeline.slice(0, 14).map((d, i) => (
                    <div className="row" key={`${d.name}-${i}`} style={{ opacity: d.days < 0 ? 0.45 : 1 }}>
                      <span>{d.name}<br /><small>{fmt(d.date, { weekday: "short", month: "short", day: "numeric" })}{d.weight >= 0.01 ? ` · ${Math.round(d.weight * 100)}% of grade` : ""}</small></span>
                      <small>{d.days < 0 ? "done" : d.days === 0 ? "today" : `${d.days} ${d.days === 1 ? "day" : "days"}`}</small>
                    </div>
                  ))}
                  {timeline.length > 14 && <p className="empty" style={{ paddingTop: 10 }}>and {timeline.length - 14} more</p>}
                </div>
              </section>
              {!!view!.reminders?.length && (
                <section className="card enter" style={{ animationDelay: ".18s" }}>
                  <p className="eyebrow">Reminders</p>
                  <div className="list">{view!.reminders.map((r, i) => <div className="row" key={i}><span>{r.text}</span><small>{fmt(r.dueISO, { weekday: "short", hour: "numeric", minute: "2-digit" })}</small></div>)}</div>
                </section>
              )}
              <section className="card enter" style={{ animationDelay: ".24s" }}>
                <p className="eyebrow">On your calendar</p>
                {events.length === 0 ? <p className="empty">Nothing added yet. I'll ask before I add anything.</p>
                  : <div className="list">{events.map((p) => <div className="row" key={p.id}><span>{p.event.title}<br /><small>{slotText(p)}{p.calendarLink && <> · <a href={p.calendarLink} target="_blank" rel="noreferrer">Open in Google Calendar ↗</a></>}</small></span><span className="badge ok">Added</span></div>)}</div>}
              </section>
              {proposals.some((p) => p.status === "declined") && <p className="empty" style={{ paddingLeft: 8 }}>{proposals.filter((p) => p.status === "declined").length} proposal skipped.</p>}
            </>
          )}
        </div>
        <Thread v={view} />
      </main>
    </>
  );
}
