// Real Bedrock call through the adapter: checks both models and the Socratic prompt. Costs a fraction of a cent.
import { BedrockLLM } from "../adapters/bedrock.ts";
import { rules } from "../engine/ctx.ts";

const llm = new BedrockLLM({ region: process.env.AWS_REGION!, defaultModel: process.env.BEDROCK_MODEL_DEFAULT!, strongModel: process.env.BEDROCK_MODEL_STRONG! });
const t = Date.now();
const out = await llm.text("socratic", {
  system: rules("tutor"),
  user: "Question: If the Fed raises rates, what happens to investment spending?\nChoices: A) Falls B) Rises C) No change\nThe student answered B. Ask one Socratic question.",
});
console.log(`${Date.now() - t}ms:`, JSON.stringify(out));
const p = await llm.text("proposal", {
  system: rules("planner"),
  user: "Facts: Exam 2 is 25% of the grade, in 6 days. chapter 5 mastery is 35%. Proposed: 30 minutes of review on Tuesday.",
});
console.log("proposal:", JSON.stringify(p));
