// The agent's contact card. Photon can't set a name and photo on a shared line (shareSpaceProfile returns
// PROFILE_UNAVAILABLE), so the agent texts a .vcf: one tap on "Create New Contact" and the thread shows
// the student's chosen name and the agent's face. Pure: the caller supplies the picture bytes.
import { PRODUCT_NAME } from "./naming.ts";

/** vCard text values escape backslash, comma, semicolon and newlines (RFC 6350 §3.4). */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 characters are folded: CRLF then a space (RFC 6350 §3.2). */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(" " + line.slice(i, i + 74));
  return parts.join("\r\n");
}

/** `voiceNumber`: the number voice drills ring from, so those calls also show the name and face. */
export interface CardInput { name: string; phone: string; voiceNumber?: string; photoPng?: Uint8Array }

/** A vCard 3.0 (the version iOS imports most reliably) with the name, the line's number and an inline PNG photo. */
export function buildVCard({ name, phone, voiceNumber, photoPng }: CardInput): string {
  const n = esc(name.trim() || "Syl");
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:;${n};;;`,
    `FN:${n}`,
    `ORG:${esc(PRODUCT_NAME)}`,
    `TEL;TYPE=CELL:${phone}`,
    ...(voiceNumber && voiceNumber !== phone ? [`TEL;TYPE=VOICE:${voiceNumber}`] : []),
    ...(photoPng ? [`PHOTO;ENCODING=b;TYPE=PNG:${Buffer.from(photoPng).toString("base64")}`] : []),
    `NOTE:${esc(`Your study agent from ${PRODUCT_NAME}.`)}`,
    "END:VCARD",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** A safe filename for the card: iMessage shows it under the card. */
export function cardFilename(name: string): string {
  const base = name.replace(/[^A-Za-z0-9 _-]/g, "").replace(/\s+/g, " ").trim().slice(0, 30).trim() || "Syl";
  return `${base}.vcf`;
}
