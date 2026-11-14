import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { day, loadCard, minutesBetween, pct, time, titleOf, type Card, type DrillCard, type RoundCard, type SemesterCard, type WeekCard } from "@/lib/card";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = (await params).id;
  const c = await loadCard(id);
  if (!c) return { title: "Syllabus Crew" };
  const title = titleOf(c);
  // A versioned picture URL: a changed card (booked, moved) gets a new picture, never a cached one.
  const image = { url: `/c/${id}/og?v=${Date.parse(c.updatedAt).toString(36)}`, width: 1200, height: 630, alt: title };
  return { title, openGraph: { title, siteName: "Syllabus Crew", type: "website", images: [image] }, twitter: { card: "summary_large_image", title, images: [image.url] }, robots: { index: false, follow: false } };
}

const C = { ink: "#1e2740", lead: "#2c6e6a", tutor: "#c8553d", planner: "#6d7fb3", nudger: "#7a9e5a", good: "#2f7a5b", bad: "#c2412d", muted: "#5d6377" };
const BUB = "M36 20h48a24 24 0 0 1 24 24v22a24 24 0 0 1-24 24H62l-20 18 3-18.4A24 24 0 0 1 12 66V44a24 24 0 0 1 24-24z";
const line = process.env.LINE_NUMBER ?? "";
const sms = (body: string) => `sms:${line}&body=${encodeURIComponent(body)}`;

/** A small calendar glyph for the Google Calendar button (generic, not Google's logo). */
function GCal() {
  return <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M8.5 15l2.5 2.5 4.5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Who({ name, role }: { name: string; role: string }) {
  return (
    <div className="who">
      <svg viewBox="0 0 120 120" aria-hidden="true"><path fill={C.lead} d={BUB} /><circle cx="46" cy="50" r="6" fill={C.ink} /><circle cx="74" cy="50" r="6" fill={C.ink} /></svg>
      {name} · {role}
    </div>
  );
}

/** Hours (with minutes as a fraction) in the student's time zone. */
function hm(iso: string, tz: string): number {
  const p = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "numeric", hourCycle: "h23", timeZone: tz }).formatToParts(new Date(iso));
  return Number(p.find((x) => x.type === "hour")!.value) + Number(p.find((x) => x.type === "minute")!.value) / 60;
}
const ymd = (iso: string, tz: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz });
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const weekdayIndex = (iso: string, tz: string) => WEEKDAYS.indexOf(new Date(iso).toLocaleDateString("en-US", { weekday: "short", timeZone: tz }));

/** One ring, drawn as stroke segments. Each segment animates in, in order. */
function Ring({ segs, size = 188, stroke = 22, children, label }: { segs: { value: number; color: string; title: string }[]; size?: number; stroke?: number; children: React.ReactNode; label: string }) {
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r, gap = segs.filter((s) => s.value > 0).length > 1 ? 3 : 0;
  let at = 0;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ebe4d3" strokeWidth={stroke} />
        {segs.filter((s) => s.value > 0).map((s, i) => {
          const len = Math.max(0, s.value * circ - gap), off = at; at += s.value * circ;
          return (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={stroke} strokeLinecap="butt"
              strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-off} transform={`rotate(-90 ${size / 2} ${size / 2})`}
              className="seg" style={{ animationDelay: `${120 + i * 90}ms`, ["--len" as string]: `${len}` }}><title>{s.title}</title></circle>
          );
        })}
      </svg>
      <div className="mid">{children}</div>
    </div>
  );
}

