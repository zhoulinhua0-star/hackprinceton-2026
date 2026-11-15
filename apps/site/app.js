// Draws the pitch page from content.js. No network, no data: every thread is an example in Syl's real wording.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") el.className = v; else if (k === "html") el.innerHTML = v; else if (k === "style") el.style.cssText = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    return el;
  };
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, still ? 0 : ms));

  // ---------- the crew, drawn (same shapes as the dashboard's crew.tsx) ----------
  const INK = "#1e2740";
  const face = (y) => `<g class="eyes"><circle cx="48" cy="${y}" r="5" fill="${INK}"/><circle cx="72" cy="${y}" r="5" fill="${INK}"/><circle cx="49.6" cy="${y - 1.6}" r="1.5" fill="#fff"/><circle cx="73.6" cy="${y - 1.6}" r="1.5" fill="#fff"/></g><path d="M54 ${y + 11} q6 5 12 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
  function charSvg(kind, size = 96) {
    const c = CREW[kind].color, shade = `color-mix(in srgb,${c} 72%,#000)`, lite = `color-mix(in srgb,${c} 45%,#fff)`;
    const body = {
      lead: `<path fill="${c}" d="M40 14h40a26 26 0 0 1 26 26v20a26 26 0 0 1-26 26H60l-20 20 3-20.2A26 26 0 0 1 14 60V40a26 26 0 0 1 26-26z"/>${face(46)}`,
      scout: `<rect x="16" y="34" width="88" height="70" rx="32" fill="${c}"/><circle cx="42" cy="56" r="17" fill="#fff"/><circle cx="78" cy="56" r="17" fill="#fff"/><rect x="54" y="52" width="12" height="8" fill="${shade}"/><g class="eyes"><circle cx="44" cy="57" r="7" fill="${INK}"/><circle cx="80" cy="57" r="7" fill="${INK}"/><circle cx="46.5" cy="54.5" r="2.2" fill="#fff"/><circle cx="82.5" cy="54.5" r="2.2" fill="#fff"/></g><path d="M54 88 q6 5 12 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
      tutor: `<path fill="${c}" d="M30 22h46l26 26v40a12 12 0 0 1-12 12H30a12 12 0 0 1-12-12V34a12 12 0 0 1 12-12z"/><path fill="${lite}" d="M76 22l26 26H84a8 8 0 0 1-8-8z"/>${face(64)}`,
      planner: `<rect x="16" y="26" width="88" height="78" rx="16" fill="${c}"/><path fill="${shade}" d="M18 44h84v6H18z" opacity=".55"/><rect x="38" y="14" width="9" height="22" rx="4.5" fill="${lite}"/><rect x="73" y="14" width="9" height="22" rx="4.5" fill="${lite}"/>${face(70)}`,
      nudger: `<circle cx="60" cy="98" r="10" fill="${shade}"/><path fill="${c}" d="M60 14c-21 0-34 15-34 37v17L14 88a4 4 0 0 0 3.4 6h85.2a4 4 0 0 0 3.4-6L94 68V51c0-22-13-37-34-37z"/>${face(56)}`,
    }[kind];
    return `<svg class="char" viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;
  }
  $$("[data-char]").forEach((el) => { el.outerHTML = charSvg(el.dataset.char, +el.dataset.size || 96); });

  // ---------- the phone ----------
  const ICON = {
    pdf: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>`,
    img: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>`,
    call: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>`,
  };
  const CARD_PREVIEW = {
    semester: ["ECON 201 · your semester", "70% of the grade still ahead", "donut"],
    week: ["Ch. 5 review · Tue, Nov 17", "Proposed · reply YES to book it", "week"],
    booked: ["Ch. 5 review · booked", "Open in Google Calendar", "week"],
    round: ["Round recap · 4 of 5", "Ch. 5 is up to 52%", "ring"],
    drill: ["Voice drill · Ch. 5: Rates", "2 of 3 key points", "ring"],
  };
  const miniArt = {
    donut: `<svg width="64" height="64" viewBox="0 0 42 42"><circle cx="21" cy="21" r="15.9" fill="none" stroke="#e0d8c6" stroke-width="6"/><circle cx="21" cy="21" r="15.9" fill="none" stroke="#c2412d" stroke-width="6" stroke-dasharray="25 75" stroke-dashoffset="25"/><circle cx="21" cy="21" r="15.9" fill="none" stroke="#1e2740" stroke-width="6" stroke-dasharray="45 55" stroke-dashoffset="0"/></svg>`,
    week: `<svg width="92" height="58" viewBox="0 0 92 58"><g fill="#ebe4d3">${[0, 1, 2, 3, 4].map((i) => `<rect x="${i * 18.5}" y="0" width="16" height="58" rx="4"/>`).join("")}</g><rect x="19.5" y="22" width="14" height="10" rx="3" fill="#6d7fb3"/><rect x="38" y="8" width="14" height="12" rx="3" fill="#d9d1bf"/><rect x="1" y="36" width="14" height="9" rx="3" fill="#d9d1bf"/></svg>`,
    ring: `<svg width="64" height="64" viewBox="0 0 42 42"><circle cx="21" cy="21" r="15.9" fill="none" stroke="#e0d8c6" stroke-width="5"/><circle cx="21" cy="21" r="15.9" fill="none" stroke="#2f7a5b" stroke-width="5" stroke-linecap="round" stroke-dasharray="78 22" stroke-dashoffset="25"/></svg>`,
  };

  function makePhone(host) {
    host.innerHTML = "";
    const msgs = h("div", { class: "msgs", "aria-live": "polite" });
    host.append(h("div", { class: "phone" }, h("div", { class: "phone-head", html: `${charSvg("lead", 40)}<span><b>Syl</b> · iMessage</span>` }), msgs));
    let run = 0;
    const scroll = () => { msgs.scrollTop = msgs.scrollHeight; };
    function bubble(who, text) {
      if (who === "note") return h("div", { class: "note" }, text);
      if (text.startsWith("file:")) {
        const name = text.slice(5), img = /\.(png|jpe?g|heic)$/i.test(name);
        return h("div", { class: "b in file", html: `${img ? ICON.img : ICON.pdf}<span></span>` }, name);
      }
      if (text.startsWith("vcard:")) return h("div", { class: "vcard", html: `<img src="/assets/avatar-chill.png" alt=""><span><b>${text.slice(6)}</b>Contact card · tap to save</span>` });
      if (text.startsWith("call:")) return h("div", { class: "callpill", html: `${ICON.call}<span></span>` }, text.slice(5));
      if (text.startsWith("card:")) {
        const [title, sub, art] = CARD_PREVIEW[text.slice(5)];
        const el = h("div", { class: "att", html: `<div class="att-art">${miniArt[art]}</div><div class="cap"><b></b><small></small><span class="url">syllabus-crew-cards.vercel.app</span></div>` });
        $("b", el).textContent = title; $("small", el).textContent = sub;
        return el;
      }
      return h("div", { class: `b ${who === "me" ? "in" : "out"}` }, text);
    }
    async function play(name, done) {
      const id = ++run; msgs.innerHTML = "";
      let last = null;
      for (const [who, text] of THREADS[name]) {
        if (id !== run) return;
        if (who !== "me" && who !== "note") {
          if (last !== who) msgs.append(h("div", { class: "who", html: `<i style="background:${CREW[who].color}"></i>${CREW[who].name}` }));
          const t = h("div", { class: "typing", html: "<span></span><span></span><span></span>" });
          msgs.append(t); scroll(); await sleep(600); t.remove();
          if (id !== run) return;
        } else await sleep(who === "note" ? 300 : 520);
        msgs.append(bubble(who, text)); scroll();
        if (who !== "note") last = who;
        await sleep(400);
      }
      if (id !== run) return;
      msgs.append(h("div", { class: "ex" }, "Example conversation, in Syl's real wording"), h("button", { class: "replay", onclick: () => play(name, done) }, "Play again"));
      scroll();
      done?.();
    }
    return { play };
  }

  // ---------- hero: pins on the campus ----------
  const hero = makePhone($('[data-phone="hero"]'));
  const pins = $$(".pin");
  let toured = false;
  pins.forEach((p) => p.addEventListener("click", () => {
    toured = true;
    pins.forEach((x) => x.setAttribute("aria-pressed", x === p));
    if (window.matchMedia("(max-width: 980px)").matches) $(".hero-phone").scrollIntoView({ behavior: still ? "auto" : "smooth", block: "center" });
    hero.play(p.dataset.play);
  }));
  const chips = $("#places");
  pins.forEach((p) => chips.append(h("button", { style: `--c:var(--${p.dataset.c})`, onclick: () => p.click(), html: `<span class="n">${$(".n", p).textContent}</span>${$(".pl", p).textContent}` })));
  const syncChips = () => $$("button", chips).forEach((c, i) => c.setAttribute("aria-pressed", pins[i].getAttribute("aria-pressed")));
  pins.forEach((p) => p.addEventListener("click", syncChips));
  pins[0].setAttribute("aria-pressed", "true"); syncChips();
  // Until someone taps a pin, the phone walks the campus by itself: [pin, thread]. The quad plays the quiz, then the call.
  const TOUR = [[0, "hello"], [2, "quiz"], [2, "call"], [3, "propose"], [1, "scout"], [4, "night"]];
  const tour = (i) => {
    if (toured) return;
    const [pin, name] = TOUR[i % TOUR.length];
    pins.forEach((x, j) => x.setAttribute("aria-pressed", j === pin)); syncChips();
    hero.play(name, () => { if (!still) setTimeout(() => tour(i + 1), 3200); });
  };
  setTimeout(() => tour(0), still ? 0 : 900);

  // ---------- the crew: the routing line (Syl hands each text to one of four) ----------
  const SUBS = ["scout", "tutor", "planner", "nudger"];
  const ROUTE = {
    scout: ["reads new slides and deadlines", "Prof. Lee posted Week 6 slides.", "new slides posted"],
    tutor: ["questions, hints, mastery, voice drills", "Question 1 of 5 · Ch. 5…", "quiz me on chapter 5"],
    planner: ["proposes study time; only YES books it", "Want me to add 30 minutes…?", "book me a study block"],
    nudger: ["reminders, and when to stay quiet", "Got it. I'll remind you Sunday…", "remind me sunday"],
  };
  const lanesEl = $("#lanes"), wiresSvg = $("#lanes-svg"), routeIn = $("#route-in");
  const lanes = SUBS.map((k) => {
    const b = h("button", { class: "lane", style: `--c:${CREW[k].color}`, "data-k": k, html: `${charSvg(k, 40)}<span><b>${CREW[k].name}</b><small>${ROUTE[k][0]}</small></span><span class="say">“${ROUTE[k][1]}”</span>` });
    lanesEl.append(b); return b;
  });
  const drawWires = () => {
    const r0 = lanesEl.getBoundingClientRect();
    wiresSvg.setAttribute("viewBox", `0 0 64 ${r0.height}`);
    wiresSvg.innerHTML = lanes.map((l) => { const r = l.getBoundingClientRect(), y = r.top - r0.top + r.height / 2; return `<path class="wire" data-k="${l.dataset.k}" d="M0 ${r0.height / 2} C 34 ${r0.height / 2}, 30 ${y}, 64 ${y}"/>`; }).join("");
    if (litLane) paintWires(litLane);
  };
  let litLane = null;
  const paintWires = (k) => $$(".wire", wiresSvg).forEach((w) => { const on = w.dataset.k === k; w.classList.toggle("on", on); w.style.stroke = on ? CREW[w.dataset.k].color : ""; });
  let laneAuto = 1, laneTimer = null;
  const lightLane = (k) => {
    litLane = k;
    lanes.forEach((l) => l.classList.toggle("on", l.dataset.k === k));
    paintWires(k);
    routeIn.textContent = ROUTE[k][2];
  };
  const cycle = () => { clearInterval(laneTimer); if (still) return; laneTimer = setInterval(() => { laneAuto = (laneAuto + 1) % 4; lightLane(SUBS[laneAuto]); }, 2200); };
  drawWires(); addEventListener("resize", drawWires); document.fonts?.ready.then(drawWires);
  // Hover lights a lane (as in the preview); leaving resumes the cycle unless a lane was picked.
  let lanePicked = false;
  lanes.forEach((l) => l.addEventListener("mouseenter", () => { clearInterval(laneTimer); lightLane(l.dataset.k); }));
  lanesEl.addEventListener("mouseleave", () => { if (!lanePicked) cycle(); });
  lightLane("tutor"); cycle();

  // ---------- the crew: one panel, one agent at a time ----------
  const ORDER = ["lead", ...SUBS];
  const stopOf = (k) => STOPS.find((s) => s.who === k);
  const crewPhone = makePhone($('[data-phone="crew"]'));
  const pick = $("#agent-pick"), panelEl = $("#agent-panel"), dots = $("#dots");
  ORDER.forEach((k, j) => {
    if (j === 1) pick.append(h("span", { class: "apk-sep", "aria-hidden": "true" }));
    pick.append(h("button", { class: "apk", role: "tab", style: `--c:${CREW[k].color}`, "data-k": k, onclick: () => show(j, true), html: `${charSvg(k, 36)}<span>${CREW[k].name}<small>${k === "lead" ? "crew lead" : "sub-agent"}</small></span>` }));
    dots.append(h("i"));
  });
  let agentIdx = 2, crewSeen = false;
  function show(n, user) {
    agentIdx = (n + ORDER.length) % ORDER.length;
    const k = ORDER[agentIdx], s = stopOf(k), c = CREW[k].color;
    $$(".apk", pick).forEach((b, j) => b.setAttribute("aria-selected", j === agentIdx));
    $$("i", dots).forEach((d, j) => d.classList.toggle("on", j === agentIdx));
    if (SUBS.includes(k)) { clearInterval(laneTimer); lightLane(k); } else if (user) { clearInterval(laneTimer); litLane = null; lanes.forEach((l) => l.classList.remove("on")); paintWires(null); }
    const items = s.features.map(([play, label, sub, tag]) => {
      const b = h("button", { class: `fitem${tag ? " lead-feat" : ""}`, style: `--c:${c}`, "aria-pressed": "false", html: `<span class="play"><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1l7 4-7 4z" fill="currentColor"/></svg></span><span>${label}${tag ? `<span class="ftag">${tag}</span>` : ""}<small>${sub}</small></span>` });
      b.addEventListener("click", () => { $$(".fitem", panelEl).forEach((x) => x.setAttribute("aria-pressed", x === b)); crewPhone.play(play); });
      return b;
    });
    const extra = k === "lead" ? h("div", { class: "contact", html: `<img src="/assets/avatar-chill.png" alt="Syl's contact photo"><span><b>Its own contact card</b><small>A face per vibe, so its texts show up with a name and photo.</small></span>` }) : null;
    panelEl.replaceChildren(...[
      h("h3", { class: "panel-h", html: `${charSvg(k, 44)}<span>${k === "lead" ? "Syl, the crew lead" : CREW[k].name}</span>` }),
      h("p", { class: "panel-b" }, s.blurb),
      h("div", { class: "flist" }, items), extra,
      h("p", { class: "wontline", html: `<b>${CREW[k].name} won't:</b> ` }, s.wont.join(" · "))].filter(Boolean));
    items[0].setAttribute("aria-pressed", "true");
    if (user || crewSeen) crewPhone.play(s.features[0][0]);
  }
  $("#crew-prev").addEventListener("click", () => show(agentIdx - 1, true));
  $("#crew-next").addEventListener("click", () => show(agentIdx + 1, true));
  const toPanel = () => { const target = matchMedia("(max-width: 980px)").matches ? panelEl : pick; target.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" }); };
  lanes.forEach((l) => l.addEventListener("click", () => { lanePicked = true; show(ORDER.indexOf(l.dataset.k), true); toPanel(); }));
  const lead = $(".route-lead"); lead.setAttribute("role", "button"); lead.tabIndex = 0;
  const pickLead = () => { show(0, true); toPanel(); };
  lead.addEventListener("click", pickLead); lead.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickLead(); } });
  pick.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") show(agentIdx + 1, true); if (e.key === "ArrowLeft") show(agentIdx - 1, true); });
  show(2, false);
  // The phone starts playing once the section is on screen, so it's alive when you arrive.
  new IntersectionObserver((es, ob) => { if (es.some((e) => e.isIntersecting)) { crewSeen = true; crewPhone.play(stopOf(ORDER[agentIdx]).features[0][0]); ob.disconnect(); } }, { rootMargin: "0px 0px -35% 0px" }).observe($("#agent-pick"));

  // ---------- the seat command: types once when it scrolls into view ----------
  const termBody = $("#term-body");
  const TERM = [["dim", "~/hackprinceton-2026"], ["cmd", "npm run seat -- +1 609 555 0123"], ["", ""], ["", "Seat added for +1 (609) 555-0123."], ["ok", "  Tell them to text:  +1 (628) 555-0199"]];
  async function typeTerm() {
    for (const [k, text] of TERM) {
      const row = h("div"); termBody.append(row);
      if (k === "cmd") {
        row.innerHTML = `<span class="p">$</span> <span class="t"></span><span class="caret"></span>`;
        const t = $(".t", row);
        if (still) t.textContent = text; else for (const ch of text) { t.textContent += ch; await sleep(38); }
        await sleep(300); $(".caret", row).remove();
      } else { row.className = k; row.textContent = text || " "; await sleep(150); }
    }
    termBody.append(h("div", { html: `<span class="p">$</span> <span class="caret"></span>` }));
  }
  let typed = false;
  new IntersectionObserver((es) => { if (es[0].isIntersecting && !typed) { typed = true; typeTerm(); } }, { threshold: 0.6 }).observe($("#term"));
  $$(".copy").forEach((b) => b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "Copied"; } catch { b.textContent = "Select it"; } setTimeout(() => (b.textContent = "Copy"), 1400); }));

  // ---------- why this topic: the agent's real decision rules, ported line for line ----------
  // priority(): packages/core/src/logic.ts · onMasteryChange(): apps/agent/src/engine/planner.ts (WEAK = 0.5, slot from
  // tomorrow to the day before the exam) · candidates() + nudgeText(): packages/core/src/nudger.ts, apps/agent/src/engine/nudger.ts
  const sw = $("#s-w"), sm = $("#s-m"), sd = $("#s-d");
  const fill = (el) => el.style.setProperty("--fill", `${((el.value - el.min) / (el.max - el.min)) * 100}%`);
  const priority = (w, m, d) => w * (1 - m) * (1 / Math.max(1, d));
  const windowDays = (w) => (w >= 0.25 ? 7 : w >= 0.1 ? 4 : w >= 0.05 ? 2 : 1);
  const dueIn = (d) => (d <= 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`);
  const pctOf = (x) => `${Math.round(x * 100)}%`;
  const CH4 = 0.72; // the comparison topic on the same exam
  const dec = (id, who, rule, ok, verdict, text) => {
    const el = $(id);
    el.className = `dec ${ok ? "on" : "off"}`;
    el.style.setProperty("--c", CREW[who].color);
    el.innerHTML = `<div class="dec-head">${charSvg(who, 40)}<div><b>${CREW[who].name}</b><small></small></div><span class="dec-v"></span></div>`;
    $("small", el).textContent = rule; $(".dec-v", el).textContent = verdict;
    if (text) el.append(who === "tutor" ? h("p", { class: "dec-note" }, text) : h("div", { class: "b out sample" }, text));
  };
  function sim() {
    const w = sw.value / 100, m = sm.value / 100, d = +sd.value;
    [sw, sm, sd].forEach(fill);
    $("#v-w").textContent = `${sw.value}%`; $("#v-m").textContent = `${sm.value}%`; $("#v-d").textContent = d === 0 ? "today" : d;

    // Tutor: every topic ranked by priority; the highest gets the next question.
    const p5 = priority(w, m, d), p4 = priority(w, CH4, d);
    const next = p5 >= p4 ? "Ch. 5" : "Ch. 4";
    dec("#dec-tutor", "tutor", "Ranks topics by weight × (1 − mastery) × 1/days. Highest score gets the next question.", true,
      `Next question: ${next}`, `Ch. 5 scores ${p5.toFixed(3)} · Ch. 4 scores ${p4.toFixed(3)}`);

    // Planner: proposes only below 50% mastery, with a free 30-minute slot between tomorrow and the day before the exam.
    const weak = m < 0.5, slot = d >= 2;
    const day = d === 2 ? "Monday, Nov 16" : "Tuesday, Nov 17";
    dec("#dec-planner", "planner", "After an answer: proposes if mastery is under 50% and there's a free slot before the exam.", weak && slot,
      weak && slot ? "Would propose" : weak ? "Quiet: no day left before the exam" : "Quiet: Ch. 5 is at 50% or more",
      weak && slot ? `Exam 2 is ${pctOf(w)} and chapter 5 is your weak spot. Want me to add 30 minutes of review on ${day}? Reply YES or NO.` : null);

    // Nudger: watches an exam inside its window (by weight), then picks the kind of nudge.
    const win = windowDays(w), inWin = d <= win && w >= 0.01;
    const head = `Exam 2 is due ${dueIn(d)} (${pctOf(w)} of your grade)`;
    let verdict, text = null;
    if (!inWin) verdict = `Quiet: Exam 2 is outside its ${win}-day window`;
    else if (m < 0.6) { verdict = "Would offer a round"; text = `${head}, and you're at ${pctOf(m)} on Ch. 5: Rates. Want a quick 3-question round on it? Reply YES or NO.`; }
    else if (d >= 2) { verdict = "Would offer a round"; text = `${head}. Want a quick 3-question round to stay ahead? Reply YES or NO.`; }
    else { verdict = "Would send a heads-up"; text = `Heads up: ${head}.`; }
    dec("#dec-nudger", "nudger", `Watches an exam ${win} day${win === 1 ? "" : "s"} out at this weight (7 for 25%+, 4 for 10%+, 2 for 5%+, else 1). Under 60% mastery it offers a round.`, inWin, verdict, text);
  }
  [sw, sm, sd].forEach((el) => el.addEventListener("input", sim));
  const answer = (right) => {
    const m = sm.value / 100, next = right ? m + (1 - m) * 0.3 : m * 0.7; // updateMastery()
    sm.value = Math.round(next * 100); sim();
    $$(".dec").forEach((el) => { el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); });
  };
  $("#ans-right").addEventListener("click", () => answer(true));
  $("#ans-wrong").addEventListener("click", () => answer(false));
  sim();

  // ---------- personal, interactive, accessible ----------
  $("#pia").append(...PIA.map((p) => h("article", { class: `pia-card${p.call ? " is-call" : ""}`, style: `--c:var(--${p.c})` },
    h("h3", { html: `<span>${p.kicker}</span>${p.word}` }),
    h("ul", {}, p.items.map((t) => h("li", { html: t }))),
    p.call ? h("a", { class: "btn small jump", href: "#call" }, "Hear how the call goes ↓") : null,
    h("p", { class: "src" }, p.src))));

  // ---------- the call: replay, then the mastery math (ported from packages/core/src/drills.ts) ----------
  const tmsgs = $("#tmsgs"), live = $("#live"), timer = $("#timer"), cphone = $("#cphone"), playBtn = $("#play-call");
  let callRun = 0, callTick;
  const cwait = (ms, r) => new Promise((ok, no) => setTimeout(() => (r === callRun ? ok() : no()), still ? 0 : ms));
  const cbubble = (who, t) => {
    if (t === "card:drill") { const el = h("div", { class: "att", html: `<div class="att-art">${miniArt.ring}</div><div class="cap"><b>Voice drill · Ch. 5: Rates</b><small>2 of 3 key points</small><span class="url">syllabus-crew-cards.vercel.app</span></div>` }); tmsgs.append(el); return; }
    tmsgs.append(h("div", { class: `bb ${who}` }, t));
  };
  const screen = (id) => { $("#s-thread").hidden = id !== "s-thread"; $("#s-call").hidden = id !== "s-call"; };
  const callReset = () => { clearInterval(callTick); tmsgs.innerHTML = ""; live.innerHTML = ""; timer.textContent = "calling…"; cphone.classList.remove("ringing"); screen("s-thread"); };
  async function playCall() {
    const r = ++callRun; callReset(); playBtn.textContent = "Replay";
    try {
      for (const [w, t] of CALL.thread) { await cwait(w === "me" ? 900 : 700, r); cbubble(w, t); }
      await cwait(1300, r); screen("s-call"); cphone.classList.add("ringing");
      await cwait(1800, r); cphone.classList.remove("ringing");
      let sec = 0; timer.textContent = "0:00";
      if (!still) callTick = setInterval(() => { sec += 9; timer.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; }, 300);
      for (const [w, t] of CALL.talk) {
        await cwait(w === "stu" ? 1300 : 900, r);
        live.append(h("div", { class: `line ${w}` }, h("i", {}, w === "agent" ? CALL.name : "You"), t));
        while (live.children.length > 4) live.firstChild.remove();
      }
      await cwait(1500, r); clearInterval(callTick); timer.textContent = "2:41 · ended";
      await cwait(1000, r); screen("s-thread");
      await cwait(500, r); cbubble("them", CALL.feedback);
      await cwait(700, r); cbubble("them", "card:drill");
    } catch { /* a newer run took over */ }
  }
  playBtn.addEventListener("click", playCall);
  CALL.thread.forEach(([w, t]) => cbubble(w, t)); // a still frame until Play
  $("#call-rules").append(...CALL.rules.map((t) => h("span", {}, t)));

  const drillMastery = (m, score) => { const v = Math.max(0, Math.min(1, score)); return Math.round((m + (v >= m ? 0.45 : 0.3) * (v - m)) * 1000) / 1000; };
  const seg = $("#seg"), pct = (v) => `${Math.round(v * 100)}%`;
  [0, 1, 2, 3].forEach((k) => seg.append(h("button", { "aria-pressed": "false", "data-k": k }, `${k} of 3`)));
  function setPoints(k) {
    $$("button", seg).forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.k === k)));
    const after = drillMastery(CALL.before, k / 3), missed = CALL.points.slice(k);
    $("#m-was").style.width = pct(CALL.before); $("#m-now").style.width = pct(after); $("#m-after").textContent = pct(after);
    $("#m-recap").textContent = `Voice drill, 2:41. ${CALL.says[k]} ${CALL.topic}: ${pct(CALL.before)} → ${pct(after)}.` + (missed.length ? `\n\nThe answer: ${missed.join(". ")}.` : "");
  }
  seg.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setPoints(+b.dataset.k); });
  setPoints(2);

  // ---------- cards (example data) ----------
  const donut = (segs) => { let off = 25; return `<svg class="viz" viewBox="0 0 42 42" style="max-width:150px;margin:0 auto">${segs.map(([v, c]) => { const s = `<circle cx="21" cy="21" r="15.9" fill="none" stroke="${c}" stroke-width="6" stroke-dasharray="${v} ${100 - v}" stroke-dashoffset="${off}"/>`; off -= v; return s; }).join("")}<text x="21" y="22.5" text-anchor="middle" font-family="Fraunces, serif" font-size="7" fill="#1e2740">70%</text><text x="21" y="27.5" text-anchor="middle" font-size="2.6" fill="#5d6377">still ahead</text></svg>`; };
  const ring = (v, c, label) => `<svg class="viz" viewBox="0 0 42 42" style="max-width:150px;margin:0 auto"><circle cx="21" cy="21" r="15.9" fill="none" stroke="#ebe4d3" stroke-width="5"/><circle cx="21" cy="21" r="15.9" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${v} ${100 - v}" stroke-dashoffset="25"/><text x="21" y="23.5" text-anchor="middle" font-family="Fraunces, serif" font-size="8" fill="#1e2740">${label}</text></svg>`;
  const cards = [
    ["Semester", "lead", "Your grade, as a donut", donut([[15, "#d9d1bf"], [25, "#c2412d"], [20, "#1e2740"], [30, "#6d7fb3"]]), "Done work in sand, the biggest thing ahead in red, every date and weight from your syllabus."],
    ["Week", "planner", "The block, in your real week", (() => {
      // [day, top%, height%, label, mine?]: example classes, and the proposed block in Planner's color
      const evs = [["M", 12, 22, "Econ"], ["M", 58, 20, "Lab"], ["T", 8, 22, "Econ"], ["T", 50, 26, "Ch. 5", 1], ["W", 12, 22, "Econ"], ["W", 62, 22, "Shift"], ["Th", 30, 22, "Club"], ["F", 12, 22, "Econ"]];
      const days = ["M", "T", "W", "Th", "F"];
      return `<div class="wkx">${days.map((d) => `<b>${d}</b>`).join("")}${days.map((d) => `<div class="col">${evs.filter((e) => e[0] === d).map(([, t, hh, l, me]) => `<span class="ev${me ? " me" : ""}" style="top:${t}%;height:${hh}%">${l}</span>`).join("")}</div>`).join("")}</div>`;
    })(), "Proposed or booked, beside your real week. Booked ones open in Google Calendar."],
    ["Round", "tutor", "4 of 5 on the first try", ring(80, "#2f7a5b", "4/5"), "Every miss explained, and how each topic's mastery moved."],
    ["Drill", "tutor", "What you said out loud", `<div class="ticks"><span class="hit">Borrowing costs more</span><span class="hit">Projects get dropped</span><span class="miss">Investment falls</span></div>`, "Key points you hit and missed on the call, plus the full answer."],
  ];
  const LINK_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>`;
  $("#card-grid").append(...cards.map(([k, who, title, viz, sub], i) => h("article", { class: "cardx", style: `--c:${CREW[who].color}` },
    h("span", { class: "when" }, LINKS[i].when),
    h("div", { class: "when-line" }, LINKS[i].line),
    h("span", { class: "link-chip", html: `${LINK_ICON}<span>syllabus-crew-cards.vercel.app</span>` }),
    h("h3", {}, `${k} card: ${title.charAt(0).toLowerCase()}${title.slice(1)}`), h("div", { html: viz }), h("p", {}, sub),
    h("p", { class: "after" }, LINKS[i].after))));

  // ---------- trust ----------
  $("#rules").append(...RULES.map(([b, s]) => h("div", { class: "rule" }, h("b", {}, b), h("span", {}, s))));
  const clock = $("#clock");
  function tick() {
    const v = +clock.value, hr = Math.floor(v / 2), min = v % 2 ? "30" : "00";
    const label = `${((hr + 11) % 12) + 1}:${min} ${hr < 12 ? "AM" : "PM"}`;
    fill(clock);
    $("#clock-time").textContent = label;
    const t = hr + (v % 2) / 2;
    let say;
    if (t >= 23 || t < 8) say = "Quiet hours. Syl never starts a conversation now. If you text it, it still answers.";
    else if (t < 9 || t >= 20) say = "Syl can text you, but nudges wait: they only go out from 9 AM to 8 PM. A reminder you asked for still arrives.";
    else say = "Nudges allowed: at most 3 a day, 4 hours apart, never in the middle of a conversation, and it backs off after 2 you ignore.";
    $("#clock-say").textContent = say;
  }
  clock.addEventListener("input", tick); tick();

  // ---------- video and interviews (hidden until content.js has them) ----------
  if (SITE.videoUrl) {
    const u = SITE.videoUrl, yt = u.match(/(?:youtu\.be\/|v=|shorts\/)([\w-]{11})/);
    $("#video-frame").innerHTML = yt ? `<iframe src="https://www.youtube-nocookie.com/embed/${yt[1]}" title="Syllabus Crew demo" allow="encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>` : `<video src="${u}" controls preload="metadata" playsinline></video>`;
    $("#video").hidden = false;
  }
  if (SITE.interviews.length) {
    const box = $("#interviews");
    box.append(h("div", { class: "quotes" }, SITE.interviews.map((q) => h("figure", {}, h("blockquote", {}, `“${q.quote}”`), h("figcaption", {}, q.who)))));
    box.hidden = false;
  }

  // ---------- behind the gates ----------
  const flow = $("#flow");
  flow.append(
    h("div", { class: "node you" }, FLOW.you), h("div", { class: "vline" }),
    h("div", { class: "node" }, h("span", {}, FLOW.channel[0], h("small", {}, FLOW.channel[1]))), h("div", { class: "vline" }),
    h("div", { class: "node lead", html: `${charSvg("lead", 40)}<span>${FLOW.lead[0]}<small>${FLOW.lead[1]}</small></span>` }),
    h("div", { class: "crew-row" }, FLOW.crew.map(([k, n, s]) => h("div", { class: "node", html: `${charSvg(k, 48)}<span>${n}<small>${s}</small></span>` }))),
    h("div", { class: "out-row" }, FLOW.out.map(([n, s]) => h("div", { class: "node" }, n, h("small", {}, s)))),
  );

  // ---------- photon ----------
  $("#tried").append(...TRIED.map(([what, no, yes]) => h("div", { class: "tried-row" }, h("b", {}, what), h("span", { class: "no" }, no), h("span", { class: "yes" }, yes))));

  // ---------- tracks ----------
  const tabs = $("#track-tabs"), pane = $("#track-pane");
  const showTrack = (name) => {
    $$("button", tabs).forEach((b) => b.setAttribute("aria-selected", b.textContent === name));
    pane.replaceChildren(h("ul", {}, TRACKS[name].map((x) => Array.isArray(x) ? h("li", {}, x[0] ? h("b", { class: "lead-in" }, `${x[0]}: `) : null, x[1]) : h("li", {}, x))));
    pane.style.animation = "none"; void pane.offsetWidth; pane.style.animation = "";
  };
  Object.keys(TRACKS).forEach((name) => tabs.append(h("button", { role: "tab", onclick: () => showTrack(name) }, name)));
  showTrack(Object.keys(TRACKS)[0]);

  // ---------- originals, stack, next ----------
  // The comparison: Syl's column leads; each cell says yes or no in words, never a glyph.
  const vs = $("#vs");
  vs.append(h("div", { class: "vs-row vs-head", role: "row" }, h("span", { role: "columnheader" }), COMPARE.cols.map(([n, sub], i) =>
    h("span", { class: `vs-col${i === 0 ? " syl" : ""}`, role: "columnheader", html: `${i === 0 ? charSvg("lead", 30) : ""}<span><b></b><small></small></span>` }))));
  $$(".vs-head .vs-col", vs).forEach((el, i) => { $("b", el).textContent = COMPARE.cols[i][0]; $("small", el).textContent = COMPARE.cols[i][1]; });
  COMPARE.rows.forEach(([label, ...cells]) => vs.append(h("div", { class: "vs-row", role: "row" },
    h("span", { class: "vs-label", role: "rowheader" }, label),
    cells.map(([text, ok], i) => h("span", { class: `vs-cell${i === 0 ? " syl" : ""}${ok ? " yes" : " no"}`, role: "cell" }, h("i", { "aria-hidden": "true" }), h("span", {}, text))))));
  $("#vs-note").textContent = COMPARE.note;
  $("#originals").append(...ORIGINALS.map(([t, s]) => h("li", {}, h("b", {}, t), h("span", {}, s))));

  // The moving strip: each row is drawn twice so the loop is seamless; hover pauses it.
  const chip = ([name, mark, color]) => {
    const badge = CREW[mark] ? `<span class="mq-badge mq-char">${charSvg(mark, 26)}</span>` : `<span class="mq-badge" style="background:${color}">${mark}</span>`;
    return h("span", { class: "mq-chip", html: `${badge}<span></span>` }, name);
  };
  [["#marquee-a", MARQUEE[0]], ["#marquee-b", MARQUEE[1]]].forEach(([sel, row]) => {
    const track = $(sel);
    const set = () => h("div", { class: "mq-set" }, row.map(chip));
    track.append(set(), h("div", { class: "mq-set", "aria-hidden": "true" }, row.map(chip)));
  });
  $("#stats").append(...STATS.map(([n, s]) => h("span", {}, h("b", {}, n), ` ${s}`)));

  // Who built it: a small polaroid; the whole card opens LinkedIn.
  const IN = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.75h4v11H3zM9.5 9.75h3.8v1.5h.06c.53-1 1.83-2.06 3.77-2.06 4.03 0 4.77 2.65 4.77 6.1v5.46h-4v-4.84c0-1.16-.02-2.64-1.61-2.64-1.61 0-1.86 1.26-1.86 2.56v4.92h-4z"/></svg>`;
  const initials = BUILDER.name.split(" ").map((w) => w[0]).join("");
  $("#builder").append(
    h("p", { class: "builder-k" }, "Built by"),
    h("a", { class: "polaroid", href: BUILDER.linkedin, target: "_blank", rel: "noopener", "aria-label": `${BUILDER.name} on LinkedIn` },
      BUILDER.photo
        ? h("span", { class: "polaroid-pic photo" }, h("img", { src: BUILDER.photo, alt: `${BUILDER.name}, at the desk where Syllabus Crew was built`, width: "900", height: "1200", loading: "lazy" }))
        : h("span", { class: "polaroid-pic", html: `<span class="initials">${initials}</span>${charSvg("lead", 44)}` }),
      h("b", {}, BUILDER.name), h("small", {}, BUILDER.role),
      h("span", { class: "polaroid-in", html: `${IN}<span>LinkedIn</span>` })));
  const cats = ["All", ...new Set(SERVICES.map((s) => s[0]))];
  const services = $("#services"), filters = $("#stack-filters");
  const showCat = (cat) => {
    $$("button", filters).forEach((b) => b.setAttribute("aria-pressed", b.textContent === cat));
    services.replaceChildren(...SERVICES.filter((s) => cat === "All" || s[0] === cat).map(([c, n, r], i) => h("li", { style: `animation-delay:${i * 25}ms` }, h("span", { class: "cat" }, c), h("b", {}, n), h("span", {}, r))));
  };
  cats.forEach((c) => filters.append(h("button", { onclick: () => showCat(c) }, c)));
  showCat("All");
  $("#stack-count").textContent = `${SERVICES.length} pieces. Everything outside the crew engine is a service we call; everything inside it is ours, and tested.`;
  $("#next").append(...NEXT.map(([b, s]) => h("li", {}, h("b", {}, b), h("span", {}, s))));

  // ---------- the top bar: pinned after the campus, and it follows the section you're in ----------
  {
    const bar = $(".top");
    if ($("#video").hidden) $$('a[href="#video"]', bar).forEach((a) => { a.hidden = true; }); // no demo link until there's a video
    const pinned = bar.cloneNode(true);
    pinned.classList.add("float");
    pinned.setAttribute("aria-label", "Sections");
    document.body.prepend(pinned);
    // It slides in once the campus is mostly scrolled away, so there's never two bars on screen.
    const hero = $("#top");
    let ticking = false;
    const place = () => { ticking = false; pinned.classList.toggle("show", hero.getBoundingClientRect().bottom < 140); };
    addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(place); } }, { passive: true });
    place();
    // Which link each part of the page belongs to.
    const GROUP = { crew: "crew", education: "call", call: "call", different: "different", "why-topic": "different", cards: "cards", trust: "cards",
      video: "video", gates: "gates", photon: "gates", stack: "gates", tracks: "tracks", "whats-next": "tracks" };
    const light = (key) => $$(".top-links > a:not(.btn):not(.gh)").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === `#${key}`));
    const spy = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) light(GROUP[e.target.id] ?? ""); }, { rootMargin: "-45% 0px -50% 0px" });
    $$("section[id]").forEach((s) => spy.observe(s));
    spy.observe($("#top"));
  }
})();
