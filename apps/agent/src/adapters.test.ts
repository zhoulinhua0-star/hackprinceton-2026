import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeMessenger } from "@syllabus-crew/core";
import { day1State, week6State } from "./seed.ts";
import { FileStore } from "./adapters/file-store.ts";
import { findMessages, toInbound } from "./adapters/photon.ts";

// Shapes copied from real events logged on the live line (ids shortened).
const space = { id: "pho_spc_2stm", kind: "direct", participantIds: [] };
const agent = { id: "pho_usr_0ce3", kind: "agent", handle: "+16285023837" };
const human = { id: "pho_usr_3qgg", kind: "human", handle: "+15555550100" };
const text = { id: "pho_msg_5116", platform: "imessage", status: "received", content: { format: "plain", text: "Hello agent", type: "text" }, sentBy: human, receivedBy: agent, space };
const photo = { ...text, id: "pho_msg_261y", content: { attachmentId: "pho_att_0h6y", type: "attachment" } };

test("toInbound: a human's text becomes an inbound with a route", () => {
  assert.deepEqual(toInbound(text), {
    messageId: "pho_msg_5116", studentId: "+15555550100", text: "Hello agent", hasImage: false,
    route: { spaceId: "pho_spc_2stm", senderId: "pho_usr_0ce3" },
  });
});

test("toInbound: a photo is flagged as an image", () => {
  const m = toInbound(photo)!;
  assert.equal(m.hasImage, true);
  assert.equal(m.text, undefined);
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
