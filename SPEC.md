# Syllabus Crew: SPEC

## One-liner
A personal agent for students that lives in iMessage (via Photon 2.0). It reads your syllabus and LMS calendar, texts you quiz questions on your weak spots, and proposes changes to your week. It asks before it acts.

"Study apps wait for you to open them. Syllabus Crew texts you."

## Who it's for
College students taking 4-5 courses at once.

## The demo (2 minutes)
Builder's iPhone (mirrored with QuickTime) next to the web dashboard on the laptop.

0. **Day 1:** text a photo of the Macro syllabus. The agent replies "Got it. Exam 2 is 25% and covers chapters 4-6..." and the dashboard fills in. This step is staged: the parse is pre-loaded. "Fast forward to week 6."
1. **Week 6:** Scout texts: "Prof. Lee posted Week 6 slides."
2. Tutor texts a Ch. 5 A/B/C question taken from those slides.
3. The student replies "B" (wrong). The agent answers with a Socratic follow-up, not the answer. The Ch. 5 mastery bar on the dashboard drops.
4. Planner texts: "Exam 2 is 25% and chapter 5 is your weak spot. Add 30 min review Tuesday? Reply YES or NO." The same proposal appears as a dashboard card.
5. The student replies "YES". The event appears in Google Calendar.

Close: "Your quiz answers just rewrote your calendar. Nobody opened an app."

## User journey
1. Scan the QR code or tap the sms: link. Messages opens with "Hi Syllabus Crew" pre-filled. The student sends it, so the student always texts first.
2. The agent asks for syllabus photos. The student sends them and the agent parses them (Textract, then LLM, then schema check). It asks only about what's missing.
3. Each morning, up to 3 quiz texts arrive on the topics with the most at stake. The student replies A/B/C or a short answer.
4. The Planner texts proposals, and the student replies YES or NO. YES writes to Google Calendar, or to the dashboard if Google isn't connected.
5. Scout re-checks the iCal feed and texts only when something changed. The Nudger sends reminders: ones the student asked for, ones scaled by stakes, and ones aware of mastery.
6. The student can text anything anytime: "what should I focus on?", "remind me Sunday...", or a photo of slides.

## Scope
| Feature | must / maybe / cut | Why |
|---|---|---|
| Photon iMessage: inbound, outbound, images, typing, sms: onboarding | must | Required for the Photon track; the whole product lives there |
| Crew Lead router + code-level A/B/C and YES/NO matching | must | Replies must map to the right pending item |
| Tutor: A/B/C quizzes, Socratic follow-up, mastery, priority score | must | Main feature; the core of the loop |
| Planner: proposals; calendar write only through the approve path | must | Closes the loop; safety story |
| Google Calendar write on approval | must | Step 5 of the demo |
| Dashboard: semester view, exam card + mastery bars, proposal cards, live updates | must | What judges look at |
| Demo support: Day 1 / Week 6 states, staged parse, hidden controls, reset | must | The demo can't depend on live parsing |
| Syllabus photo parsing (real Textract + LLM) | must | Setup promise (demo step 0 is staged) |
| Scout: iCal feed + change detection | must | Proactive agent; demo step 6 |
| Nudger: requested / stakes / mastery reminders | must | 4th agent; lowest of the musts |
| Quiet hours, daily caps | must | Safety, deliverability |
| README + architecture diagram | must | Required documentation |
| Short-answer questions graded by the LLM | maybe | Nice mix; A/B/C covers the demo |
| Voice quiz on Photon SMS number | maybe | Unlocks the Voice track; stretch #1 |
| Gmail read-only scan | maybe | Real version of the staged slides moment |
| Crunch-week heatmap | maybe | Visual for step 0 |
| PDF upload on dashboard, SES weekly recap | maybe | Low priority |
| PWA/push, polls/tapbacks, group chats, Grade Forecaster, Office Hours agent, Canvas API, Telegram/Discord, native app | cut | Decided in the brief |

## Assumptions
- Assumed: one demo student, identified by phone number. Real accounts are an open question.
- Assumed: the dashboard link is an unguessable per-student URL, with no login.
- Assumed: the demo quiz question and the "Week 6 slides" are fixed seed data, not generated live, so the content is guaranteed.
- Assumed: the Socratic follow-up and the proposal text are written live by the LLM, with a canned fallback if Bedrock is slow.
- Assumed: mastery update is a fixed formula in code (wrong: m × 0.7; right: m + (1 − m) × 0.3). Ch. 5 goes from 50% to 35%.
- Assumed: priority = grade weight × (1 − mastery) × urgency, where urgency = 1 / max(1, days until exam).
- Assumed: quiet hours use America/New_York.