/** The grade as a donut: coloured = still ahead (the biggest in red), sand = done. The middle says what's left to play for. */
function GradeDonut({ c, big }: { c: SemesterCard; big?: SemesterCard["items"][number] }) {
  const ahead = c.items.filter((i) => !i.done), done = c.items.filter((i) => i.done);
  const total = c.items.reduce((s, i) => s + i.weight, 0);
  const sum = (xs: typeof c.items) => xs.reduce((s, i) => s + i.weight, 0);
  const shades = ["#46598f", "#6d7fb3", "#97a5cc", "#bcc5e0"];
  const segs = [
    ...ahead.sort((a, b) => b.weight - a.weight).map((i, n) => ({ value: i.weight, color: i === big ? C.tutor : shades[Math.min(n, shades.length - 1)]!, title: `${i.name} · ${pct(i.weight)}` })),
    ...done.map((i) => ({ value: i.weight, color: "#d8cdb4", title: `${i.name} · ${pct(i.weight)} · done` })),
  ];
  const left = sum(ahead);
  return (
    <div className="sec"><div className="h"><span>Your grade</span><span>{pct(left)} still ahead</span></div>
      <div className="donut">
        <Ring segs={segs} label={`${pct(left)} of your grade is still ahead`}>
          <b>{pct(left)}</b><span>still ahead</span>
        </Ring>
        <ul className="legend">
          {big && <li><i style={{ background: C.tutor }} /><span><b>{big.name}</b> is {pct(big.weight)} of your grade{big.dateISO ? `, ${day(big.dateISO, c.tz, { month: "short", day: "numeric" })}` : ""}.</span></li>}
          {ahead.length > (big ? 1 : 0) && <li><i style={{ background: "#6d7fb3" }} /><span>{pct(left - (big?.weight ?? 0))} more in {ahead.length - (big ? 1 : 0)} other item{ahead.length - (big ? 1 : 0) === 1 ? "" : "s"}</span></li>}
          {done.length > 0 && <li><i style={{ background: "#d8cdb4" }} /><span>{pct(sum(done))} already done</span></li>}
          {total < 0.995 && <li><i style={{ background: "#ebe4d3" }} /><span>{pct(1 - total)} not listed in the syllabus</span></li>}
        </ul>
      </div>
    </div>
  );
}

function Semester({ c }: { c: SemesterCard }) {
  const exams = c.items.filter((i) => i.dateISO && i.isExam);
  const now = new Date(c.updatedAt).getTime();
  const times = exams.map((i) => new Date(i.dateISO!).getTime());
  const lo = Math.min(...times, now) - 10 * 86_400_000, hi = Math.max(...times, now) + 10 * 86_400_000;
  const x = (t: number) => ((t - lo) / (hi - lo)) * 100;
  const maxW = Math.max(...exams.map((e) => e.weight), 0.01);
  const months: { label: string; at: number }[] = [];
  const first = new Date(lo);
  for (let d = new Date(first.getFullYear(), first.getMonth() + 1, 1); d.getTime() < hi; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    months.push({ label: d.toLocaleDateString("en-US", { month: "short" }), at: x(d.getTime()) });
  }
  const big = [...exams].filter((e) => !e.done).sort((a, b) => b.weight - a.weight)[0];
  // Labels that would touch (closer than ~24% apart) step up a line, alternately, so none overlap.
  const lifts: number[] = [];
  exams.forEach((e, k) => {
    const prev = k > 0 ? Math.abs(x(new Date(e.dateISO!).getTime()) - x(new Date(exams[k - 1]!.dateISO!).getTime())) : 100;
    lifts.push(prev < 24 && (lifts[k - 1] ?? 0) === 0 ? 16 : 0);
  });
  return (
    <>
      <Who name={c.agentName} role="your semester" />
      <h2>Your semester, <em>on one page</em></h2>
      <p className="sub">{c.course}{c.readAt ? ` · read ${day(c.readAt, c.tz)} at ${time(c.readAt, c.tz)}` : ""}</p>
      {c.items.length > 1 && <GradeDonut c={c} big={big} />}
      {exams.length > 0 && (
        <div className="sec"><div className="h"><span>Exams by weight</span></div>
          <div className="tl">
            <div className="ax" />
            <div className="nowl" style={{ left: `${x(now)}%` }}><span>TODAY</span></div>
            {exams.map((e, k) => {
              const left = x(new Date(e.dateISO!).getTime()), h = 18 + 30 * (e.weight / maxW), hot = e === big;
              const lift = lifts[k] ?? 0;
              const align = left > 80 ? { left: "auto", right: -4, transform: "none" } : left < 16 ? { left: 0, transform: "none" } : { left: `${left}%` };
              return (
                <div key={e.name}>
                  <div className="ex" style={{ left: `${left}%`, width: 24, height: h, background: hot ? C.tutor : C.ink, opacity: hot ? 1 : 0.32 }} />
                  <div className="exl" style={{ ...align, bottom: 52 + h + lift, color: hot ? C.ink : C.muted }}>{e.name} · {pct(e.weight)}</div>
                </div>
              );
            })}
            {months.map((m) => <div key={m.label + m.at} className="mo" style={{ left: `${m.at}%` }}>{m.label}</div>)}
          </div>
        </div>
      )}
      <div className="sec"><div className="h"><span>What counts</span><span>{pct(c.items.reduce((s, i) => s + i.weight, 0))}</span></div>
        {c.items.map((i) => (
          <div key={i.name} className={`row${i.done ? " done" : ""}`}>
            <span className="dot" style={{ background: i.focus || i === big ? C.tutor : i.isExam ? C.ink : C.nudger, opacity: i.isExam && i !== big && !i.focus ? 0.45 : 1 }} />
            <span className="n">{i.focus ? <span className="hl">{i.name}</span> : i.name}
              <small>{[i.dateISO ? day(i.dateISO, c.tz) : null, i.topics, i.done ? "done" : null, i.focus ? "the one you said worries you" : null].filter(Boolean).join(" · ") || " "}</small></span>
            <span className="w">{pct(i.weight)}</span>
          </div>
        ))}
      </div>
      {c.changes.length > 0 && (
        <div className="sec"><div className="h"><span>What changed</span></div>{c.changes.map((t) => <div key={t} className="change"><i />{t}</div>)}</div>
      )}
      {c.ask && <div className="note">One thing I couldn&apos;t find: <b>{c.ask}</b> Just text me.</div>}
      <div className="foot">Updates here when something changes. Nothing to sign in to.</div>
    </>
  );
}

