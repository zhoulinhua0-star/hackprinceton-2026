// Gives someone a seat on the Photon shared line, so their texts reach Syl (DECISIONS #110).
//   npm run seat -- +1 609 555 0123     add a seat (or show the one they have) and print the line to text
//   npm run seat -- list                every active seat and its line
//   npm run seat -- release +16095550123
// A shared line only passes on texts from numbers with a seat, and Photon picks which pooled line a new seat lands
// on, so always tell the person the line this prints. Never prints the API key.
import { normalizePhone, prettyPhone } from "@syllabus-crew/core";

const projectId = process.env.PHOTON_PROJECT_ID, apiKey = process.env.PHOTON_API_KEY;
if (!projectId || !apiKey) { console.error("Missing PHOTON_PROJECT_ID or PHOTON_API_KEY in .env"); process.exit(1); }
const base = `https://api.photon.codes/v1/projects/${projectId}/platforms/imessage/assignments`;
const headers = { authorization: `Bearer ${apiKey}`, "content-type": "application/json" };

interface Seat { assignmentId: string; handle: string; assignedPhoneNumber: string; optIn?: { state: string } }

async function call(method: string, url: string, body?: unknown): Promise<any> {
  const res = await fetch(url, { method, headers: { ...headers, ...(method === "POST" ? { "idempotency-key": crypto.randomUUID() } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${res.status} ${json.code ?? ""} ${json.title ?? ""}`.trim());
  return json.data ?? json;
}
const seats = async (): Promise<Seat[]> => (await call("GET", `${base}?pageSize=200`)).assignments ?? [];
const opted = (s: Seat) => s.optIn?.state === "received" ? "has texted" : "hasn't texted yet";

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === "list") {
  const all = await seats();
  console.log(`${all.length} of 25 seats in use`);
  for (const s of all) console.log(`  ${prettyPhone(s.handle)}  →  texts ${prettyPhone(s.assignedPhoneNumber)}  (${opted(s)})`);
} else if (cmd === "release") {
  const handle = normalizePhone(rest.join(" "));
  if (!handle) { console.error("Give a full number, e.g. npm run seat -- release +16095550123"); process.exit(1); }
  const s = (await seats()).find((x) => x.handle === handle);
  if (!s) { console.log(`${prettyPhone(handle)} has no seat.`); process.exit(0); }
  await call("DELETE", `${base}/${s.assignmentId}`);
  console.log(`Released ${prettyPhone(handle)}'s seat.`);
} else {
  const handle = normalizePhone([cmd, ...rest].join(" "));
  if (!handle) { console.error("Give a full number with country code, e.g. npm run seat -- +1 609 555 0123"); process.exit(1); }
  const had = (await seats()).find((x) => x.handle === handle);
  const s: Seat = had ?? await call("POST", base, { handle });
  console.log(had ? `${prettyPhone(handle)} already has a seat.` : `Seat added for ${prettyPhone(handle)}.`);
  console.log(`\n  Tell them to text:  ${prettyPhone(s.assignedPhoneNumber)}\n  (they text first; "Hi" is enough. Status: ${opted(s)})\n`);
  const testers = process.env.TESTERS ?? "";
  if (!testers.replace(/[\s().-]/g, "").includes(handle)) console.log(`  For no quiz limits, add ${handle} to TESTERS in .env and restart the agent.`);
}
