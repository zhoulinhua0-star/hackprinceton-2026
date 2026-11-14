// Google Calendar over plain HTTPS (no SDK). Scope: calendar.events only. Refresh token kept in a gitignored local file.
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CalendarWriter } from "@syllabus-crew/core";

export const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const API = "https://www.googleapis.com/calendar/v3/calendars/primary";

export interface GoogleOpts {
  clientId: string; clientSecret: string; redirectUri: string; tokenPath: string; tz: string;
  fetchFn?: typeof fetch; now?: () => number;
}

/** Deterministic Google event id (base32hex: 0-9a-v). Same key, same id, so a retry can never double-book. */
export const eventIdFor = (key: string) => "sc" + createHash("sha1").update(key).digest("hex").slice(0, 30);

export class GoogleCalendar implements CalendarWriter {
  private f: typeof fetch;
  private now: () => number;
  private cached?: { token: string; expiresAt: number };
  constructor(private o: GoogleOpts) { this.f = o.fetchFn ?? fetch; this.now = o.now ?? Date.now; }

  private refreshToken(): string | undefined {
    if (!existsSync(this.o.tokenPath)) return undefined;
    try { return JSON.parse(readFileSync(this.o.tokenPath, "utf8")).refresh_token || undefined; } catch { return undefined; }
  }
  isConnected() { return !!this.refreshToken(); }

  authUrl(state: string) {
    const q = new URLSearchParams({
      client_id: this.o.clientId, redirect_uri: this.o.redirectUri, response_type: "code", scope: SCOPE,
      access_type: "offline", prompt: "consent", state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }

  private async tokenRequest(params: Record<string, string>) {
    const res = await this.f("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.o.clientId, client_secret: this.o.clientSecret, ...params }),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`google token error: ${body.error ?? res.status}${body.error_description ? ` (${body.error_description})` : ""}`);
    return body as { access_token: string; expires_in: number; refresh_token?: string };
  }

  /** Finishes the consent flow: trades the code for tokens and stores the refresh token. */
  async handleCallback(code: string) {
    const t = await this.tokenRequest({ code, redirect_uri: this.o.redirectUri, grant_type: "authorization_code" });
    if (!t.refresh_token) throw new Error("Google returned no refresh token. Remove this app at myaccount.google.com/permissions, then connect again.");
    mkdirSync(dirname(this.o.tokenPath), { recursive: true });
    writeFileSync(this.o.tokenPath, JSON.stringify({ refresh_token: t.refresh_token, saved_at: new Date(this.now()).toISOString() }), { mode: 0o600 });
    chmodSync(this.o.tokenPath, 0o600);
    this.cached = { token: t.access_token, expiresAt: this.now() + (t.expires_in - 60) * 1000 };
  }

  private async accessToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt > this.now()) return this.cached.token;
    const refresh = this.refreshToken();
    if (!refresh) throw new Error("Google Calendar is not connected");
    const t = await this.tokenRequest({ refresh_token: refresh, grant_type: "refresh_token" });
    this.cached = { token: t.access_token, expiresAt: this.now() + (t.expires_in - 60) * 1000 };
    return this.cached.token;
  }

  private async api(path: string, init: RequestInit = {}) {
    const token = await this.accessToken();
    return this.f(`${API}${path}`, { ...init, headers: { ...init.headers, authorization: `Bearer ${token}`, "content-type": "application/json" } });
  }

  /** Name and timezone of the calendar we write to (the events list carries them; no extra scope needed). */
  async calendarInfo(): Promise<{ summary: string; timeZone: string } | undefined> {
    try {
      const res = await this.api("/events?maxResults=1&fields=summary,timeZone");
      if (!res.ok) return undefined;
      const b: any = await res.json();
      return { summary: b.summary, timeZone: b.timeZone };
    } catch { return undefined; }
  }

  async createEvent(e: { title: string; startISO: string; endISO: string; key?: string }) {
    const id = e.key ? eventIdFor(e.key) : undefined;
    const res = await this.api("/events", {
      method: "POST",
      body: JSON.stringify({
        ...(id ? { id } : {}),
        summary: e.title,
        description: "Added by Syllabus Crew after you replied YES.",
        start: { dateTime: e.startISO, timeZone: this.o.tz },
        end: { dateTime: e.endISO, timeZone: this.o.tz },
      }),
    });
    if (res.status === 409 && id) return { id }; // that exact event already exists: the retry is a no-op
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`google calendar error ${res.status}: ${body?.error?.message ?? ""}`);
    return { id: body.id as string, link: body.htmlLink as string | undefined };
  }

  /** Only ever deletes events this agent created (our id prefix). */
  async deleteEvent(id: string) {
    if (!/^sc[0-9a-f]{30}$/.test(id)) throw new Error("refusing to delete an event this agent did not create");
    const res = await this.api(`/events/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`google calendar delete error ${res.status}`);
  }
}
