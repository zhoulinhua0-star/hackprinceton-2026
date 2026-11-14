// Photon 2.0 (beta) iMessage adapter. Inbound: WebSocket + a polling safety net. Outbound: sendMessage.
// Verified against the real line: no typing indicator on a shared line; photos arrive as an attachmentId.
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Photon } from "@photon-ai/api";
import { io } from "socket.io-client";
import type { Attachment, Messenger, OutFile, Store } from "@syllabus-crew/core";
import type { Inbound } from "../engine/crew.ts";

export interface PhotonInbound extends Inbound { messageId: string; studentId: string; createdAt?: string; attachmentId?: string }

/** Pick a human's direct-chat iMessage out of a Photon message object. Anything else returns undefined. */
export function toInbound(m: any): PhotonInbound | undefined {
  if (!m || typeof m.id !== "string" || !m.id.startsWith("pho_msg_")) return undefined;
  if (m.platform !== "imessage" || (m.status && m.status !== "received")) return undefined;
  if (m.sentBy?.kind !== "human" || m.space?.kind !== "direct") return undefined;
  if (!m.sentBy?.handle || !m.space?.id || !m.receivedBy?.id) return undefined;
  const type = m.content?.type;
  if (type !== "text" && type !== "attachment") return undefined;
  return {
    messageId: m.id,
    ...(typeof m.createdAt === "string" ? { createdAt: m.createdAt } : {}),
    studentId: m.sentBy.handle,
    text: type === "text" ? m.content.text : undefined,
    hasImage: type === "attachment",
    ...(type === "attachment" && typeof m.content.attachmentId === "string" ? { attachmentId: m.content.attachmentId } : {}),
    route: { spaceId: m.space.id, senderId: m.receivedBy.id },
  };
}

/** The WebSocket event shape wraps the message; walk it rather than trusting a fixed path. */
export function findMessages(node: unknown, out: any[] = []): any[] {
  if (Array.isArray(node)) node.forEach((n) => findMessages(n, out));
  else if (node && typeof node === "object") {
    const o = node as Record<string, any>;
    if (typeof o.id === "string" && o.id.startsWith("pho_msg_") && o.space?.id) out.push(o);
    else Object.values(o).forEach((v) => findMessages(v, out));
  }
  return out;
}

const GAP_MS = 900;

export class PhotonMessenger implements Messenger {
  constructor(private photon: Photon, private projectId: string, private store: Store, private apiKey = "") {}
  /** Two texts sent back to back can arrive swapped on the phone (seen on the real line). Keep a short gap per thread. */
  private last = new Map<string, number>();
  private async spaced(studentId: string) {
    const wait = (this.last.get(studentId) ?? 0) + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.last.set(studentId, Date.now());
  }
  async send(studentId: string, text: string) {
    await this.spaced(studentId);
    const route = (await this.store.load(studentId))?.route;
    if (!route) throw new Error(`no Photon route for ${studentId}: they have not texted the line yet`);
    await this.photon.projects.sendMessage({
      path: { id: this.projectId },
      headers: { "idempotency-key": randomUUID() },
      body: { spaceId: route.spaceId, senderId: route.senderId, content: { type: "text", format: "plain", text } } as any,
    });
  }

  /** Upload, then send as an attachment. The upload is multipart/related: a JSON part, then the bytes (verified against the API). */
  async sendFile(studentId: string, file: OutFile) {
    await this.spaced(studentId);
    const route = (await this.store.load(studentId))?.route;
    if (!route) throw new Error(`no Photon route for ${studentId}: they have not texted the line yet`);
    if (!this.apiKey) throw new Error("no Photon API key for uploads");
    const boundary = `sc${randomUUID().replace(/-/g, "")}`;
    const meta = JSON.stringify({ contentType: file.contentType, sizeBytes: file.bytes.length, filename: file.filename });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${file.contentType}\r\n\r\n`),
      Buffer.from(file.bytes),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await fetch(`https://api.photon.codes/v1/projects/${this.projectId}/attachments`, {
      method: "POST", body,
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": `multipart/related; boundary=${boundary}`, "idempotency-key": randomUUID() },
    });
    const att = (await res.json().catch(() => ({}))) as { id?: string; code?: string };
    if (!res.ok || !att.id) throw new Error(`attachment upload failed: ${res.status} ${att.code ?? ""}`);
    await this.photon.projects.sendMessage({
      path: { id: this.projectId },
      headers: { "idempotency-key": randomUUID() },
      body: { spaceId: route.spaceId, senderId: route.senderId, content: { type: "attachment", attachmentId: att.id } } as any,
    });
  }
}

