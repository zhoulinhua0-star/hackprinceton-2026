// Preview-only behavior for the options page. Reuses content.js (STOPS, THREADS, CREW) so every option plays real threads.
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
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, still ? 0 : ms));
  const INK = "#1e2740";
  const face = (y) => `<g class="eyes"><circle cx="48" cy="${y}" r="5" fill="${INK}"/><circle cx="72" cy="${y}" r="5" fill="${INK}"/><circle cx="49.6" cy="${y - 1.6}" r="1.5" fill="#fff"/><circle cx="73.6" cy="${y - 1.6}" r="1.5" fill="#fff"/></g><path d="M54 ${y + 11} q6 5 12 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
  function charSvg(kind, size = 96) {
    const c = CREW[kind].color, shade = `color-mix(in srgb,${c} 72%,#000)`, lite = `color-mix(in srgb,${c} 45%,#fff)`;
    const body = {
      lead: `<path fill="${c}" d="M40 14h40a26 26 0 0 1 26 26v20a26 26 0 0 1-26 26H60l-20 20 3-20.2A26 26 0 0 1 14 60V40a26 26 0 0 1 26-26z"/>${face(46)}`,
      scout: `<rect x="16" y="34" width="88" height="70" rx="32" fill="${c}"/><circle cx="42" cy="56" r="17" fill="#fff"/><circle cx="78" cy="56" r="17" fill="#fff"/><rect x="54" y="52" width="12" height="8" fill="${shade}"/><g class="eyes"><circle cx="44" cy="57" r="7" fill="${INK}"/><circle cx="80" cy="57" r="7" fill="${INK}"/></g><path d="M54 88 q6 5 12 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
      tutor: `<path fill="${c}" d="M30 22h46l26 26v40a12 12 0 0 1-12 12H30a12 12 0 0 1-12-12V34a12 12 0 0 1 12-12z"/><path fill="${lite}" d="M76 22l26 26H84a8 8 0 0 1-8-8z"/>${face(64)}`,
      planner: `<rect x="16" y="26" width="88" height="78" rx="16" fill="${c}"/><path fill="${shade}" d="M18 44h84v6H18z" opacity=".55"/><rect x="38" y="14" width="9" height="22" rx="4.5" fill="${lite}"/><rect x="73" y="14" width="9" height="22" rx="4.5" fill="${lite}"/>${face(70)}`,
      nudger: `<circle cx="60" cy="98" r="10" fill="${shade}"/><path fill="${c}" d="M60 14c-21 0-34 15-34 37v17L14 88a4 4 0 0 0 3.4 6h85.2a4 4 0 0 0 3.4-6L94 68V51c0-22-13-37-34-37z"/>${face(56)}`,
    }[kind];
    return `<svg class="char" viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;
  }
  const GH = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z"/></svg>`;
  $$("[data-char]").forEach((el) => { el.outerHTML = charSvg(el.dataset.char, +el.dataset.size || 96); });
  $$("[data-gh]").forEach((el) => { el.outerHTML = GH; });

  // ---------- a phone that plays THREADS ----------
  const CARD = { semester: ["ECON 201 · your semester", "70% still ahead"], week: ["Ch. 5 review · Tue", "Proposed · reply YES"], booked: ["Ch. 5 review · booked", "Open in Google Calendar"], round: ["Round recap · 4 of 5", "Ch. 5 is up to 52%"], drill: ["Voice drill · Ch. 5", "2 of 3 key points"] };
  function makePhone(host) {
    const msgs = h("div", { class: "msgs" });
    host.replaceChildren(h("div", { class: "phone" }, h("div", { class: "phone-head", html: `${charSvg("lead", 40)}<span><b>Syl</b> · iMessage</span>` }), msgs));
    let run = 0;
    const bubble = (who, text) => {
      if (who === "note") return h("div", { class: "note" }, text);
      if (text.startsWith("file:")) return h("div", { class: "b in" }, text.slice(5));
      if (text.startsWith("vcard:")) return h("div", { class: "vcard", html: `<img src="/assets/avatar-chill.png" alt=""><span><b>${text.slice(6)}</b>Contact card · tap to save</span>` });
      if (text.startsWith("call:")) return h("div", { class: "callpill" }, text.slice(5));
      if (text.startsWith("card:")) { const [t, s] = CARD[text.slice(5)]; return h("div", { class: "att" }, h("div", { class: "cap" }, h("b", {}, t), h("small", {}, s))); }
      return h("div", { class: `b ${who === "me" ? "in" : "out"}` }, text);
    };
    return { async play(name) {
      const id = ++run; msgs.innerHTML = ""; let last = null;
      for (const [who, text] of THREADS[name]) {
        if (id !== run) return;
        if (who !== "me" && who !== "note") {
          if (last !== who) msgs.append(h("div", { class: "who", html: `<i style="background:${CREW[who].color}"></i>${CREW[who].name}` }));
          const t = h("div", { class: "typing", html: "<span></span><span></span><span></span>" }); msgs.append(t); msgs.scrollTop = 1e6; await sleep(520); t.remove();
          if (id !== run) return;
        } else await sleep(420);
        msgs.append(bubble(who, text)); msgs.scrollTop = 1e6; if (who !== "note") last = who; await sleep(320);
      }
      msgs.append(h("div", { class: "ex" }, "Example conversation, in Syl's real wording")); msgs.scrollTop = 1e6;
    } };
  }

  // ---------- A1: the terminal types once when it scrolls into view ----------
  const body = $("#term1-body");
  const lines = [["dim", "~/hackprinceton-2026"], ["cmd", "npm run seat -- +1 609 555 0123"], ["", ""], ["", "Seat added for +1 (609) 555-0123."], ["ok", "  Tell them to text:  +1 (628) 555-0199"]];
  async function typeTerm() {
    body.innerHTML = "";
    for (const [k, text] of lines) {
      const row = h("div");
      body.append(row);
      if (k === "cmd") {
        row.innerHTML = `<span class="p">$</span> <span class="t"></span><span class="caret"></span>`;
        const t = $(".t", row);
        for (const ch of text) { t.textContent += ch; await sleep(38); }
        await sleep(350); $(".caret", row).remove();
      } else { row.className = k; row.textContent = text || " "; await sleep(160); }
    }
    body.append(h("div", { html: `<span class="p">$</span> <span class="caret"></span>` }));
  }
  let typed = false;
  new IntersectionObserver((es) => { if (es[0].isIntersecting && !typed) { typed = true; typeTerm(); } }, { threshold: .6 }).observe($("#term1"));
  $$(".copy").forEach((b) => b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b.dataset.copy); } catch {} b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1400); }));

  // ---------- B1: routing lanes ----------
  const SUBS = ["scout", "tutor", "planner", "nudger"];
  const ROUTE = {
    scout: ["Scout", "reads new slides and deadlines", "Prof. Lee posted Week 6 slides.", "new slides posted"],
    tutor: ["Tutor", "questions, hints, mastery, voice drills", "Question 1 of 5 · Ch. 5…", "quiz me on chapter 5"],
    planner: ["Planner", "proposes study time; only YES books it", "Want me to add 30 minutes…?", "book me a study block"],
    nudger: ["Nudger", "reminders, and when to stay quiet", "Got it. I'll remind you Sunday…", "remind me sunday"],
  };
  function buildLanes(host, svg, inEl, onPick) {
    const lanes = SUBS.map((k) => {
      const [n, sub, say] = ROUTE[k];
      const b = h("button", { class: "lane", style: `--c:${CREW[k].color}`, "data-k": k, html: `${charSvg(k, 40)}<span><b>${n}</b><small>${sub}</small></span><span class="say">“${say}”</span>` });
      host.append(b); return b;
    });
    const draw = () => {
      const r0 = host.getBoundingClientRect();
      svg.setAttribute("viewBox", `0 0 64 ${r0.height}`);
      svg.innerHTML = lanes.map((l) => { const r = l.getBoundingClientRect(), y = r.top - r0.top + r.height / 2; return `<path class="wire" data-k="${l.dataset.k}" d="M0 ${r0.height / 2} C 34 ${r0.height / 2}, 30 ${y}, 64 ${y}" style="stroke:${CREW[l.dataset.k].color}33"/>`; }).join("");
    };
    draw(); addEventListener("resize", draw); setTimeout(draw, 600);
    let auto = 1, timer = null;
    const light = (k) => {
      lanes.forEach((l) => l.classList.toggle("on", l.dataset.k === k));
      $$(".wire", svg).forEach((w) => { const on = w.dataset.k === k; w.classList.toggle("on", on); w.style.stroke = on ? CREW[w.dataset.k].color : `${CREW[w.dataset.k].color}33`; });
      if (inEl) inEl.textContent = ROUTE[k][3];
      onPick?.(k);
    };
    const start = () => { clearInterval(timer); timer = setInterval(() => { auto = (auto + 1) % 4; light(SUBS[auto]); }, 2200); };
    lanes.forEach((l) => {
      l.addEventListener("mouseenter", () => { if (!onPick) { clearInterval(timer); light(l.dataset.k); } });
      l.addEventListener("click", () => { clearInterval(timer); timer = null; light(l.dataset.k); });
    });
    if (!onPick) host.addEventListener("mouseleave", () => { if (timer !== null) start(); });
    light("tutor"); if (!onPick) start();
    return light;
  }
  buildLanes($("#b1-lanes"), $("#b1-svg"), $("#b1-in"));

  // ---------- B2: file tree ----------
  const tree = $("#b2");
  const TREE = [
    ["lead", "", "syl", "the crew lead · routes every text", "crew.ts"],
    ["scout", "├── ", "scout", "reads slides & deadlines", "scout.ts"],
    ["tutor", "├── ", "tutor", "questions, hints, mastery, drills", "tutor.ts"],
    ["planner", "├── ", "planner", "proposals only; YES books", "planner.ts"],
    ["nudger", "└── ", "nudger", "whether, which, when", "nudger.ts"],
  ];
  const stopOf = (k) => STOPS.find((s) => s.who === k);
  TREE.forEach(([k, gl, nm, sub, file]) => {
    const row = h("button", { class: "t-row", style: `--c:${CREW[k].color}`, html: `<span class="gl">${gl}</span>${charSvg(k, 30)}<span class="nm" style="color:${k === "lead" ? "inherit" : `color-mix(in srgb, ${CREW[k].color} 80%, #000)`}">${nm}/<small>${sub}</small></span><span class="k">${file}</span>` });
    row.addEventListener("click", () => {
      const open = row.nextElementSibling?.classList.contains("t-open");
      $$(".t-open", tree).forEach((x) => x.remove()); $$(".t-row", tree).forEach((x) => x.classList.remove("on"));
      if (open) return;
      row.classList.add("on");
      const s = stopOf(k);
      row.after(h("div", { class: "t-open", style: `--c:${CREW[k].color}`, html: `<b>Does:</b> ${s.features.map((f) => f[1]).join(" · ")}<br><b>Won't:</b> ${s.wont.join(" · ")}` }));
    });
    tree.append(row);
  });

  // ---------- B3: crew card ----------
  const kids = $("#b3-kids");
  SUBS.forEach((k) => {
    const b = h("button", { class: "nest-kid", style: `--c:${CREW[k].color}`, html: `${charSvg(k, 46)}<b>${ROUTE[k][0]}</b><small>${ROUTE[k][1]}</small>` });
    b.addEventListener("click", () => { $$(".nest-kid", kids).forEach((x) => x.classList.toggle("on", x === b)); });
    kids.append(b);
  });

  // ---------- C: a panel that shows one agent ----------
  const ORDER = ["lead", "scout", "tutor", "planner", "nudger"];
  function panel(host, phone, k) {
    const s = stopOf(k), c = CREW[k].color;
    const items = s.features.map(([play, label, sub]) => {
      const b = h("button", { class: "fitem", style: `--c:${c}`, "aria-pressed": "false", html: `<span class="play"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 1l7 4-7 4z" fill="currentColor"/></svg></span><span>${label}<small>${sub}</small></span>` });
      b.addEventListener("click", () => { $$(".fitem", host).forEach((x) => x.setAttribute("aria-pressed", x === b)); phone.play(play); });
      return b;
    });
    host.replaceChildren(h("h3", { class: "panel-h", html: `${charSvg(k, 44)}<span>${k === "lead" ? "Syl, the crew lead" : CREW[k].name}</span>` }), h("p", { class: "panel-b" }, s.blurb), h("div", { class: "flist" }, items), h("p", { class: "wontline", html: `<b>${CREW[k].name} won't:</b> ${s.wont.join(" · ")}` }));
    items[0].setAttribute("aria-pressed", "true"); phone.play(s.features[0][0]);
  }

  // C1: agent buttons + stepper
  (() => {
    const root = $("#c1");
    const pick = h("div", { class: "agent-pick", role: "tablist" });
    const left = h("div"), right = h("div");
    const phone = makePhone(right);
    const dots = h("div", { class: "dots" }, ORDER.map(() => h("i")));
    let i = 2;
    const show = (n) => {
      i = (n + ORDER.length) % ORDER.length;
      $$(".apk", pick).forEach((b, j) => b.setAttribute("aria-selected", j === i));
      $$("i", dots).forEach((d, j) => d.classList.toggle("on", j === i));
      panel(left, phone, ORDER[i]);
    };
    ORDER.forEach((k, j) => {
      if (j === 1) pick.append(h("span", { class: "apk-sep" }));
      pick.append(h("button", { class: "apk", role: "tab", style: `--c:${CREW[k].color}`, onclick: () => show(j), html: `${charSvg(k, 36)}<span>${k === "lead" ? "Syl" : CREW[k].name}<small>${k === "lead" ? "crew lead" : "sub-agent"}</small></span>` }));
    });
    const step = h("div", { class: "stepper" }, h("button", { onclick: () => show(i - 1) }, "← Back"), dots, h("button", { onclick: () => show(i + 1) }, "Next →"));
    root.append(pick, h("div", { class: "panel" }, h("div", {}, left, step), right));
    show(2);
  })();

  // C2: routing lanes are the menu
  (() => {
    const root = $("#c2");
    const lanesWrap = h("div", { class: "lanes" }); const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); lanesWrap.append(svg);
    const leadBtn = h("button", { class: "route-lead", style: "cursor:pointer", html: `${charSvg("lead", 56)}<b>Syl</b><small>Crew lead. Click for its own features.</small>` });
    const top = h("div", { class: "route", style: "grid-template-columns:220px minmax(0,1fr);" }, leadBtn, lanesWrap);
    const left = h("div"), right = h("div"); const phone = makePhone(right);
    root.append(top, h("div", { class: "panel", style: "margin-top:26px" }, left, right));
    buildLanes(lanesWrap, svg, null, (k) => panel(left, phone, k));
    leadBtn.addEventListener("click", () => { $$(".lane", lanesWrap).forEach((l) => l.classList.remove("on")); $$(".wire", svg).forEach((w) => { w.classList.remove("on"); w.style.stroke = `${CREW[w.dataset.k].color}33`; }); panel(left, phone, "lead"); });
  })();

  // C3: swipe cards
  (() => {
    const row = $("#c3"); const phone = makePhone($('[data-phone="c3"]'));
    ORDER.forEach((k) => {
      const s = stopOf(k), c = CREW[k].color;
      const chips = h("div", { class: "chipz" }, s.features.map(([play, label]) => h("button", { style: `--c:${c}`, "aria-pressed": "false", onclick: (e) => {
        $$(".chipz button", row).forEach((x) => x.setAttribute("aria-pressed", x === e.currentTarget));
        $$(".scard", row).forEach((x) => x.classList.toggle("on", x.dataset.k === k));
        phone.play(play);
      } }, label)));
      row.append(h("article", { class: "scard", style: `--c:${c}`, "data-k": k }, h("h3", { html: `${charSvg(k, 38)}${k === "lead" ? "Syl" : CREW[k].name}` }), h("p", {}, s.blurb), chips, h("p", { style: "font-size:13px" }, `Won't: ${s.wont[0].toLowerCase()}.`)));
    });
    $(".chipz button", row).click();
  })();
})();
