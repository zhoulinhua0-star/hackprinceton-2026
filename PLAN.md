# Syllabus Crew: PLAN

Build toward the demo loop (SPEC.md, "The demo") first. If something isn't on the shortest path, it waits.

## Open questions
1. ~~Photon SDK~~ **Answered:** use `@photon-ai/api` (Beta client, Node 22+). Receive via Socket.IO WebSocket (no public URL needed); webhooks need a public HTTPS tunnel. Verified on the real line (2026-11-13): text and photo arrive over the WebSocket (`message.received`, `data.object`); a photo is `content.attachmentId` and downloads with `photon.projects.downloadAttachment` (returns a Blob); text replies via `sendMessage` work; the typing indicator is NOT supported on the shared line (`UNSUPPORTED_CONTENT`). An unprompted text into the existing thread (no fresh inbound) was delivered as a normal iMessage. Not yet verified: image upload.
2. **Agent hosting:** a long-running process (assumed) or serverless webhooks? It depends on Q1.
3. **Photon billing:** free, or "paid usage billed separately"? Shared-line assignment "uses plan capacity"; check the dashboard billing page.
4. **Bedrock model access:** done in the Bedrock console (us-east-1): use-case form submitted. Verified from code with IAM access keys: Haiku 4.5 and Sonnet 4.6 work; Haiku 5.5 and Sonnet 5.5 are access-denied (retest later). See DECISIONS #41.
5. **Staged syllabus photo:** which real syllabus to use? iMessage may re-compress images, so match by "demo mode + first image" rather than by hash (assumed).
6. **Mastery numbers:** Ch. 5 starts at 50% and drops to 35% (assumed). OK?
7. **Judge QR flow:** same Photon line as the main demo, or a separate one?
8. **Event rules:** demo video length (2 minutes?), public repo created during the event. (Confirmed: one project can enter all 4 tracks.)
9. **Missing grade weights:** where do they come from when a syllabus doesn't list them? (Assumed: ask by text.)