function Week({ c }: { c: WeekCard }) {
  const start = new Date(c.startISO);
  const monday = new Date(start.getTime() - Math.max(0, weekdayIndex(c.startISO, c.tz)) * 86_400_000);
  const days = Array.from({ length: 5 }, (_, i) => new Date(monday.getTime() + i * 86_400_000).toISOString());
  const H0 = 9, H1 = 19, PX = 30; // 9am to 7pm, 30px an hour
  const y = (iso: string) => Math.max(0, Math.min((H1 - H0) * PX, (hm(iso, c.tz) - H0) * PX));
  const booked = c.status === "approved";
  return (
    <>
      <Who name={c.agentName} role="planner" />
      <h2>{day(c.startISO, c.tz, { weekday: "long" })}, {time(c.startISO, c.tz)}<br /><em>{c.label}</em></h2>
      <span className={`badge ${c.status}`}>{booked ? "Booked" : c.status === "declined" ? "Skipped" : "Proposed, not booked"}</span>
      <p className="sub">{minutesBetween(c.startISO, c.endISO)} minutes · {day(c.startISO, c.tz, { month: "long", day: "numeric" })}</p>
      <div className="sec"><div className="h"><span>Your week</span><span>{day(days[0]!, c.tz, { month: "short", day: "numeric" })}–{day(days[4]!, c.tz, { day: "numeric" })}</span></div>
        <div className="wk">
          <div />
          {days.map((d) => <div key={d} className="d">{day(d, c.tz, { weekday: "short" })}<b>{day(d, c.tz, { day: "numeric" })}</b></div>)}
          <div className="hrs">{[10, 12, 14, 16, 18].map((h) => <span key={h} style={{ top: (h - H0) * PX }}>{h > 12 ? h - 12 : h}</span>)}</div>
          {days.map((d) => {
            const key = ymd(d, c.tz);
            return (
              <div key={d} className="col" style={{ height: (H1 - H0) * PX, backgroundSize: `100% ${2 * PX}px` }}>
                {c.busy.filter((b) => ymd(b.startISO, c.tz) === key).map((b) => <div key={b.startISO} className="blk busy" style={{ top: y(b.startISO), height: Math.max(16, y(b.endISO) - y(b.startISO)) }}>{b.title}</div>)}
                {c.due.filter((x) => ymd(x.dateISO, c.tz) === key).map((x) => <div key={x.name} className="blk due" style={{ top: Math.min(y(x.dateISO), (H1 - H0) * PX - 30), height: 30 }}>{x.name}</div>)}
                {ymd(c.startISO, c.tz) === key && <div className={`blk one ${booked ? "booked" : "pro"}`} style={{ top: y(c.startISO), height: Math.max(26, y(c.endISO) - y(c.startISO)) }}>{c.label}</div>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="sec"><div className="h"><span>Why this slot</span></div>
        <ul className="why">{c.why.map((w, i) => <li key={i}><i>{i + 1}</i><span><b>{w.strong}</b>{w.rest}</span></li>)}</ul>
      </div>
      {c.status === "pending" && line && (<><a className="cta" href={sms("YES")}>Reply YES to book it</a><a className="cta ghost" href={sms("Make it ")}>Pick another time</a></>)}
      {booked && c.calendarUrl && <a className="cta cal" href={c.calendarUrl} target="_blank" rel="noopener noreferrer"><GCal />Open in Google Calendar</a>}
      <div className="foot">{booked ? "It's on your calendar." : "Nothing goes on your calendar until you text YES."}</div>
    </>
  );
}

function Round({ c }: { c: RoundCard }) {
  const missed = c.questions.filter((q) => !q.firstTry);
  const top = [...c.mastery].sort((a, b) => (b.after - b.before) - (a.after - a.before))[0];
  const moving = top && top.after > top.before;
  return (
    <>
      <Who name={c.agentName} role="tutor" />
      <h2><em>{c.right} of {c.total}.</em><br />{moving ? `${top.topic} is moving.` : c.right === c.total ? "Clean round." : "Good reps."}</h2>
      <p className="sub">{day(c.updatedAt, c.tz)}, {time(c.updatedAt, c.tz)} · {c.total} questions{c.minutes ? ` · about ${c.minutes} minute${c.minutes === 1 ? "" : "s"}` : ""}</p>
      <div className="donut sm">
        <Ring size={132} stroke={16} label={`${c.right} of ${c.total} right on the first try`} segs={[{ value: c.total ? c.right / c.total : 0, color: C.good, title: `${c.right} right` }, { value: c.total ? (c.total - c.right) / c.total : 0, color: C.bad, title: `${c.total - c.right} missed` }]}>
          <b>{c.total ? Math.round((c.right / c.total) * 100) : 0}%</b><span>first try</span>
        </Ring>
        <div className="dots">{c.questions.map((q, i) => <span key={i} style={{ background: q.firstTry ? C.good : C.bad, animationDelay: `${i * 70}ms` }}>{i + 1}</span>)}</div>
      </div>
      {missed.length > 0 && (
        <div className="sec"><div className="h"><span>{missed.length === 1 ? "The one you missed" : `The ${missed.length} you missed`}</span></div>
          {c.questions.map((q, i) => q.firstTry ? null : (
            <div key={i} className="q"><div className="top"><i style={{ background: C.bad }}>{i + 1}</i>{q.prompt}</div>
              <div className="exp">{q.chose ? <>You said <b>{q.chose}</b>. </> : null}It&apos;s <b>{q.correct}</b>. {q.explanation}</div></div>
          ))}
        </div>
      )}
      {c.right > 0 && (
        <details className="q"><summary className="top"><i style={{ background: C.good }}>✓</i>{missed.length ? `The other ${c.right}, all right` : `All ${c.right} right`}<span className="more">show</span></summary>
          {c.questions.map((q, i) => q.firstTry ? <div key={i} className="exp" style={{ marginTop: 10 }}><b>{q.prompt}</b><br />{q.correct}</div> : null)}
        </details>
      )}
      {c.mastery.length > 0 && (
        <div className="sec"><div className="h"><span>Mastery</span><span>before → now</span></div>
          {c.mastery.map((m) => (
            <div key={m.topic} className="bar"><div className="lbl">{m.topic} <span>{pct(m.before)} → {pct(m.after)}</span></div>
              <div className="tr"><div className="was" style={{ width: pct(Math.min(m.before, m.after)) }} /><div className="now" style={{ width: pct(m.after), background: m.after >= m.before ? (m.after >= 0.6 ? C.good : C.tutor) : C.bad }} /></div></div>
          ))}
        </div>
      )}
      {line && <a className="cta" href={sms("quiz me")}>Another round</a>}
      <div className="foot">Scores are counted by code, not guessed.</div>
    </>
  );
}

function Drill({ c }: { c: DrillCard }) {
  const n = c.covered.length + c.missed.length;
  const secs = c.durationSecs ?? 0;
  return (
    <>
      <Who name={c.agentName} role="voice drill" />
      <h2>You explained<br /><em>{c.covered.length} of {n} point{n === 1 ? "" : "s"}</em></h2>
      <p className="sub">{[c.topic, secs ? `${Math.floor(secs / 60)} min ${secs % 60} s` : null, `${day(c.updatedAt, c.tz)}, ${time(c.updatedAt, c.tz)}`].filter(Boolean).join(" · ")}</p>
      <div className="wave" aria-hidden="true">{Array.from({ length: 52 }, (_, i) => <span key={i} style={{ height: 5 + Math.round(22 * Math.abs(Math.sin(i * 1.3 + secs) * Math.cos(i * 0.45))) }} />)}</div>
      {c.snippet && <div className="quote">{c.snippet}</div>}
      <div className="sec"><div className="h"><span>Key points</span></div>
        <ul className="kp">
          {c.covered.map((k) => <li key={k}><i style={{ background: C.good }}>✓</i><span><b>{k}</b></span></li>)}
          {c.missed.map((k) => <li key={k}><i style={{ background: C.bad }}>–</i><span><b>{k}</b></span></li>)}
        </ul>
      </div>
      <div className="sec"><div className="h"><span>The answer</span></div><div className="ans">{c.answer}</div></div>
      {c.before !== undefined && c.after !== undefined && (
        <div className="sec"><div className="h"><span>Mastery</span><span>before → now</span></div>
          <div className="donut sm">
            <Ring size={132} stroke={16} label={`${c.topic} mastery is ${pct(c.after)}`} segs={[{ value: Math.min(c.before, c.after), color: "#d8cdb4", title: `before · ${pct(c.before)}` }, { value: Math.abs(c.after - c.before), color: c.after >= c.before ? C.tutor : C.bad, title: `${c.after >= c.before ? "gained" : "lost"} · ${pct(Math.abs(c.after - c.before))}` }]}>
              <b>{pct(c.after)}</b><span>{c.after >= c.before ? `+${Math.round((c.after - c.before) * 100)} today` : `${Math.round((c.after - c.before) * 100)} today`}</span>
            </Ring>
            <p className="ringnote">{c.topic}. The sand part is where you started; the colour is what this call added.</p>
          </div>
          <div className="bar"><div className="lbl">{c.topic} <span>{pct(c.before)} → {pct(c.after)}</span></div>
            <div className="tr"><div className="was" style={{ width: pct(Math.min(c.before, c.after)) }} /><div className="now" style={{ width: pct(c.after), background: c.after >= c.before ? C.tutor : C.bad }} /></div></div>
        </div>
      )}
      {line && <a className="cta" href={sms("CALL")}>Text CALL to try again</a>}
      <div className="foot">Graded from the call transcript. The audio isn&apos;t kept here.</div>
    </>
  );
}

export default async function CardPage({ params }: Props) {
  const c: Card | null = await loadCard((await params).id);
  if (!c) notFound();
  return (
    <main className="pg">
      {c.kind === "semester" && <Semester c={c} />}
      {c.kind === "week" && <Week c={c} />}
      {c.kind === "round" && <Round c={c} />}
      {c.kind === "drill" && <Drill c={c} />}
    </main>
  );
}
