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

/**
 * No presenter key: the dashboard binds to 127.0.0.1, so only this laptop can reach it. The one check left is
 * that a control request comes from the dashboard's own pages, so another website open in the same browser
 * cannot press the buttons. Never deploy or tunnel the dashboard without putting a real lock back.
 */
export function hasKey(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true; // curl and same-origin GETs send none
  try { return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname); } catch { return false; }
}
