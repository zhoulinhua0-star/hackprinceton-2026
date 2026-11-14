# Handoff: where the project stands

Read this first when resuming. Last updated at commit 7eb9ac6 (Nov 14, ~2:30 PM ET), pushed to GitHub. 205 tests pass (`npm test -w @syllabus-crew/core -w @syllabus-crew/agent`: 66 core + 139 agent); all 3 workspaces typecheck (`npm run typecheck --workspaces --if-present`).
Details live in SPEC.md, PLAN.md, DECISIONS.md (104 numbered decisions), README.md, CLAUDE.md (hard rules), DEMO-SCRIPT.md (stage run).

## What is built and confirmed on the real iPhone
- Photon iMessage in/out (shared line +1 628 502 3837; no typing indicator on shared lines; files arrive as attachmentId and download).
- Stage demo loop (DEMO-SCRIPT.md): Reset -> text `seed/macro-syllabus.pdf` (REAL read, ~7-10 s) -> wait for the summary -> Switch to Week 6 -> Run Scout now -> quiz -> B -> Socratic hint -> proposal (with exact date) -> YES -> real Google Calendar event. A read that finishes after Week 6/Reset is dropped (#102). The photo `seed/macro-syllabus.jpg` is the instant saved-copy fallback.
- Real syllabus: a texted PDF is always read for real (#97-98); also /upload. Claude Sonnet 4.6 reads, code validates and does the math, asks missing things one at a time.
- Tutor: written + double-checked questions, rounds, hint/skip/stop/idk. Free chat sees the recent thread and the last question; a quiz offer it makes is answerable by YES; it may never claim to have booked anything (#101).
- Planner: "book me a study block / schedule chapter 4 review Tuesday 3pm for an hour" makes a real proposal; "make it Monday at 2pm" moves it; only YES books it; texts show the exact date ("Tuesday, Nov 17") (#101).
- Contact card (#105): after the vibe, the agent texts a .vcf with the chosen name + the Bubble avatar; Create New Contact makes the header show the face. Not yet confirmed on the real phone.
- Naming + vibe: agent texts first via the /demo "Say hello" control (#94), asks name (default "Syl"), vibe (chill/strict/hype), which class worries you most. Rename / vibe change any time (#93).
- Voice drills (#103-104), part of the Tutor: /demo "Offer a voice drill" texts "...Reply CALL"; CALL / "drill me" / "call me" rings from +1 609 785 4521 (Photon SIP number) through the ElevenLabs agent "Syl voice drill"; the server polls the call, Claude grades the transcript against key points, mastery changes in code, the recap text spells out the answer. One hint, then the agent explains the answer. Rules: only after CALL, 9am-8pm, one a day, one at a time, 10-min timeout (demo number exempt). Dashboard drill card.
- Scheduler + Nudger (DRY mode by default), reminders, pause/resume.
- Dashboard "Study Desk" look (#95): characters, phone-framed thread with sender labels, scroll-revealed crew tree, Meet the crew tabs, drill card. No presenter key (#96). The user added a campus background image.

## Run it
- Agent: `npm run start -w @syllabus-crew/agent` (127.0.0.1:8787; log line says "voice drills on/off"). Dashboard: `npm run dev -w @syllabus-crew/web` (localhost:3000). Both must be running; the user can ask Claude to start them.
- Secrets only in `.env` and `.data/` (gitignored). Read .env by NAME only. Voice needs `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_PHONE_NUMBER_ID` (all set), `PHOTON_VOICE_NUMBER=+16097854521`.
- Controls: http://localhost:3000/demo (also linked from the dashboard header).
- The voice agent's prompt lives in ElevenLabs; the source of truth is `agents/voice-drill.md` (updated through the API with the ElevenAgents-write key). Grading/writing rules: `agents/voice-drill-grader.md`, `agents/voice-drill-writer.md`.
- Models: Haiku 4.5 default, Sonnet 4.6 for syllabus/questions/drills (`us.anthropic...` IDs). Google token expires ~7 days after connecting.

## Costs running
- Photon voice number $2/month (card on file in Photon); calls ~$0.013/min. Cancel after the event. ElevenLabs agent minutes from the user's plan. Bedrock a few cents per read/grade.

## Not done yet (user's order)
1. The user's own product changes (they said they'd list them).
2. Pitch deck (competitor slide with UpAhead, architecture, AWS stack: Bedrock live, DynamoDB built but blocked by the event account's org policy; voice drills; evidence from hacker interviews).
3. Judge QR test with a second phone (LAST): a shared line only replies to assigned numbers (createSharedLineAssignment via Photon MCP, 25 seats). Expected: friend scans /join, sends "Hi Syllabus Crew", gets the intro and name question.
4. Later: replace the localhost dashboard link in the summary text with a hosted HTML page (user wants this); rotate the Photon outbound SIP password (it appeared in a screenshot in chat) and update ElevenLabs.
- Rehearse the new PDF beat 1 of DEMO-SCRIPT.md again (runs 1-3 used the photo). No backup video (user decision).
- DynamoDB: SKIPPED (#99): code works (`STORE=dynamo`), but an AWS Organizations service control policy denies DynamoDB on the event account.

## Repo
- Public GitHub `zhoulinhua0-star/hackprinceton-2026`, `main` from one clean root commit. Local-only branches `full-history` and `old-main` contain the real phone number: NEVER push them. Never commit .env, .data/, seed/private/.

## Known limits (be honest in the pitch)
- Questions come from the model's knowledge of the reading, not its text. Scout reads a staged inbox. Nudger wording is templated.
- Agent runs on the laptop; dashboard is local. One agent process assumed.
- Voice drills: grading is the model's judgment of the transcript (keyword fallback); the call needs the laptop online.

## Working style that has worked
Step by step; the user tests every change on their real iPhone and sends screenshots; fix what the screenshots show (check transcripts/logs before claiming a cause); add a regression test; commit only when asked; never print secrets; give click-by-click instructions for dashboards (Photon, ElevenLabs, AWS).
