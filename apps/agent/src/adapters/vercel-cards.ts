// Publishes tap-to-open cards to Vercel Blob; the hosted page (apps/cards) reads them (DECISIONS #106).
// Public blobs under a long random id: read-only, no phone number or name in the path. Cached at most 60 s.
import { put } from "@vercel/blob";
import type { CardStore } from "@syllabus-crew/core";

export class VercelCards implements CardStore {
  constructor(private o: { token: string; siteUrl: string }) {}
  async put(id: string, card: unknown): Promise<string> {
    await put(`cards/${id}.json`, JSON.stringify(card), {
      access: "public", token: this.o.token, addRandomSuffix: false, allowOverwrite: true,
      contentType: "application/json", cacheControlMaxAge: 60,
    });
    return `${this.o.siteUrl.replace(/\/$/, "")}/c/${id}`;
  }
}
