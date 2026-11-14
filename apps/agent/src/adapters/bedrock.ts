import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import type { Attachment, LLM, LlmTask } from "@syllabus-crew/core";

/** Claude on Amazon Bedrock. Uses the legacy client + `us.` inference-profile IDs (verified; see DECISIONS #41). */
export class BedrockLLM implements LLM {
  private client: AnthropicBedrock;
  constructor(private o: { region: string; defaultModel: string; strongModel: string }) {
    // A new AWS account has low rate limits: retry throttling (429) with backoff instead of failing.
    this.client = new AnthropicBedrock({ awsRegion: o.region, maxRetries: 6 });
  }
  async text(task: LlmTask, input: { system: string; user: string }): Promise<string> {
    const strong = task === "parse_syllabus" || task === "write_questions";
    const res = await this.client.messages.create({
      model: strong ? this.o.strongModel : this.o.defaultModel,
      max_tokens: strong ? 4000 : 300,
      ...(input.system ? { system: input.system } : {}),
      messages: [{ role: "user", content: input.user }],
    });
    return res.content.map((b: any) => (b.type === "text" ? b.text : "")).join("").trim();
  }

  /** Forced tool call returns JSON that follows `schema`. Uses the strong model. The caller validates the result. */
  async extractJson(
    _task: LlmTask,
    input: { system: string; user: string; attachments: Attachment[]; toolName: string; schema: object },
  ): Promise<unknown> {
    const blocks = input.attachments.map((a) =>
      a.mediaType === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: a.mediaType, data: a.base64 } }
        : { type: "image", source: { type: "base64", media_type: a.mediaType, data: a.base64 } });
    const res: any = await this.client.messages.create({
      model: this.o.strongModel,
      max_tokens: 8000,
      ...(input.system ? { system: input.system } : {}),
      tools: [{ name: input.toolName, description: "Record the extracted data.", input_schema: input.schema as any }],
      tool_choice: { type: "tool", name: input.toolName },
      messages: [{ role: "user", content: [...blocks, { type: "text", text: input.user }] as any }],
    });
    const use = res.content.find((b: any) => b.type === "tool_use");
    if (!use) throw new Error(`model did not call ${input.toolName}`);
    return use.input;
  }
}
