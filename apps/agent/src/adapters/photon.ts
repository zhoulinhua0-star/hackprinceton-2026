// Photon 2.0 (beta) iMessage adapter. Inbound: WebSocket + a polling safety net. Outbound: sendMessage.
// Verified against the real line: no typing indicator on a shared line; photos arrive as an attachmentId.
import { randomUUID } from "node:crypto";
import { Photon } from "@photon-ai/api";
import { io } from "socket.io-client";
import type { Messenger, Store } from "@syllabus-crew/core";
import type { Inbound } from "../engine/crew.ts";

export interface PhotonInbound extends Inbound { messageId: string; studentId: string; createdAt?: string }

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

export class PhotonMessenger implements Messenger {
  constructor(private photon: Photon, private projectId: string, private store: Store) {}
  async send(studentId: string, text: string) {
    const route = (await this.store.load(studentId))?.route;
    if (!route) throw new Error(`no Photon route for ${studentId}: they have not texted the line yet`);
    await this.photon.projects.sendMessage({
      path: { id: this.projectId },
      headers: { "idempotency-key": randomUUID() },
      body: { spaceId: route.spaceId, senderId: route.senderId, content: { type: "text", format: "plain", text } } as any,
    });
  }
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
