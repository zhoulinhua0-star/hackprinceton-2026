# CLAUDE.md: Syllabus Crew

## How to work here
- Read SPEC.md and PLAN.md before starting work. The demo loop in SPEC.md is the priority.
- State assumptions instead of guessing silently.
- Before saying a feature is done, run its checks (tests, a demo-loop run, a real text) and say what you ran. Say "skipped" if skipped.
- Scope changes go in SPEC.md, task changes in PLAN.md.
- Log non-obvious decisions in DECISIONS.md with the reason.
- Where docs disagree, trust the code, then PLAN.md, then SPEC.md.
- Never commit secrets or a real `.env`.

## Architecture
A student texts one agent, **Crew Lead**, in one iMessage thread (Photon 2.0 beta). Four specialists work behind it. A Next.js dashboard mirrors the state.

- **Crew Lead:** receives every inbound message. It **first matches replies in code** against the student's single pending item (A/B/C → Tutor, YES/NO → Planner proposal; unclear → clarifying text). Otherwise one cheap LLM call routes the message to Scout / Tutor / Planner / Nudger, or Crew Lead answers directly. No typing indicator on the shared line (DECISIONS #39); for slow replies send a short "On it" text.
- **Scout:** fetches the iCal feed (node-ical), detects changes, and passes slides/photos to the Tutor. **Read-only.**
- **Tutor:** A/B/C quizzes graded in code, Socratic follow-up on the first miss, reveal after 2 misses. Tracks mastery per topic. Picks topics by priority score.
- **Planner:** spots crunch weeks and weak, high-stakes topics. **Only tool that changes anything: `createProposal`.** It has no calendar tool.
- **Nudger:** decides whether, which, and when to nudge. Requested reminders are always delivered.
- **Approve path:** the *only* code that writes to Google Calendar. Triggered by a matched YES text or the dashboard Approve button.

Agent loop: Claude on Amazon Bedrock (Anthropic SDK, `AnthropicBedrock` client from `@anthropic-ai/bedrock-sdk`, authenticated with IAM access keys) with tool use, ~50 lines, no framework, behind an `LLM` interface. Models (see DECISIONS #40): Haiku 4.5 default (`BEDROCK_MODEL_DEFAULT`), Sonnet 4.6 for syllabus parsing (`BEDROCK_MODEL_STRONG`). Haiku 5.5 is blocked on this account for now. Verified IDs: `us.anthropic.claude-haiku-4-5-20251001-v1:0`, `us.anthropic.claude-sonnet-4-6` (the `us.` inference-profile prefix is required; bare IDs fail). Each agent is a config `{ name, rules: agents/<name>.md, tools, memory }`.

## Hard rules (enforce in code; never rely on prompts)
- No outbound texts 11pm-8am (`STUDENT_TIMEZONE`), including Scout. Max 3 quiz questions/day, max 3 nudges/day. Demo mode bypasses these for the demo student only (`DEMO_STUDENT`), never for strangers.
- Real Google Calendar writes happen only for the demo student; anyone else gets a local stand-in. Reset deletes only events the app created.
- A failed text never leaves state behind: `ctx.say` sends first, then records. One open quiz and one open proposal at a time.
- Proactive texts follow the Nudger policy in `packages/core/src/nudger.ts`: nudges only 9am-8pm, max 3 a day (Scout counts), 4h gap, never mid-conversation, backoff after 2 unanswered; requested reminders always delivered (delayed past quiet hours). Scheduler mode: `SCHEDULER=off|dry|on`, default `dry` (logs only).
- The agent HTTP server binds to 127.0.0.1 and the dashboard to localhost; controls need the agent token (agent) or `PRESENTER_KEY` (dashboard).
- The agent never starts a conversation with someone who hasn't texted the line first.
- No calendar write outside the approve path.
- Scout never sends email or deletes anything.
- Math in code: grading, mastery updates, priority score, crunch detection, timing. LLM for language only.

## Layout (assumed; update when real)
- `apps/agent`: Node/TS agent. `src/engine/` = Crew Lead, Scout, Tutor, Planner, approve path (built, tested on fakes). Not built yet: real Photon + Bedrock adapters, HTTP demo controls, scheduler.
- Commands: `npm test -w @syllabus-crew/core`, `npm test -w @syllabus-crew/agent`, `npm run demo:loop -w @syllabus-crew/agent`
- `apps/web`: Next.js dashboard (Vercel), also serves the fake demo `.ics`
- `packages/core`: shared types, store interface, pure logic (grading, mastery, priority, reply matching) + unit tests
- `agents/*.md`: rules for crew-lead, scout, tutor, planner, nudger
- `seed/`: Day 1 and Week 6 demo states, Week 6 slides, demo syllabus parse

Every outside service (Photon, Bedrock, Textract, Google Calendar, DynamoDB) sits behind an interface with a fake, so the demo loop can run on canned data.
