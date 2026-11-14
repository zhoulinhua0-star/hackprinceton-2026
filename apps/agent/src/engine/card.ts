// Texts the agent's contact card (name + face), so the thread header shows them after one tap.
// Photon can't set a profile on a shared line (DECISIONS #105), so this is a .vcf the student saves.
import { readFileSync } from "node:fs";
import { buildVCard, cardFilename, DEFAULT_AGENT_NAME, type Vibe } from "@syllabus-crew/core";
import { lineFor, type Ctx } from "./ctx.ts";

const photos = new Map<string, Uint8Array | null>();
/** The avatar for a vibe (apps/agent/assets/avatar-<vibe>.png, the "Bubble" design). Missing file = a card without a photo. */
export function avatar(vibe: Vibe | undefined): Uint8Array | null {
  const v = vibe ?? "chill";
  if (!photos.has(v)) {
    try { photos.set(v, readFileSync(new URL(`../../assets/avatar-${v}.png`, import.meta.url))); } catch { photos.set(v, null); }
  }
  return photos.get(v)!;
}

/**
 * Sends the card. Never throws: a failed card must not break onboarding, so it returns false and the caller
 * carries on without mentioning it. Sent first, then recorded (like ctx.say).
 */
export async function sendCard(ctx: Ctx): Promise<boolean> {
  const { deps, state } = ctx;
  const line = lineFor(deps, state);
  if (!line || !deps.messenger.sendFile) return false;
  const name = state.agentName ?? DEFAULT_AGENT_NAME;
  const card = buildVCard({ name, phone: line, voiceNumber: deps.opts.voiceNumber, photoPng: avatar(state.vibe) ?? undefined });
  try {
    await deps.messenger.sendFile(state.id, { bytes: new TextEncoder().encode(card), contentType: "text/vcard", filename: cardFilename(name) });
  } catch (e) {
    console.error(`[card] not sent: ${(e as Error).message}`);
    return false;
  }
  state.cardFor = `${name}|${state.vibe ?? "chill"}`;
  state.messages.push({ dir: "out", text: `[contact card: ${name}]`, at: deps.clock.now().toISOString(), kind: "contact-card" });
  await ctx.commit();
  return true;
}
