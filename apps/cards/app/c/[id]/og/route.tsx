// The picture iMessage draws for a card link: drawn from the student's own numbers, never generic.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { day, loadCard, time, type Card } from "@/lib/card";

// Served at /c/<id>/og?v=<version>: the version changes whenever the card does, so iMessage never reuses an old picture.
const size = { width: 1200, height: 630 };
const headers = { "Cache-Control": "public, max-age=60, s-maxage=300" };

const C = { paper: "#fffcf5", ink: "#1e2740", faint: "#8a8f9e", rule: "#ece5d4", mark: "#ffdf6b", lead: "#2c6e6a", tutor: "#c8553d", planner: "#6d7fb3", good: "#2f7a5b", bad: "#c2412d" };
const BUB = "M36 20h48a24 24 0 0 1 24 24v22a24 24 0 0 1-24 24H62l-20 18 3-18.4A24 24 0 0 1 12 66V44a24 24 0 0 1 24-24z";

function words(c: Card): { tab: string; kicker: string; lead: string; hl: string; tail: string } {
  if (c.kind === "semester") {
    const exams = c.items.filter((i) => i.isExam);
    const big = exams.filter((e) => !e.done).sort((a, b) => b.weight - a.weight)[0];
    return { tab: C.lead, kicker: `Your semester · ${c.course.split(":")[0]!.trim()}`.slice(0, 40), lead: `${exams.length} exam${exams.length === 1 ? "" : "s"}. `, hl: big?.dateISO ? day(big.dateISO, c.tz, { month: "short", day: "numeric" }) : "One", tail: " matters most." };
  }
  if (c.kind === "week") {
    const k = c.status === "approved" ? "Booked" : c.status === "declined" ? "Skipped" : "Proposed · not booked yet";
    return { tab: C.planner, kicker: k, lead: `${day(c.startISO, c.tz, { weekday: "short" })} ${time(c.startISO, c.tz).replace(":00", "")} for `, hl: c.label.replace(/ review$/, ""), tail: "" };
  }
  if (c.kind === "round") {
    const top = [...c.mastery].sort((a, b) => (b.after - b.before) - (a.after - a.before))[0];
    const short = top?.topic.split(":")[0] ?? "";
    return { tab: C.tutor, kicker: `Round recap · ${c.total} questions`, lead: "", hl: `${c.right} of ${c.total}.`, tail: top && top.after > top.before ? ` ${short} is moving.` : c.right === c.total ? " Clean round." : " Good reps." };
  }
  const n = c.covered.length + c.missed.length;
  const s = c.durationSecs ?? 0;
  return { tab: C.tutor, kicker: `Voice drill${s ? ` · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : ""}`, lead: "You explained ", hl: `${c.covered.length} of ${n}`, tail: ` point${n === 1 ? "" : "s"}` };
}

function Visual({ c }: { c: Card }) {
  if (c.kind === "semester") {
    const exams = c.items.filter((i) => i.isExam && i.dateISO);
    const maxW = Math.max(...exams.map((e) => e.weight), 0.01);
    const big = exams.filter((e) => !e.done).sort((a, b) => b.weight - a.weight)[0];
    return (
      <div style={{ display: "flex", alignItems: "flex-end", gap: 34, height: 230, borderBottom: `5px solid ${C.rule}`, padding: "0 30px" }}>
        {exams.map((e) => <div key={e.name} style={{ width: 64, height: 60 + 160 * (e.weight / maxW), borderRadius: "14px 14px 4px 4px", background: e === big ? C.tutor : C.ink, opacity: e === big ? 1 : 0.28 }} />)}
      </div>
    );
  }
  if (c.kind === "week") {
    const booked = c.status === "approved";
    return (
      <div style={{ display: "flex", gap: 14 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", width: 62, height: 250, borderRadius: 12, background: C.rule, padding: 6, gap: 8 }}>
            {i % 2 === 0 && <div style={{ height: 40, borderRadius: 8, background: "#d8cfbb", marginTop: 20 }} />}
            {i === 1 && <div style={{ height: 70, borderRadius: 8, marginTop: 100, background: booked ? C.planner : "#dfe4f3", border: booked ? "none" : `5px dashed ${C.planner}` }} />}
          </div>
        ))}
      </div>
    );
  }
  if (c.kind === "round") {
    return (
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", width: 420, justifyContent: "center" }}>
        {c.questions.map((q, i) => <div key={i} style={{ width: 66, height: 66, borderRadius: 33, background: q.firstTry ? C.good : C.bad }} />)}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 9, alignItems: "center", height: 200 }}>
      {Array.from({ length: 22 }, (_, i) => <div key={i} style={{ width: 9, borderRadius: 5, background: C.tutor, opacity: 0.75, height: 20 + Math.round(150 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6))) }} />)}
    </div>
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await loadCard((await params).id);
  const dir = join(process.cwd(), "assets");
  const [fraunces, figtree] = await Promise.all([readFile(join(dir, "fraunces-600.woff")), readFile(join(dir, "figtree-700.woff"))]);
  const fonts = [{ name: "Fraunces", data: fraunces, weight: 600 as const }, { name: "Figtree", data: figtree, weight: 700 as const }];
  if (!c) {
    return new ImageResponse(<div style={{ display: "flex", width: "100%", height: "100%", background: C.paper, alignItems: "center", justifyContent: "center", fontFamily: "Fraunces", fontSize: 80, color: C.ink }}>Syllabus Crew</div>, { ...size, fonts, headers });
  }
  const w = words(c);
  // Words are laid out one per span (Satori drops spaces at span edges). Long headlines get a smaller size.
  const len = (w.lead + w.hl + w.tail).length;
  const fontSize = len <= 16 ? 104 : len <= 24 ? 92 : len <= 32 ? 80 : 70;
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: C.paper, position: "relative" }}>
        <div style={{ display: "flex", width: 30, height: "100%", background: w.tab }} />
        <div style={{ display: "flex", flexDirection: "column", padding: "64px 0 0 70px", width: 640 }}>
          <div style={{ display: "flex", fontFamily: "Figtree", fontWeight: 700, fontSize: 30, letterSpacing: 5, textTransform: "uppercase", color: C.faint }}>{w.kicker}</div>
          <div style={{ display: "flex", flexWrap: "wrap", columnGap: Math.round(fontSize * 0.26), marginTop: 34, fontFamily: "Fraunces", fontSize, lineHeight: 1.04, letterSpacing: -2, color: C.ink }}>
            {w.lead.split(" ").filter(Boolean).map((t, i) => <span key={`l${i}`}>{t}</span>)}
            <span style={{ backgroundImage: `linear-gradient(transparent 58%, ${C.mark} 58%, ${C.mark} 92%, transparent 92%)` }}>{w.hl.replace(/ /g, "\u00a0")}</span>
            {w.tail.split(" ").filter(Boolean).map((t, i) => <span key={`t${i}`}>{t}</span>)}
          </div>
        </div>
        <div style={{ display: "flex", position: "absolute", right: 70, top: 0, bottom: 0, alignItems: "center" }}><Visual c={c} /></div>
        <svg width="96" height="96" viewBox="0 0 120 120" style={{ position: "absolute", right: 44, bottom: 36 }}>
          <path fill={C.lead} d={BUB} /><circle cx="46" cy="50" r="6" fill={C.ink} /><circle cx="74" cy="50" r="6" fill={C.ink} />
        </svg>
      </div>
    ),
    { ...size, fonts, headers },
  );
}

