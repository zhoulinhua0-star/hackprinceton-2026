import { agentFetch, hasKey } from "@/lib/agent";

const ACTIONS: Record<string, string> = { scout: "/api/demo/scout", questions: "/api/demo/questions", nudge: "/api/demo/nudge?force=1", nudgedry: "/api/demo/nudge?dry=1", quiz: "/api/demo/quiz", week6: "/api/demo/week6", reset: "/api/demo/reset", hello: "/api/demo/hello", photoreal: "/api/demo/staged?on=0", photostaged: "/api/demo/staged?on=1" };

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  if (!hasKey(req)) return Response.json({ error: "locked" }, { status: 401 });
  const { action } = await params;
  const path = ACTIONS[action];
  if (!path) return Response.json({ error: "unknown action" }, { status: 404 });
  try {
    const res = await agentFetch(path, { method: "POST" });
    return Response.json(await res.json(), { status: res.status });
  } catch {
    return Response.json({ error: "agent offline" }, { status: 502 });
  }
}
