// The agent process: Photon inbound -> Crew Lead -> Photon outbound, plus HTTP for the dashboard and hidden demo controls.
//   npm run start -w @syllabus-crew/agent
import { createServer, type IncomingMessage } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { createHash, randomBytes } from "node:crypto";
import { FakeCalendar, FakeLLM } from "@syllabus-crew/core";
import type { CalendarWriter } from "@syllabus-crew/core";
import { calendarRouter } from "./adapters/calendar-router.ts";
import { GoogleCalendar } from "./adapters/google.ts";
import { BedrockLLM } from "./adapters/bedrock.ts";
import { FileStore } from "./adapters/file-store.ts";
import { DynamoStore, makeDynamo, tableName } from "./adapters/dynamo-store.ts";
import { fetchAttachment, listen, makePhoton, PhotonMessenger } from "./adapters/photon.ts";
import { Crew, readSyllabus } from "./index.ts";
import type { Attachment } from "@syllabus-crew/core";

const env = (k: string, fallback?: string) => {
  const v = process.env[k] ?? fallback;
  if (v === undefined || v === "") throw new Error(`Missing ${k} in .env`);
  return v;
};
const log = (s: string) => console.log(`[${new Date().toISOString()}] ${s}`);

const projectId = env("PHOTON_PROJECT_ID"), apiKey = env("PHOTON_API_KEY");
const token = env("DEMO_ADMIN_TOKEN"), defaultStudent = env("DEMO_STUDENT");
const port = Number(env("AGENT_PORT", "8787"));
const tz = env("STUDENT_TIMEZONE", "America/New_York");
const demoMode = process.env.DEMO_MODE !== "false";
/** off = no scheduler; dry (default) = logs what it WOULD send, sends nothing; on = really texts. */
const schedulerMode = (process.env.SCHEDULER ?? "dry") as "off" | "dry" | "on";

/** Where student state lives: file (default, .data/state.json) or dynamo (Amazon DynamoDB; run `npm run dynamo:setup` first). */
const storeMode = process.env.STORE === "dynamo" ? "dynamo" : "file";
const store = storeMode === "dynamo"
  ? await DynamoStore.open({ db: makeDynamo(), table: tableName(), log })
  : new FileStore(new URL("../../../.data/state.json", import.meta.url).pathname);
if (store instanceof DynamoStore) log(`state: DynamoDB table ${tableName()} (${(await store.ids()).length} student(s) loaded)`);
const photon = makePhoton(apiKey);
const messenger = new PhotonMessenger(photon, projectId, store);
const llm = process.env.USE_FAKE_LLM === "true"
  ? new FakeLLM()
  : new BedrockLLM({ region: env("AWS_REGION"), defaultModel: env("BEDROCK_MODEL_DEFAULT"), strongModel: env("BEDROCK_MODEL_STRONG", process.env.BEDROCK_MODEL_DEFAULT) });
// Real Google Calendar when connected; otherwise a local stand-in (approved changes still show on the dashboard).
const google = new GoogleCalendar({
  clientId: process.env.GOOGLE_CLIENT_ID ?? "", clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  redirectUri: env("GOOGLE_REDIRECT_URI", `http://localhost:${port}/auth/google/callback`),
  tokenPath: new URL("../../../.data/google.json", import.meta.url).pathname, tz,
});
const local = new FakeCalendar();
const calendarMode = () => (google.isConnected() ? "google" : "local");
const calendar: CalendarWriter = calendarRouter({ google, local, owner: defaultStudent, log });
const oauthStates = new Map<string, number>(); // state nonce -> expiry; only issued to a request holding the demo token

const crew = new Crew({
  store, messenger, llm, calendar, clock: { now: () => new Date() }, tz,
  // Demo mode bypasses quiet hours and caps for the demo student only, never for strangers who scan the QR.
  // STAGED_PHOTO=false makes "read texted photos for real" the default; the /demo switch changes it while running.
  opts: { bypassLimits: demoMode ? [defaultStudent] : false, dashboardUrl: env("DASHBOARD_URL", "http://localhost:3000"), stagedPhoto: process.env.STAGED_PHOTO !== "false" },
});

const stop = listen({ photon, projectId, apiKey, log, onMessage: (m) => crew.onInbound(m.studentId, {
  text: m.text, hasImage: m.hasImage, route: m.route,
  file: m.attachmentId ? async () => {
    try { const a = await fetchAttachment(photon, projectId, m.attachmentId!); log(`attachment ${m.attachmentId}: ${a ? a.mediaType : "not a readable file"}`); return a; }
    catch (e) { log(`attachment download failed: ${String(e)}`); return null; }
  } : undefined,
}) });

