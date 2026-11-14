# Handoff: where the project stands

Read this first when resuming. Last updated at commit 68bbd93 (Nov 14, ~1:30 AM ET). 189 tests pass (`npm test -w @syllabus-crew/core -w @syllabus-crew/agent`).
Details live in SPEC.md, PLAN.md, DECISIONS.md (92+ numbered decisions), README.md, CLAUDE.md (hard rules).

## What is built and confirmed on the real iPhone
- Photon iMessage in/out (shared line +1 628 502 3837; no typing indicator on shared lines; photos arrive as attachmentId).
- The staged Macro stage demo loop: photo -> Day 1 parse (stored) -> Switch to Week 6 -> Scout -> quiz -> wrong answer -> Socratic hint -> proposal -> YES -> real Google Calendar event.
- Real syllabus: upload PDF/images at /upload -> Claude (Sonnet 4.6 on Bedrock) reads -> code validates, computes weights/weeks/crunch -> agent texts summary and asks missing things one at a time (answers parsed in code).
- Real Tutor: model writes questions on the syllabus readings, code validates/shuffles, an independent call double-checks keys. Practice rounds (quiz me -> 5 questions, auto-continue), hint / skip / stop / idk handling.
- Scheduler + Nudger: pure policy in packages/core/src/nudger.ts; reminders ("remind me Sunday to ..."), morning quiz, stakes-scaled nudges with YES/NO, pause/stop/resume. Scheduler runs in DRY mode by default.
- Dashboard (Next.js): exam cards, mastery bars, timeline, proposals, reminders, thread, /demo controls, /upload, /join (QR).
- Naming + vibe (tests only, NOT yet tried on the real iPhone): the student names the agent, picks chill / strict / hype, answers one question; rename and vibe change any time. Default name is `DEFAULT_AGENT_NAME` in packages/core/src/naming.ts ("Syl", chosen by the user).
- A texted PDF syllabus is read for real, always (confirmed on the real iPhone with a real PDF; DECISIONS #97-98). A texted photo is still the staged Macro shortcut for the stage demo.
- "Say hello" control on /demo: the agent texts first (DECISIONS #94).
- New look ("Study Desk", DECISIONS #95): characters, phone-framed thread with sender labels, scroll-revealed crew tree, "Meet the crew" tabs.

## Run it
- Agent: `npm run start -w @syllabus-crew/agent` (127.0.0.1:8787). Dashboard: `npm run dev -w @syllabus-crew/web` (localhost:3000).
- Secrets only in `.env` and `.data/` (both gitignored). Variable names are in README "Setup". The agent needs `DEMO_ADMIN_TOKEN`; the dashboard has no key (it listens on this machine only; DECISIONS #96).
- Open controls: `open http://localhost:3000/demo` (also linked from the dashboard header).
- Scheduler: `SCHEDULER=off|dry|on` in .env (default dry = logs only). Set `on` to let it text for real; restart the agent after changing .env.
- Models: Haiku 4.5 default, Sonnet 4.6 for syllabus/questions (`us.anthropic...` inference-profile IDs; Haiku/Sonnet 5.5 are blocked on this AWS account). Bedrock via IAM keys (long-term API keys are blocked by an account policy).
- Google: calendar.events scope only; test-mode token expires after ~7 days (reconnect at `http://127.0.0.1:8787/auth/google?token=<DEMO_ADMIN_TOKEN>` the week of the event).

## State of the demo student right now
The student record is on the REAL syllabus (a humanities seminar; `seed/private/real-syllabus.pdf`, gitignored). For the Macro stage demo: press Reset demo (and re-upload the real syllabus afterwards if wanted). Reset deletes the calendar events the demo created.

## Stage demo checklist (brief section 16)
Reset demo -> text `seed/macro-syllabus.jpg` (any first image works; staged parse) -> Switch to Week 6 -> Run Scout now -> reply B -> (hint + proposal) -> reply YES -> check Google Calendar -> Reset demo. Run it 3 times in a row; record a backup video; test QuickTime mirroring on the projector.

## Not done yet (suggested order)
- The summary text's dashboard link stays for now; the user wants it to become a hosted HTML page later (a phone cannot open localhost).
- Voice drills: blocked until a card is on file in Photon (number purchase returned 402 ENTITLEMENT_REQUIRED, purchaseRefusal payment_method_required).
- DynamoDB: SKIPPED (user decision). Code is built and tested but the event AWS account blocks DynamoDB with an organization service control policy (explicit deny), which no IAM policy can override. Say so honestly on the deck.
1. Stage rehearsal x3 + a one-page demo script + backup video.
2. Pitch: deck (competitor slide with the UpAhead screenshot, architecture, AWS stack, evidence from hacker interviews Saturday morning), README polish.
3. DynamoDB store: BUILT (DECISIONS #99), switched on with `STORE=dynamo` after `npm run dynamo:setup -w @syllabus-crew/agent`. Needs the IAM user `hackprinceton` to have DynamoDB permissions on the `syllabus-crew-students` table. Textract/EventBridge need AWS deployment: show on the slide as the production plan.
4. Syllabus screenshots texted over iMessage read for real (needs Photon attachment download via `photon.projects.downloadAttachment`, which works, plus waiting to collect pages). Today the first photo on Day 1 loads the stored Macro parse.
5. Judge QR flow test with a second phone: a shared line only replies to numbers with an assignment (createSharedLineAssignment via the Photon MCP), max 25 seats. Untested with an unassigned number.
6. Stretch: voice (Photon SMS number + SIP provider), Gmail scan, crunch heatmap.

## Repo is public (done)
- Pushed as ONE clean commit. Local-only backup branches `full-history` and `old-main` contain the real phone number: never push them. Never commit .env, .data/, seed/private/.
- Stage demo script and rehearsal log: DEMO-SCRIPT.md.
- Keep `PHOTON_WEBHOOK_SECRET` (unused) out; delete stale vars.

## Known limits (be honest in the pitch)
- Questions come from the model's knowledge of standard works, not the reading's text (obscure readings = weaker questions).
- Scout reads a staged inbox (no Gmail / calendar-feed yet). Nudger wording is templated.
- Agent runs on the laptop; dashboard is local (a Vercel deploy would need a tunnel). EventBridge would need the agent deployed to AWS.
- A new AWS account throttles Bedrock (429s); the client retries up to 6 times.

## Working style that has worked
Step by step; the user tests every change on their real iPhone and sends screenshots; fix what the screenshots show; commit after each verified step; never print secrets.
