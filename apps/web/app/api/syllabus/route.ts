import { agentFetch, hasKey } from "@/lib/agent";

const TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_FILE = 12 * 1024 * 1024;
const MAX_TOTAL = 20 * 1024 * 1024;

// Presenter uploads a syllabus (PDF, or page images in order). The agent reads it and texts the student.
export async function POST(req: Request) {
  if (!hasKey(req)) return Response.json({ ok: false, error: "locked" }, { status: 401 });
  let form: FormData;
  try { form = await req.formData(); } catch { return Response.json({ ok: false, error: "bad upload" }, { status: 400 }); }
  const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length < 1 || files.length > 12) return Response.json({ ok: false, error: "choose 1 to 12 files" }, { status: 400 });
  if (files.some((f) => !TYPES.has(f.type))) return Response.json({ ok: false, error: "only PDF, PNG, JPEG, WebP or GIF files" }, { status: 415 });
  if (files.some((f) => f.size > MAX_FILE) || files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL) return Response.json({ ok: false, error: "files too large (12 MB each, 20 MB total)" }, { status: 413 });
  const payload = await Promise.all(files.map(async (f) => ({ mediaType: f.type, base64: Buffer.from(await f.arrayBuffer()).toString("base64") })));
  try {
    const res = await agentFetch("/api/syllabus", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files: payload }) }, 120_000);
    return Response.json(await res.json(), { status: res.status });
  } catch {
    return Response.json({ ok: false, error: "The agent didn't answer in time. Check that it is running." }, { status: 502 });
  }
}
