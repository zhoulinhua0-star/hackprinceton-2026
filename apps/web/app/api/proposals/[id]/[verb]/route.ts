import { agentFetch, hasKey } from "@/lib/agent";

// Dashboard Approve / Not now. Goes through the same approve path as a YES text.
export async function POST(req: Request, { params }: { params: Promise<{ id: string; verb: string }> }) {
  if (!hasKey(req)) return Response.json({ error: "locked" }, { status: 401 });
  const { id, verb } = await params;
  if (!/^[\w-]+$/.test(id) || (verb !== "approve" && verb !== "decline")) return Response.json({ error: "bad request" }, { status: 400 });
  try {
    const res = await agentFetch(`/api/proposals/${id}/${verb}`, { method: "POST" });
    return Response.json(await res.json(), { status: res.status });
  } catch {
    return Response.json({ error: "agent offline" }, { status: 502 });
  }
}
