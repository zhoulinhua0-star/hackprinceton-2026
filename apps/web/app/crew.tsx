"use client";
// The crew as characters: who they are (tree) and what each one does and refuses to do (explorer).
// Presentation only. The copy mirrors the rules enforced in the agent's code.
import { useEffect, useId, useRef, useState } from "react";

export type AgentId = "lead" | "scout" | "tutor" | "planner" | "nudger";
export const COLORS: Record<AgentId, string> = { lead: "#2c6e6a", scout: "#d98b2b", tutor: "#c8553d", planner: "#6d7fb3", nudger: "#7a9e5a" };
const INK = "#1e2740";

/** Which specialist sent a text, from the `kind` the agent records with every outbound message. */
export function agentOf(kind?: string): AgentId {
  if (kind === "scout") return "scout";
  if (kind === "quiz" || kind === "tutor") return "tutor";
  if (kind === "proposal" || kind === "approval") return "planner";
  if (kind === "nudge" || kind === "reminder") return "nudger";
  return "lead";
}

function Face({ y }: { y: number }) {
  return (
    <>
      <g className="eyes">
        <circle cx="48" cy={y} r="5" fill={INK} /><circle cx="72" cy={y} r="5" fill={INK} />
        <circle cx="49.6" cy={y - 1.6} r="1.5" fill="#fff" /><circle cx="73.6" cy={y - 1.6} r="1.5" fill="#fff" />
      </g>
      <path d={`M54 ${y + 11} q6 5 12 0`} fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

/** Stationery with a face: a speech bubble, binoculars, a flashcard, a calendar page, a bell. */
export function Character({ kind, size = 96, className = "" }: { kind: AgentId; size?: number; className?: string }) {
  const c = COLORS[kind];
  const shade = `color-mix(in srgb, ${c} 72%, #000)`, lite = `color-mix(in srgb, ${c} 45%, #fff)`;
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={`char ${className}`} aria-hidden="true">
      {kind === "lead" && (<><path fill={c} d="M40 14h40a26 26 0 0 1 26 26v20a26 26 0 0 1-26 26H60l-20 20 3-20.2A26 26 0 0 1 14 60V40a26 26 0 0 1 26-26z" /><Face y={46} /></>)}
      {kind === "scout" && (<>
        <rect x="16" y="34" width="88" height="70" rx="32" fill={c} />
        <circle cx="42" cy="56" r="17" fill="#fff" /><circle cx="78" cy="56" r="17" fill="#fff" />
        <rect x="54" y="52" width="12" height="8" fill={shade} />
        <g className="eyes"><circle cx="44" cy="57" r="7" fill={INK} /><circle cx="80" cy="57" r="7" fill={INK} /><circle cx="46.5" cy="54.5" r="2.2" fill="#fff" /><circle cx="82.5" cy="54.5" r="2.2" fill="#fff" /></g>
        <path d="M54 88 q6 5 12 0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      </>)}
      {kind === "tutor" && (<><path fill={c} d="M30 22h46l26 26v40a12 12 0 0 1-12 12H30a12 12 0 0 1-12-12V34a12 12 0 0 1 12-12z" /><path fill={lite} d="M76 22l26 26H84a8 8 0 0 1-8-8z" /><Face y={64} /></>)}
      {kind === "planner" && (<>
        <rect x="16" y="26" width="88" height="78" rx="16" fill={c} /><path fill={shade} d="M18 44h84v6H18z" opacity=".55" />
        <rect x="38" y="14" width="9" height="22" rx="4.5" fill={lite} /><rect x="73" y="14" width="9" height="22" rx="4.5" fill={lite} /><Face y={70} />
      </>)}
      {kind === "nudger" && (<><circle cx="60" cy="98" r="10" fill={shade} /><path fill={c} d="M60 14c-21 0-34 15-34 37v17L14 88a4 4 0 0 0 3.4 6h85.2a4 4 0 0 0 3.4-6L94 68V51c0-22-13-37-34-37z" /><Face y={56} /></>)}
    </svg>
  );
}

interface Member { label: string; line: string; sub: string; blurb: string; does: [string, string][]; wont: string[]; sample: string }
export function crewCopy(name: string): Record<AgentId, Member> {
  return {
    lead: { label: name, line: `You only ever text ${name}.`, sub: `${name} reads every message and decides who answers.`,
      blurb: `${name} is the one you text. It matches A/B/C and YES/NO in code first, then hands everything else to the right specialist.`,
      does: [["The one you text", "You never pick an agent. You just text."], ["Asks when it isn't sure", "An unclear reply gets a short question back, not a guess."], ["Named by you", "Call it whatever you like, and change it any time."]],
      wont: ["Guess at a YES you didn't send", "Text between 11pm and 8am", "Pretend to know something it doesn't"], sample: `I'm ${name}, your personal agent from Syllabus Crew. Send me your syllabus as a PDF and I'll take it from there.` },
    scout: { label: "Scout", line: "Scout notices what changed.", sub: "New slides, a moved exam. It only reads.",
      blurb: "Scout watches for anything new: slides posted, an exam that moved. It only reads.",
      does: [["Spots changes", "New slides become new quiz questions."], ["Tells you once", "One short text, then the Tutor takes over."], ["Counts toward the daily limit", "Three proactive texts a day, total."]],
      wont: ["Send email", "Delete or edit anything", "Post on your behalf"], sample: "Prof. Lee posted Week 6 slides. Added a few questions to your quiz." },
    tutor: { label: "Tutor", line: "Tutor asks before it tells.", sub: "Miss once and you get a question back, not the answer.",
      blurb: "Tutor quizzes you on what the exam actually covers, weakest topics first. Grading is code, not a guess.",
      does: [["A / B / C by text", "Rounds of five, or one quick question."], ["Hint before answer", "Miss once and it asks a question back."], ["Tracks mastery", "Every answer moves the bar you see above."]],
      wont: ["Reveal the answer on the first miss", "Send more than 3 unasked questions a day", "Let the model do the grading"], sample: "Not quite. When borrowing becomes more expensive, why would a business be more or less likely to take out a loan?" },
    planner: { label: "Planner", line: "Planner proposes. You decide.", sub: "Nothing reaches your calendar without your YES.",
      blurb: "Planner looks for weak topics on heavy exams and proposes study time. It can only propose.",
      does: [["Weighs the stakes", "A 25% exam beats a 2% quiz."], ["Proposes a slot", "A specific day and time, in one text."], ["Waits for YES", "Only your YES writes to Google Calendar."]],
      wont: ["Touch your calendar on its own", "Stack proposals: one open at a time", "Move events you made"], sample: "Exam 2 is 25% and chapter 5 is your weak spot. Want me to add 30 minutes of review on Tuesday? Reply YES or NO." },
    nudger: { label: "Nudger", line: "Nudger knows when to stay quiet.", sub: "Three a day at most, and never at night.",
      blurb: "Nudger decides whether a reminder is worth your attention right now. Usually the answer is no.",
      does: [["Reminders you asked for", "\"Remind me Sunday to...\" always arrives."], ["Backs off", "Two ignored nudges and it goes quiet."], ["Stops when told", "\"Stop nudging me\" pauses it until you say resume."]],
      wont: ["Nudge outside 9am to 8pm", "Interrupt a conversation in progress", "Nudge more than 3 times a day"], sample: "Exam 2 is due in 3 days (25% of your grade), and you're at 35% on chapter 5. Want a quick 3-question round on it? Reply YES or NO." },
  };
}

const KIDS: AgentId[] = ["scout", "tutor", "planner", "nudger"];
const WIRES = ["M500 4 C500 70 150 40 125 116", "M500 4 C500 70 390 50 375 116", "M500 4 C500 70 610 50 625 116", "M500 4 C500 70 850 40 875 116"];
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ALL = 5; // every member shown

/**
 * The crew tree. On a wide screen it is pinned while the page scrolls: the lead first, then each line draws
 * and its specialist arrives. Narrow screens and reduced motion get the finished tree.
 */
export function CrewTree({ name, named = false }: { name: string; named?: boolean }) {
  const copy = crewCopy(name);
  const ref = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, "");
  const [step, setStep] = useState(ALL);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)"), narrow = window.matchMedia("(max-width: 980px), (max-height: 640px)");
    let raf = 0;
    const calc = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const on = !still.matches && !narrow.matches;
      setPinned(on);
      if (!on) return setStep(ALL);
      const r = el.getBoundingClientRect(), span = r.height - window.innerHeight;
      setStep(span > 0 ? clamp(-r.top / span) * ALL : ALL);
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(calc); };
    calc();
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    return () => { window.removeEventListener("scroll", queue); window.removeEventListener("resize", queue); cancelAnimationFrame(raf); };
  }, []);

  const done = step >= 4.75;
  const active: AgentId | "all" = done ? "all" : step < 0.8 ? "lead" : KIDS[Math.min(3, Math.floor(step - 0.8))]!;
  const head = active === "all" ? { line: "One thread. Four specialists behind it.", sub: `You text ${name}. ${name} decides who answers.` } : copy[active];
  const leadChips = done ? 0 : 1 - clamp((step - 0.75) / 0.25);

  return (
    <section ref={ref} className={`tree-scroll ${pinned ? "pinned" : ""}`} aria-label="The crew">
      <div className="tree-stage">
        <div className="tree-head" key={active}>
          <h2>{head.line}</h2>
          <p>{head.sub}</p>
        </div>
        <div className="tree">
          <div className={`tree-lead ${active === "lead" ? "on" : ""}`}>
            <Character kind="lead" size={124} />
            <b>{name}</b>
            <small>{named ? "the name you gave it" : "rename it any time"}</small>
            <div className="lead-chips" style={{ opacity: leadChips, transform: `translateX(${(1 - leadChips) * 14}px)` }} aria-hidden={leadChips < 0.5}>
              {copy.lead.does.map((d) => <span key={d[0]}>{d[0]}</span>)}
            </div>
          </div>
          <svg className="wires" viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden="true">
            {WIRES.map((d, i) => {
              const w = clamp((step - (0.8 + i)) / 0.45);
              return (
                <g key={i}>
                  <mask id={`${uid}w${i}`} maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="120">
                    <path d={d} pathLength={1} fill="none" stroke="#fff" strokeWidth="16" strokeDasharray="1" strokeDashoffset={1 - w} />
                  </mask>
                  <path d={d} mask={`url(#${uid}w${i})`} vectorEffect="non-scaling-stroke" />
                </g>
              );
            })}
          </svg>
          <div className="tree-kids">
            {KIDS.map((k, i) => {
              const c = clamp((step - (1.1 + i)) / 0.25), chips = clamp((step - (1.3 + i)) / 0.3);
              return (
                <div className={`tree-kid ${active === k ? "on" : ""}`} key={k}>
                  <div style={{ opacity: c, transform: `translateY(${(1 - c) * 18}px) scale(${0.86 + 0.14 * c})` }}>
                    <Character kind={k} size={92} />
                    <b style={active === k ? { color: COLORS[k] } : undefined}>{copy[k].label}</b>
                  </div>
                  {copy[k].does.slice(0, 2).map((d, j) => {
                    const t = clamp(chips * 1.5 - j * 0.5);
                    return <span key={d[0]} style={{ opacity: t, transform: `translateY(${(1 - t) * 10}px)` }}>{d[0]}</span>;
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

const ORDER: AgentId[] = ["lead", "scout", "tutor", "planner", "nudger"];

/** Tabs: pick a crew member, see what it does, what it refuses to do, and a text it actually sends. */
export function Explorer({ name }: { name: string }) {
  const copy = crewCopy(name);
  const [k, setK] = useState<AgentId>("tutor");
  const a = copy[k];
  return (
    <section className="sec">
      <h2>Meet the crew</h2>
      <p>Each one has its own rules, and its own list of things it will not do.</p>
      <div className="explore">
        <div>
          <div className="tabs" role="tablist" aria-label="Crew members">
            {ORDER.map((id) => (
              <button key={id} role="tab" aria-selected={id === k} onClick={() => setK(id)}>
                <i style={{ background: COLORS[id] }} />{copy[id].label}
              </button>
            ))}
          </div>
          <div className="pane" key={k} role="tabpanel">
            <p className="blurb">{a.blurb}</p>
            <div className="does">{a.does.map((d) => <div key={d[0]}>{d[0]}<small>{d[1]}</small></div>)}</div>
          </div>
        </div>
        <div className="wont" key={`w-${k}`}>
          <div className="wont-who"><Character kind={k} size={56} /><h3>{a.label} won't</h3></div>
          <ul>{a.wont.map((w) => <li key={w}>{w}</li>)}</ul>
          <div className="who"><i style={{ background: COLORS[k] }} />{a.label} says</div>
          <div className="bubble out sample">{a.sample}</div>
        </div>
      </div>
    </section>
  );
}
