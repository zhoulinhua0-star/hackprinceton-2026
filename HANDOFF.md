# Handoff: where the project stands

Read this first when resuming. Last updated at commit 68bbd93 (Nov 14, ~1:30 AM ET). 169 tests pass (`npm test -w @syllabus-crew/core -w @syllabus-crew/agent`).
Details live in SPEC.md, PLAN.md, DECISIONS.md (92+ numbered decisions), README.md, CLAUDE.md (hard rules).

## What is built and confirmed on the real iPhone
- Photon iMessage in/out (shared line +1 628 502 3837; no typing indicator on shared lines; photos arrive as attachmentId).
- The staged Macro stage demo loop: photo -> Day 1 parse (stored) -> Switch to Week 6 -> Scout -> quiz -> wrong answer -> Socratic hint -> proposal -> YES -> real Google Calendar event.
- Real syllabus: upload PDF/images at /upload (presenter key) -> Claude (Sonnet 4.6 on Bedrock) reads -> code validates, computes weights/weeks/crunch -> agent texts summary and asks missing things one at a time (answers parsed in code).
- Real Tutor: model writes questions on the syllabus readings, code validates/shuffles, an independent call double-checks keys. Practice rounds (quiz me -> 5 questions, auto-continue), hint / skip / stop / idk handling.
- Scheduler + Nudger: pure policy in packages/core/src/nudger.ts; reminders ("remind me Sunday to ..."), morning quiz, stakes-scaled nudges with YES/NO, pause/stop/resume. Scheduler runs in DRY mode by default.
- Dashboard (Next.js): exam cards, mastery bars, timeline, proposals, reminders, thread, /demo controls, /upload, /join (QR).

## Run it
- Agent: `npm run start -w @syllabus-crew/agent` (127.0.0.1:8787). Dashboard: `npm run dev -w @syllabus-crew/web` (localhost:3000).
- Secrets only in `.env` and `.data/` (both gitignored). Variable names are in README "Setup". Two secrets: `DEMO_ADMIN_TOKEN` (agent) and `PRESENTER_KEY` (dashboard).
- Open controls: `open "http://localhost:3000/demo?key=$(grep '^PRESENTER_KEY=' .env | cut -d= -f2)"` (same pattern for /upload).
- Scheduler: `SCHEDULER=off|dry|on` in .env (default dry = logs only). Set `on` to let it text for real; restart the agent after changing .env.
- Models: Haiku 4.5 default, Sonnet 4.6 for syllabus/questions (`us.anthropic...` inference-profile IDs; Haiku/Sonnet 5.5 are blocked on this AWS account). Bedrock via IAM keys (long-term API keys are blocked by an account policy).
- Google: calendar.events scope only; test-mode token expires after ~7 days (reconnect at `http://127.0.0.1:8787/auth/google?token=<DEMO_ADMIN_TOKEN>` the week of the event).

## State of the demo student right now
The student record is on the REAL syllabus (a humanities seminar; `seed/private/real-syllabus.pdf`, gitignored). For the Macro stage demo: press Reset demo (and re-upload the real syllabus afterwards if wanted). Reset deletes the calendar events the demo created.

## Stage demo checklist (brief section 16)
Reset demo -> text `seed/macro-syllabus.jpg` (any first image works; staged parse) -> Switch to Week 6 -> Run Scout now -> reply B -> (hint + proposal) -> reply YES -> check Google Calendar -> Reset demo. Run it 3 times in a row; record a backup video; test QuickTime mirroring on the projector.

## Not done yet (suggested order)
1. Stage rehearsal x3 + a one-page demo script + backup video.
2. Pitch: deck (competitor slide with the UpAhead screenshot, architecture, AWS stack, evidence from hacker interviews Saturday morning), README polish.
3. DynamoDB store (Amazon track; store interface is `Store` in packages/core; FileStore is in apps/agent/src/adapters). Textract/EventBridge need AWS deployment: show on the slide as the production plan.
4. Syllabus screenshots texted over iMessage read for real (needs Photon attachment download via `photon.projects.downloadAttachment`, which works, plus waiting to collect pages). Today the first photo on Day 1 loads the stored Macro parse.
5. Judge QR flow test with a second phone: a shared line only replies to numbers with an assignment (createSharedLineAssignment via the Photon MCP), max 25 seats. Untested with an unassigned number.
6. Stretch: voice (Photon SMS number + SIP provider), Gmail scan, crunch heatmap.

## Before the repo goes public
- Rewrite history or publish a fresh squashed repo: early commits contain the presenter's real phone number (already removed from files). Never commit .env, .data/, seed/private/.
- Keep `PHOTON_WEBHOOK_SECRET` (unused) out; delete stale vars.

## Known limits (be honest in the pitch)
- Questions come from the model's knowledge of standard works, not the reading's text (obscure readings = weaker questions).
- Scout reads a staged inbox (no Gmail / calendar-feed yet). Nudger wording is templated.
- Agent runs on the laptop; dashboard is local (a Vercel deploy would need a tunnel). EventBridge would need the agent deployed to AWS.
- A new AWS account throttles Bedrock (429s); the client retries up to 6 times.

## Working style that has worked
Step by step; the user tests every change on their real iPhone and sends screenshots; fix what the screenshots show; commit after each verified step; never print secrets.