const MEDIA = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_BODY = 25 * 1024 * 1024;
/** Reads a JSON body, refusing anything over the cap. */
async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) throw Object.assign(new Error("too large"), { status: 413 });
    chunks.push(c as Buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw Object.assign(new Error("bad json"), { status: 400 }); }
}

// ---- HTTP: dashboard state + hidden demo controls (all require the demo token) ----
const authorized = (req: IncomingMessage, url: URL) => {
  const given = Buffer.from(String(req.headers["x-demo-token"] ?? url.searchParams.get("token") ?? ""));
  const want = Buffer.from(token);
  return given.length === want.length && timingSafeEqual(given, want);
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const page = (code: number, title: string, msg: string) => { // `msg` is trusted markup built from escaped parts
    res.writeHead(code, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" });
    res.end(`<!doctype html><meta charset=utf-8><title>${esc(title)}</title><body style="font:17px/1.5 system-ui;max-width:520px;margin:12vh auto;padding:0 24px"><h2>${esc(title)}</h2><p>${msg}</p>`);
  };
  // No CORS headers: only the dashboard's own server talks to this API, never a browser page.
  const send = (code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  };
  if (req.method === "OPTIONS") return send(204, {});
  if (url.pathname === "/health") return send(200, { ok: true });

  // ---- Google sign-in. The start link needs the demo token; the callback needs the one-time state we issued. ----
  if (req.method === "GET" && url.pathname === "/auth/google") {
    if (!authorized(req, url)) return page(401, "Locked", "Open this link with your demo token.");
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return page(500, "Not configured", "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are missing in .env.");
    const state = randomBytes(18).toString("base64url");
    oauthStates.set(state, Date.now() + 10 * 60_000);
    res.writeHead(302, { location: google.authUrl(state) });
    return void res.end();
  }
  if (req.method === "GET" && url.pathname === "/auth/google/callback") {
    const state = url.searchParams.get("state") ?? "";
    const exp = oauthStates.get(state);
    oauthStates.delete(state);
    if (!exp || exp < Date.now()) return page(400, "Link expired", "Start again from the sign-in link.");
    if (url.searchParams.get("error")) return page(400, "Google sign-in cancelled", "Google reported that sign-in was cancelled or denied.");
    try {
      await google.handleCallback(url.searchParams.get("code") ?? "");
      const info = await google.calendarInfo();
      log(`google connected: calendar ${info?.summary ?? "?"}`);
      return page(200, "Google Calendar connected", `Events will be added to <b>${esc(info?.summary ?? "your calendar")}</b>${info?.timeZone ? ` (${esc(info.timeZone)})` : ""}. You can close this tab.`);
    } catch (e) {
      log(`google callback error: ${String(e)}`);
      return page(500, "Could not connect", "Google did not complete the sign-in. See the agent's log for details, then start again.");
    }
  }

  if (!authorized(req, url)) return send(401, { error: "bad token" });
  const student = url.searchParams.get("student") ?? defaultStudent;
  try {
    const route = `${req.method} ${url.pathname}`;
    if (route === "GET /api/state") return send(200, { ...((await store.load(student)) ?? { phase: null }), calendarMode: calendarMode(), tz, scheduler: schedulerMode, stagedPhoto: crew.stagedPhoto, storeMode });
    if (route === "GET /api/google/status") return send(200, { connected: google.isConnected(), calendar: google.isConnected() ? await google.calendarInfo() : null });
    if (route === "POST /api/demo/scout") { const found = await crew.runScoutNow(student); return send(200, found ? { found } : { found, why: await crew.whyNoScout(student) }); }
    if (route === "POST /api/demo/quiz") return send(200, { sent: await crew.sendQuizNow(student) });
    if (route === "POST /api/demo/week6") { await crew.switchToWeek6(student); return send(200, { ok: true }); }
    if (route === "POST /api/demo/questions") {
      const r = await crew.startQuestions(student, { announce: true }, (d) => log(`questions written: ${d.added}`));
      if (!r.started) {
        const msg = r.reason === "no real syllabus installed" ? "No real syllabus is installed for this student (it's in a demo state). Upload one on the Upload page first." : r.reason === "already writing" ? "Already writing questions. Give it a minute." : "There are enough questions for the upcoming topics already.";
        log(`questions not started: ${r.reason}`);
        return send(409, { ok: false, error: msg });
      }
      return send(202, { ok: true, started: true });
    }
    if (route === "POST /api/demo/nudge") {
      const r = await crew.tickStudent(student, { force: url.searchParams.get("force") === "1", dryRun: url.searchParams.get("dry") === "1" });
      return send(200, { ok: true, actions: r?.actions ?? [] });
    }
    if (route === "POST /api/demo/staged") { crew.setStagedPhoto(url.searchParams.get("on") !== "0"); log(`texted photos: ${crew.stagedPhoto ? "staged" : "read for real"}`); return send(200, { ok: true, stagedPhoto: crew.stagedPhoto }); }
    if (route === "POST /api/demo/hello") return send(200, await crew.startOnboarding(student));
    if (route === "POST /api/demo/reset") return send(200, { ok: true, ...(await crew.resetDemo(student)) });
    if (route === "POST /api/syllabus") {
      const body = (await readJson(req)) as { files?: { mediaType?: unknown; base64?: unknown }[] };
      const files = body?.files;
      if (!Array.isArray(files) || files.length < 1 || files.length > 12) return send(400, { ok: false, error: "send 1 to 12 files" });
      const attachments: Attachment[] = [];
      for (const f of files) {
        if (typeof f?.mediaType !== "string" || !MEDIA.has(f.mediaType) || typeof f.base64 !== "string" || !f.base64) return send(415, { ok: false, error: "only PDF, PNG, JPEG, WebP or GIF files" });
        attachments.push({ mediaType: f.mediaType as Attachment["mediaType"], base64: f.base64 });
      }
      const current = await store.load(student);
      if (!current?.openedByStudent || !current.route) return send(409, { ok: false, error: "Text the line first so the agent has a conversation to reply in." });
      const hash = createHash("sha256").update(attachments.map((a) => a.base64).join("|")).digest("hex");
      if (await crew.hasSyllabus(student, hash)) { log(`syllabus upload for ${student}: identical to the one installed, ignoring`); return send(200, { ok: true, duplicate: true }); }
      log(`syllabus upload for ${student}: ${attachments.length} file(s)`);
      const read = await readSyllabus(llm, attachments, tz);
      if (!read.ok) { log(`syllabus read failed: ${read.errors.join("; ")}`); return send(422, { ok: false, error: "I couldn't read that syllabus reliably. Try a clearer file, or send the pages as separate images." }); }
      const out = await crew.applySyllabus(student, read.parsed, hash);
      if (!out) return send(409, { ok: false, error: "Text the line first so the agent has a conversation to reply in." });
      void crew.startQuestions(student, { announce: true }, (r) => log(`questions written: ${r.added}`)).catch((e) => log(`question writer failed: ${String(e)}`));
      return send(200, { ok: true, summary: out.summary, asking: out.question });
    }
    const m = url.pathname.match(/^\/api\/proposals\/([\w-]+)\/(approve|decline)$/);
    if (req.method === "POST" && m) { await crew.approveFromDashboard(student, m[1]!, m[2] === "approve"); return send(200, { ok: true }); }
    return send(404, { error: "not found" });
  } catch (e) {
    const status = (e as { status?: number })?.status;
    if (status === 413 || status === 400) return send(status, { ok: false, error: status === 413 ? "file too large" : "bad request" });
    log(`http error: ${String(e)}`);
    return send(500, { error: "internal error" });
  }
}).listen(port, "127.0.0.1", () => log(`agent up: http://127.0.0.1:${port} (this machine only)  (demo mode ${demoMode ? "ON: quiet hours and caps bypassed" : "off"}; llm ${llm.constructor.name}; calendar ${calendarMode()}; scheduler ${schedulerMode})`));

// ---- the scheduler: once a minute, the real rules; texts only in "on" mode ----
if (schedulerMode !== "off") {
  const lastLogged = new Map<string, string>();
  const pass = async () => {
    try {
      const results = await crew.tickAll({ dryRun: schedulerMode === "dry" });
      for (const [id, r] of Object.entries(results)) for (const a of r.actions) {
        if (a.kind === "skip") continue;
        const line = `${a.kind}: ${a.sent ? "SENT" : "would send"} ${JSON.stringify(a.text ?? a.reason ?? "")}`;
        if (lastLogged.get(id) !== line) { lastLogged.set(id, line); log(`scheduler [${schedulerMode}] ...${id.slice(-4)} ${line}`); }
      }
    } catch (e) { log(`scheduler error: ${String(e)}`); }
  };
  setInterval(pass, 60_000);
  setTimeout(pass, 5_000);
}

const shutdown = async () => { stop(); if (store instanceof DynamoStore) await Promise.race([store.flush(), new Promise((r) => setTimeout(r, 5000))]); process.exit(0); };
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
