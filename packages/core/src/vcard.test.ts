import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVCard, cardFilename } from "./vcard.ts";

test("contact card: name, the line's number, the drill number and an inline photo, folded at 75", () => {
  const card = buildVCard({ name: "Juno", phone: "+15555550199", voiceNumber: "+15555550123", photoPng: new Uint8Array(400).fill(7) });
  assert.match(card, /^BEGIN:VCARD\r\nVERSION:3\.0\r\n/);
  assert.match(card, /\r\nFN:Juno\r\n/);
  assert.match(card, /\r\nTEL;TYPE=CELL:\+15555550199\r\n/);
  assert.match(card, /\r\nTEL;TYPE=VOICE:\+15555550123\r\n/);
  assert.match(card, /\r\nPHOTO;ENCODING=b;TYPE=PNG:/);
  assert.ok(card.endsWith("END:VCARD\r\n"));
  for (const line of card.split("\r\n")) assert.ok(line.length <= 75, `line too long: ${line.length}`);
  // Unfolding gives back the exact base64 of the photo.
  const photo = card.replace(/\r\n /g, "").match(/PHOTO;ENCODING=b;TYPE=PNG:(\S+)/)![1];
  assert.equal(photo, Buffer.from(new Uint8Array(400).fill(7)).toString("base64"));
});

test("contact card: special characters are escaped, no drill number twice, no photo is fine", () => {
  const card = buildVCard({ name: "Dr; Smith, Jr", phone: "+15555550199", voiceNumber: "+15555550199" });
  assert.ok(card.includes(String.raw`FN:Dr\; Smith\, Jr` + "\r\n"));
  assert.equal(card.match(/TEL;/g)!.length, 1);
  assert.doesNotMatch(card, /PHOTO/);
  assert.equal(cardFilename("Juno ✨"), "Juno.vcf");
  assert.equal(cardFilename("🙂"), "Syl.vcf");
});

import { weekCard } from "./cards.ts";
import type { Proposal, StudentState } from "./types.ts";
test("week card: a booked Google event gets its calendar link; the local stand-in never does", () => {
  const state = { topics: [{ id: "t", courseId: "c", name: "Ch. 5: Rates", short: "ch. 5" }], exams: [], deadlines: [], busy: [], mastery: { t: 0.3 } } as unknown as StudentState;
  const p = (link?: string, status: Proposal["status"] = "approved") => ({ id: "p", status, topicId: "t", label: "ch. 5 review", text: "", createdAt: "", event: { title: "", startISO: "2026-11-17T21:00:00Z", endISO: "2026-11-17T21:30:00Z" }, ...(link ? { calendarLink: link } : {}) }) as Proposal;
  const now = new Date("2026-11-14T12:00:00Z");
  assert.equal(weekCard(state, p("https://www.google.com/calendar/event?eid=abc"), "America/New_York", now).calendarUrl, "https://www.google.com/calendar/event?eid=abc");
  assert.equal(weekCard(state, p("local://event/1"), "America/New_York", now).calendarUrl, undefined);
  assert.equal(weekCard(state, p("https://www.google.com/calendar/event?eid=abc", "pending"), "America/New_York", now).calendarUrl, undefined);
});
