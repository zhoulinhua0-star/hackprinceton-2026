// ElevenLabs Agents over a Photon number (SIP trunk): place an outbound call, then read the call back when it ends.
// No webhook: the agent polls GET /v1/convai/conversations/{id}, so nothing on this laptop has to be public.
import type { Caller, CallLine, CallStatus } from "@syllabus-crew/core";

const API = "https://api.elevenlabs.io";

export class ElevenLabsCaller implements Caller {
  constructor(private o: { apiKey: string; agentId: string; phoneNumberId: string; fetch?: typeof fetch }) {}

  private async call(path: string, init: RequestInit = {}) {
    const res = await (this.o.fetch ?? fetch)(`${API}${path}`, {
      ...init,
      headers: { "xi-api-key": this.o.apiKey, "content-type": "application/json", ...init.headers },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`elevenlabs ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
    return body as Record<string, any>;
  }

  async placeCall(o: { to: string; variables: Record<string, string> }) {
    const body = await this.call("/v1/convai/sip-trunk/outbound-call", {
      method: "POST",
      body: JSON.stringify({
        agent_id: this.o.agentId,
        agent_phone_number_id: this.o.phoneNumberId,
        to_number: o.to,
        conversation_initiation_client_data: { dynamic_variables: o.variables },
      }),
    });
    if (body.success === false || !body.conversation_id) throw new Error(`elevenlabs did not start the call: ${body.message ?? "no conversation id"}`);
    return { callId: String(body.conversation_id) };
  }

  async getCall(callId: string): Promise<CallStatus> {
    return toStatus(await this.call(`/v1/convai/conversations/${encodeURIComponent(callId)}`));
  }
}

/** Maps ElevenLabs' conversation object to ours. Unknown shapes count as still pending. */
export function toStatus(c: Record<string, any>): CallStatus {
  const transcript: CallLine[] = Array.isArray(c.transcript)
    ? c.transcript.filter((t: any) => typeof t?.message === "string" && t.message.trim()).map((t: any) => ({ role: t.role === "user" ? "user" : "agent", text: t.message }))
    : [];
  const durationSecs = typeof c.metadata?.call_duration_secs === "number" ? c.metadata.call_duration_secs : undefined;
  const result = c.metadata?.phone_call?.call_result;
  const answered = result ? result === "answered" : transcript.some((t) => t.role === "user");
  if (c.status === "done") return { state: "done", durationSecs, transcript, answered };
  if (c.status === "failed") return { state: "failed", durationSecs, transcript, answered: false };
  return { state: "pending" };
}
