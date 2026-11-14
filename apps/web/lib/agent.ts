import { timingSafeEqual } from "node:crypto";

// Server-side only. The browser never sees the agent URL or the agent token.
const AGENT = process.env.AGENT_URL ?? "http://localhost:8787";

export function agentFetch(path: string, init: RequestInit = {}, timeoutMs = 5000) {
  return fetch(`${AGENT}${path}`, {
    ...init,
    cache: "no-store",
    headers: { ...init.headers, "x-demo-token": process.env.DEMO_ADMIN_TOKEN ?? "" },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/** Controls (and Approve) need the presenter key, a separate secret from the agent token. Viewing is open. */
export function hasKey(req: Request): boolean {
  const want = Buffer.from(process.env.PRESENTER_KEY ?? "");
  const given = Buffer.from(req.headers.get("x-demo-key") ?? "");
  return want.length > 0 && given.length === want.length && timingSafeEqual(given, want);
}
