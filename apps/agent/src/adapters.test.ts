import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeMessenger } from "@syllabus-crew/core";
import { day1State, week6State } from "./seed.ts";
import { FileStore } from "./adapters/file-store.ts";
import { findMessages, sniff, toAttachment, toInbound } from "./adapters/photon.ts";
import { VOICE_NO_TRANSCRIPT } from "./engine/crew.ts";

// Shapes copied from real events logged on the live line (ids shortened).
const space = { id: "pho_spc_2stm", kind: "direct", participantIds: [] };
const agent = { id: "pho_usr_0ce3", kind: "agent", handle: "+16285023837" };
const human = { id: "pho_usr_3qgg", kind: "human", handle: "+15555550100" };
const text = { id: "pho_msg_5116", platform: "imessage", status: "received", content: { format: "plain", text: "Hello agent", type: "text" }, sentBy: human, receivedBy: agent, space };
const photo = { ...text, id: "pho_msg_261y", content: { attachmentId: "pho_att_0h6y", type: "attachment" } };

test("toInbound: a human's text becomes an inbound with a route", () => {
  assert.deepEqual(toInbound(text), {
    messageId: "pho_msg_5116", studentId: "+15555550100", text: "Hello agent", hasImage: false,
    route: { spaceId: "pho_spc_2stm", senderId: "pho_usr_0ce3", line: "+16285023837" },
  });
});

test("toInbound: the route remembers which line they texted (seats can land on different lines); no handle, no line", () => {
  assert.equal(toInbound({ ...text, receivedBy: { ...agent, handle: "+16095550199" } })!.route!.line, "+16095550199");
  assert.equal(toInbound({ ...text, receivedBy: { id: "pho_usr_0ce3", kind: "agent" } })!.route!.line, undefined);
});

test("toInbound: a photo is flagged as an image", () => {
  const m = toInbound(photo)!;
  assert.equal(m.hasImage, true);
  assert.equal(m.text, undefined);
});

test("toInbound: a voice note is its transcript, and a 'group' of parts is joined (real phone, Nov 15: both were dropped)", () => {
  const voice = { ...text, id: "pho_msg_0dqy", content: { attachmentId: "pho_att_6qva", type: "voice", metadata: { voice: { transcript: "So what should I be focusing on this week?" } } } };
  assert.equal(toInbound(voice)!.text, "So what should I be focusing on this week?");
  assert.equal(toInbound(voice)!.hasImage, false);
  assert.equal(toInbound({ ...voice, content: { type: "voice", attachmentId: "pho_att_6qva" } })!.text, VOICE_NO_TRANSCRIPT);
  const group = { ...text, id: "pho_msg_0b4e", content: { type: "group", parts: [
    { format: "plain", text: "So what should I be focusing on ", type: "text" }, { format: "plain", text: "this week", type: "text" }] } };
  assert.equal(toInbound(group)!.text, "So what should I be focusing on this week");
  const withFile = { ...group, content: { type: "group", parts: [{ type: "text", text: "check it" }, { type: "attachment", attachmentId: "pho_att_9zz" }] } };
  assert.deepEqual([toInbound(withFile)!.hasImage, toInbound(withFile)!.attachmentId, toInbound(withFile)!.text], [true, "pho_att_9zz", undefined]);
  assert.equal(toInbound({ ...group, content: { type: "group", parts: [{ type: "reaction" }] } }), undefined);
});

test("toInbound ignores our own messages, groups, other platforms and unsupported content", () => {
  assert.equal(toInbound({ ...text, sentBy: agent }), undefined);
  assert.equal(toInbound({ ...text, space: { ...space, kind: "group" } }), undefined);
  assert.equal(toInbound({ ...text, platform: "sms" }), undefined);
  assert.equal(toInbound({ ...text, status: "dispatched" }), undefined);
  assert.equal(toInbound({ ...text, content: { type: "reaction", reaction: "like" } }), undefined);
  assert.equal(toInbound(null), undefined);
  assert.equal(toInbound({ id: "x" }), undefined);
});

test("findMessages digs the message out of a websocket delivery frame", () => {
  const frame = [{ id: "pho_evt_1", type: "message.received", data: { object: text, projectId: "p" } }, { seq: 1, replyExpected: false }];
  assert.deepEqual(findMessages(frame).map((m) => m.id), ["pho_msg_5116"]);
  assert.deepEqual(findMessages([{ seq: 1 }]), []);
});

test("FileStore survives a restart, and a corrupt file starts empty", async () => {
  const dir = mkdtempSync(join(tmpdir(), "crew-"));
  const path = join(dir, "state.json");
  const a = new FileStore(path);
  const s = week6State("+1", new Date("2026-11-15T12:00:00Z"));
  s.route = { spaceId: "pho_spc_2stm", senderId: "pho_usr_0ce3" };
  await a.save(s);
  await a.save(day1State("+2"));
  const b = new FileStore(path);
  assert.deepEqual(await b.load("+1"), s);
  assert.equal((await b.load("+2"))?.phase, "day1");
  assert.equal(await b.load("+3"), undefined);
  const { writeFileSync } = await import("node:fs");
  writeFileSync(path, "{not json");
  assert.equal(await new FileStore(path).load("+1"), undefined);
});

test("FileStore returns copies, not live references", async () => {
  const st = new FileStore(join(mkdtempSync(join(tmpdir(), "crew-")), "s.json"));
  await st.save(day1State("+1"));
  const x = (await st.load("+1"))!;
  x.phase = "week6";
  assert.equal((await st.load("+1"))!.phase, "day1");
  void FakeMessenger;
});

test("toInbound keeps the attachment id of a texted file", () => {
  assert.equal(toInbound(photo)!.attachmentId, "pho_att_0h6y");
  assert.equal("attachmentId" in toInbound(text)!, false);
});

test("sniff tells a PDF, the image types and an iPhone HEIC apart by their first bytes", () => {
  const bytes = (s: string, pad = 16) => Buffer.concat([Buffer.from(s, "latin1"), Buffer.alloc(pad)]);
  assert.equal(sniff(bytes("%PDF-1.7")), "application/pdf");
  assert.equal(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), "image/jpeg");
  assert.equal(sniff(bytes("\x89PNG\r\n")), "image/png");
  assert.equal(sniff(bytes("GIF89a")), "image/gif");
  assert.equal(sniff(bytes("RIFF\0\0\0\0WEBP")), "image/webp");
  assert.equal(sniff(bytes("\0\0\0\x18ftypheic")), "heic");
  assert.equal(sniff(bytes("hello, not a file")), null);
});

test("toAttachment passes a small PDF through and refuses unknown bytes", async () => {
  const pdf = Buffer.from("%PDF-1.7 tiny");
  assert.deepEqual(await toAttachment(pdf), { mediaType: "application/pdf", base64: pdf.toString("base64") });
  assert.equal(await toAttachment(Buffer.from("just some text")), null);
});
