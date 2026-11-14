import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeCalendar, FakeLLM, FakeMessenger, FixedClock, MemoryStore } from "@syllabus-crew/core";
import { GoogleCalendar, SCOPE, eventIdFor } from "./adapters/google.ts";
import { Crew } from "./index.ts";

type Call = { url: string; method: string; headers: Record<string, string>; body?: any };

function mock(handler: (c: Call) => { status?: number; json?: unknown }) {
  const calls: Call[] = [];
  const fetchFn = (async (url: any, init: any = {}) => {
    const raw = init.body instanceof URLSearchParams ? Object.fromEntries(init.body) : init.body ? JSON.parse(init.body) : undefined;
    const c: Call = { url: String(url), method: init.method ?? "GET", headers: init.headers ?? {}, body: raw };
    calls.push(c);
    const r = handler(c);
    return new Response(r.status === 204 ? null : JSON.stringify(r.json ?? {}), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { calls, fetchFn };
}

function setup(handler: Parameters<typeof mock>[0], connected = true) {
  const dir = mkdtempSync(join(tmpdir(), "g-"));
  const tokenPath = join(dir, "google.json");
  if (connected) writeFileSync(tokenPath, JSON.stringify({ refresh_token: "r-token" }));
  const m = mock(handler);
  let t = 1_000_000;
  const g = new GoogleCalendar({ clientId: "cid", clientSecret: "sec", redirectUri: "http://localhost:8787/auth/google/callback", tokenPath, tz: "America/New_York", fetchFn: m.fetchFn, now: () => t });
  return { g, ...m, tokenPath, advance: (ms: number) => (t += ms) };
}
const tokenOk = { json: { access_token: "a-token", expires_in: 3600 } };
const EVENT = { title: "Macro: chapter 5 review", startISO: "2026-11-17T21:00:00.000Z", endISO: "2026-11-17T21:30:00.000Z" };

test("the consent link asks only for calendar.events, offline, with our state", () => {
  const { g } = setup(() => ({}), false);
  const u = new URL(g.authUrl("nonce123"));
  assert.equal(u.origin + u.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(u.searchParams.get("scope"), SCOPE);
  assert.equal(SCOPE, "https://www.googleapis.com/auth/calendar.events");
  assert.equal(u.searchParams.get("access_type"), "offline");
  assert.equal(u.searchParams.get("state"), "nonce123");
  assert.equal(u.searchParams.get("redirect_uri"), "http://localhost:8787/auth/google/callback");
});

test("callback stores the refresh token (private file) and never the client secret", async () => {
  const { g, tokenPath, calls } = setup(() => ({ json: { access_token: "a", expires_in: 3600, refresh_token: "r-new" } }), false);
  assert.equal(g.isConnected(), false);
  await g.handleCallback("the-code");
  assert.equal(g.isConnected(), true);
  assert.equal(calls[0]!.body.grant_type, "authorization_code");
  assert.equal(calls[0]!.body.code, "the-code");
  const saved = readFileSync(tokenPath, "utf8");
  assert.equal(JSON.parse(saved).refresh_token, "r-new");
  assert.equal(saved.includes("sec"), false);
  assert.equal((statSync(tokenPath).mode & 0o777).toString(8), "600");
});

test("callback without a refresh token fails with a fix, and saves nothing", async () => {
  const { g, tokenPath } = setup(() => tokenOk, false);
  await assert.rejects(() => g.handleCallback("c"), /no refresh token/);
  assert.equal(existsSync(tokenPath), false);
});

test("createEvent posts the right event with a deterministic id, and reuses the access token", async () => {
  const { g, calls } = setup((c) => (c.url.includes("oauth2") ? tokenOk : { json: { id: "ev1", htmlLink: "https://calendar.google.com/event?eid=x" } }));
  const r = await g.createEvent({ ...EVENT, key: "prop_1:2026-11-15T17:00:00.000Z" });
  await g.createEvent({ ...EVENT, key: "other" });
  assert.deepEqual(r, { id: "ev1", link: "https://calendar.google.com/event?eid=x" });
  const post = calls.find((c) => c.url.endsWith("/calendars/primary/events") && c.method === "POST")!;
  assert.equal(post.headers.authorization, "Bearer a-token");
  assert.equal(post.body.summary, "Macro: chapter 5 review");
  assert.deepEqual(post.body.start, { dateTime: EVENT.startISO, timeZone: "America/New_York" });
  assert.deepEqual(post.body.end, { dateTime: EVENT.endISO, timeZone: "America/New_York" });
  assert.equal(post.body.id, eventIdFor("prop_1:2026-11-15T17:00:00.000Z"));
  assert.match(post.body.id, /^sc[0-9a-f]{30}$/); // valid Google event id alphabet
  assert.equal(calls.filter((c) => c.url.includes("oauth2")).length, 1); // one refresh serves both writes
});

test("an expired access token is refreshed", async () => {
  const s = setup((c) => (c.url.includes("oauth2") ? tokenOk : { json: { id: "e" } }));
  await s.g.createEvent(EVENT);
  s.advance(2 * 3600_000);
  await s.g.createEvent(EVENT);
  assert.equal(s.calls.filter((c) => c.url.includes("oauth2")).length, 2);
});

test("a duplicate (409) with the same key is treated as already done, not an error", async () => {
  const { g } = setup((c) => (c.url.includes("oauth2") ? tokenOk : { status: 409, json: { error: { message: "exists" } } }));
  const r = await g.createEvent({ ...EVENT, key: "k" });
  assert.equal(r.id, eventIdFor("k"));
});

test("not connected, or Google errors, make createEvent throw (so the approve path keeps the proposal pending)", async () => {
  await assert.rejects(() => setup(() => ({}), false).g.createEvent(EVENT), /not connected/);
  await assert.rejects(() => setup((c) => (c.url.includes("oauth2") ? tokenOk : { status: 403, json: { error: { message: "insufficient scope" } } })).g.createEvent(EVENT), /403.*insufficient scope/);
  await assert.rejects(() => setup(() => ({ status: 400, json: { error: "invalid_grant" } })).g.createEvent(EVENT), /invalid_grant/);
});

test("deleteEvent only touches events this agent created", async () => {
  const { g, calls } = setup((c) => (c.url.includes("oauth2") ? tokenOk : { status: 204 }));
  await assert.rejects(() => g.deleteEvent("someones_meeting_123"), /did not create/);
  await assert.rejects(() => g.deleteEvent("../../calendars"), /did not create/);
  assert.equal(calls.length, 0); // refused before any network call
  await g.deleteEvent(eventIdFor("k"));
  assert.equal(calls.at(-1)!.method, "DELETE");
});

test("approve passes an idempotency key, and Reset demo deletes the events it created", async () => {
  const calendar = new FakeCalendar();
  const seen: (string | undefined)[] = [];
  const real = calendar.createEvent.bind(calendar);
  calendar.createEvent = async (e) => { seen.push(e.key); return real(e); };
  const crew = new Crew({ store: new MemoryStore(), messenger: new FakeMessenger(), llm: new FakeLLM(), calendar,
    clock: new FixedClock(new Date("2026-11-15T12:00:00-05:00")), tz: "America/New_York", opts: { proposalDelayMs: 0 } });
  const ME = "+1";
  await crew.onInbound(ME, { text: "Hi" });
  await crew.switchToWeek6(ME);
  await crew.runScoutNow(ME);
  await crew.onInbound(ME, { text: "B" });
  await crew.onInbound(ME, { text: "YES" });
  assert.equal(calendar.events.length, 1);
  assert.match(seen[0]!, /^prop_1:/);
  const r = await crew.resetDemo(ME);
  assert.deepEqual(r, { removedEvents: 1, failedEvents: 0 });
  assert.equal(calendar.events.length, 0);
});