## Tasks
| # | Task | Done when | Depends on | Owner | Demo-critical |
|---|---|---|---|---|---|
| 1 | Photon hello world | Your iPhone texts the line and gets a reply. A photo sent arrives at the server as bytes/URL. A typing indicator shows. The agent can send an unprompted text into the existing thread. | Photon signup | | yes |
| 2 | Walking skeleton on canned data (DONE: `npm run demo:loop`, 27 tests pass; real Photon/Bedrock wiring is the next step) | `pnpm demo:loop` (or a hidden control) runs Scout → quiz → "B" → follow-up → proposal → "YES" → calendar event, end to end, with fake LLM, fake calendar, and in-memory store | 1 (can start before 1 lands, using a fake Photon) | | yes |
| 3 | Real Tutor + mastery + priority (DONE for real syllabi too: the model writes questions on the syllabus's readings, code validates/shuffles, an independent call double-checks each key; `npm run questions`) | A/B/C graded in code, mastery formula unit-tested, priority score unit-tested, Socratic follow-up from Claude (Haiku 5.5) with canned fallback, 2-miss reveal | 2 | | yes |
| 4 | Planner + approve path + Google Calendar | Mastery drop triggers createProposal. YES / dashboard Approve writes the event to the demo Google account. NO and "maybe" never write. | 3 | | yes |
| 5 | Demo states + hidden controls | Day 1 / Week 6 seed, staged parse, Send quiz now, Run Scout now, Switch to Week 6, and Reset all work. Controls bypass quiet hours and caps. | 2 | | yes |
| 6 | Dashboard (BUILT, runs locally: `npm run dev -w @syllabus-crew/web`; open `/?key=<DEMO_ADMIN_TOKEN>` as presenter; `/demo` has the hidden controls. Not deployed: the agent runs on the laptop, so for the stage demo run the dashboard locally too; Vercel would need a tunnel to the agent) | Semester view, exam card with mastery bars, proposal cards with Approve / Not now. Updates within ~3s. | 2 | | yes |
| 7 | Swap the in-memory store for DynamoDB | Same repo interface, tables created by script, demo reset works against Dynamo | 2 | | no (Amazon track) |
| 8 | Real syllabus parsing (3a DONE: reader + validation + conversion. 3b-1/2 DONE: dashboard `/upload` (PDF or page images) -> agent reads -> texts the summary -> asks missing things one at a time, answers understood in code. 3b-3 TODO: multi-image syllabi sent over iMessage (needs Photon attachment download + a short wait to collect pages). The staged parse still handles a photo texted on Day 1.) | Textract → LLM → schema-validated JSON on 5 real syllabi. Asks only about missing fields. | 7 | | no (step 0 is staged) |
| 9 | Scout: iCal import + change detection | Fake `.ics` served by the dashboard. Editing it and running Scout texts "Exam 2 moved". Real Brightspace feed parses. | 7 | | step 6 only |
| 10 | Scheduler + quiet hours + caps | Morning quiz, nightly Planner, Scout several times a day. 11pm-8am block and 3/day caps tested in code. | 3, 4 | | no |
| 11 | Nudger + scheduler (DONE: policy in core, reminders, morning quiz, nudges with YES/NO, mute/resume, backoff, dry-run default; 164 tests) | Requested reminders always delivered. Stakes-scaled and mastery-aware nudges. Backs off after 2 ignored nudges. | 10 | | no |
| 12 | Ship: README (DONE), deck, backup video | Architecture diagram, setup steps, competitor + stack slides, full-loop video recorded | 4, 5, 6 | | yes |

### Task 1 detail: Photon hello world
- Sign up at photon.codes/beta, create a project, and add the iMessage channel. Read the beta docs (Q1) before writing code.
- Write a minimal Node/TS server: on an inbound message, show typing, then echo the text. On an image, log the URL/size and download it.
- Test outbound in an existing thread: a CLI script sends "test" to your number without an inbound message first.
- Build the onboarding link `sms:<line>&body=Hi%20Syllabus%20Crew` plus a QR code. Exchange 3+ messages from your phone right away (deliverability).
- Wrap Photon behind a `Messenger` interface (`send`, `onMessage`, `typing`) so tasks 2+ can use a fake one.

### Task 2 detail: Walking skeleton
- Repo layout (assumed): `apps/agent` (Node/TS), `apps/web` (Next.js), `packages/core` (types, store interface, pure logic), `agents/*.md` (rules per agent), `seed/` (demo states, slides, `.ics`).
- Stubs: Crew Lead router (code-first reply matcher for A/B/C, YES/NO, then a fake classifier), Scout, Tutor, Planner, Nudger. Each returns canned output.
- Fakes: `FakeLLM` (canned responses), `FakeCalendar` (writes to store), `FakeMessenger` (prints to console), `MemoryStore`.
- Pending-reply state: one open item per student (quiz or proposal). The matcher resolves replies against it. Unclear replies get a clarifying text.
- Agent loop (~50 lines): Claude tool use via the Anthropic Bedrock SDK, behind an `LLM` interface. Use the fake for now.
- Demo control HTTP endpoints, protected by `DEMO_ADMIN_TOKEN`.

### Task 3 detail: Real Tutor
- `grade(answer, question)`, `updateMastery(m, correct)`, `priority(topic, exam, now)` in `packages/core`, with unit tests.
- Tutor rules in `agents/tutor.md`: no reveal on the first miss, one Socratic question, reveal + one-line explanation after 2 misses.
- The demo question comes from `seed/week6-slides`. Generated questions are used outside the demo.
- Bedrock call with a timeout (~4s) and a canned fallback, so stage Wi-Fi can't stall a reply.

## Shortest path to the demo
1 → 2 → 3 → 4 → 5 → 6 (minimal: exam card + proposal card) → 12 (backup video).
Everything else (7-11) adds track credibility but isn't needed on stage.

## Setup checklist
| Account or key | Needed for | Who | Status |
|---|---|---|---|
| Photon 2.0 beta account, project, iMessage line | Task 1, everything | | todo |
| AWS account + $20 budget alert | Bedrock, Textract, DynamoDB, EventBridge | | todo |
| Bedrock model access: Haiku 4.5 + Sonnet 4.6 (working); Haiku 5.5 blocked | Tasks 3, 4, 8, 11 | | todo |
| IAM user/keys for local dev | Agent server | | todo |
| Google Cloud project: Calendar API + OAuth client (testing mode) | Task 4 | | todo |
| Demo Google account with a tidy exam week | Demo step 5 | | todo |
| Vercel account | Dashboard | | todo |
| Public GitHub repo (created during event) | Submission | | todo |
| Real Brightspace iCal feed URL | Task 9 testing | | todo |
| Voice provider (Retell / ElevenLabs / LiveKit / Twilio) + Photon SMS number | Stretch only | | later |

## Cut first if time runs out
1. Voice, Gmail, heatmap, PDF upload, SES (all stretch)
2. Nudger (11). Keep only "remind me Sunday..." if anything.
3. Short-answer questions (A/B/C only)
4. Real syllabus parsing (8). Step 0 stays staged.
5. DynamoDB (7). Stay in-memory and say "DynamoDB-ready" only if true. Prefer keeping it for the Amazon track.
6. Demo step 6 (exam moved), which also lets Scout (9) slip

Never cut: Tutor, mastery drop, Planner proposal, YES → calendar, demo controls, backup video.