/** What a file is, from its first bytes (iMessage does not reliably say). `heic` is what iPhones send; the model can't read it. */
export function sniff(b: Uint8Array): Attachment["mediaType"] | "heic" | null {
  const at = (i: number, s: string) => s.split("").every((c, k) => b[i + k] === c.charCodeAt(0));
  if (at(0, "%PDF")) return "application/pdf";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && at(1, "PNG")) return "image/png";
  if (at(0, "GIF8")) return "image/gif";
  if (at(0, "RIFF") && at(8, "WEBP")) return "image/webp";
  if (at(4, "ftyp") && ["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"].some((brand) => at(8, brand))) return "heic";
  return null;
}

const MAX_IMAGE = 3_500_000, MAX_PDF = 20_000_000;
/** Turns downloaded bytes into something the model can read, or null. HEIC and oversized photos become a 2000px JPEG (macOS `sips`). */
export async function toAttachment(buf: Buffer): Promise<Attachment | null> {
  const kind = sniff(buf);
  if (!kind) return null;
  if (kind === "application/pdf") return buf.length <= MAX_PDF ? { mediaType: kind, base64: buf.toString("base64") } : null;
  if (kind !== "heic" && buf.length <= MAX_IMAGE) return { mediaType: kind, base64: buf.toString("base64") };
  const dir = await mkdtemp(join(tmpdir(), "crew-img-"));
  try {
    const src = join(dir, "in"), out = join(dir, "out.jpg");
    await writeFile(src, buf);
    await promisify(execFile)("sips", ["-s", "format", "jpeg", "-Z", "2000", src, "--out", out], { timeout: 20_000 });
    return { mediaType: "image/jpeg", base64: (await readFile(out)).toString("base64") };
  } catch { return null; } finally { await rm(dir, { recursive: true, force: true }); }
}

/** Downloads what the student texted (a photo or a PDF). Null when it can't be fetched or isn't a readable type. */
export async function fetchAttachment(photon: Photon, projectId: string, attachmentId: string): Promise<Attachment | null> {
  const blob = await photon.projects.downloadAttachment({ path: { id: projectId, attachmentId } } as any);
  return toAttachment(Buffer.from(await (blob as Blob).arrayBuffer()));
}

/** A message from well before this process started: ignore it instead of acting on it. */
export const isStale = (createdAt: string | undefined, startedAtMs: number, graceMs = 60_000): boolean =>
  !!createdAt && Date.parse(createdAt) < startedAtMs - graceMs;

export function makePhoton(apiKey: string) {
  return new Photon({ headers: { Authorization: `Bearer ${apiKey}` } });
}

/** Starts listening. Each message is handed to onMessage once (deduped across the socket and the poll). */
export function listen(o: {
  photon: Photon; projectId: string; apiKey: string;
  onMessage: (m: PhotonInbound) => Promise<void>; log?: (s: string) => void;
}) {
  const log = o.log ?? (() => {});
  const seen = new Set<string>();
  const startedAt = Date.now();
  const handle = async (raw: any, via: string) => {
    const m = toInbound(raw);
    if (!m || seen.has(m.messageId)) return;
    seen.add(m.messageId);
    // After a restart the socket might replay old messages; an old YES must never act on whatever is pending now.
    if (isStale(m.createdAt, startedAt)) { log(`ignoring stale message ${m.messageId} from ${m.createdAt}`); return; }
    log(`inbound (${via}) from ${m.studentId}: ${m.hasImage ? "[photo]" : JSON.stringify(m.text)}`);
    try { await o.onMessage(m); } catch (e) { log(`handler error: ${String(e)}`); }
  };

  const socket = io("https://api.photon.codes", {
    path: `/v1/projects/${o.projectId}/events/ws`,
    addTrailingSlash: false,
    transports: ["websocket"],
    extraHeaders: { Authorization: `Bearer ${o.apiKey}` },
    autoConnect: false,
  });
  socket.on("connect", () => {
    log("photon websocket connected");
    socket.emit("subscribe", { startSeq: 0 }, (ack: any) => log(`photon subscribe ok=${ack?.ok}`));
  });
  socket.on("connect_error", (e) => log(`photon websocket error: ${String(e)}`));
  socket.on("disconnect", (r) => log(`photon websocket disconnected: ${r}`));
  socket.on("delivery_error", (e) => log(`photon delivery_error: ${JSON.stringify(e)}`));
  socket.on("delivery", (event: any) => { for (const m of findMessages(event)) void handle(m, "ws"); });
  socket.connect();

  let cursor = new Date().toISOString();
  const poll = setInterval(async () => {
    try {
      const page: any = await o.photon.projects.listMessages({
        path: { id: o.projectId },
        query: { direction: "received", platform: "imessage", order: "asc", pageSize: 50, createdSince: cursor },
      });
      for (const m of page.items ?? []) {
        if (m.createdAt > cursor) cursor = m.createdAt;
        await handle(m, "poll");
      }
    } catch (e) { log(`photon poll error: ${String(e)}`); }
  }, 5000);

  return () => { clearInterval(poll); socket.close(); };
}
