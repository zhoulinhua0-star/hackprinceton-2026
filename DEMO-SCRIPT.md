# Demo script: Syllabus Crew (2 minutes, stage)

The story is the ten-minute walk (`PITCH.md` §1–2): one question on the way to class, one tap, a proposal, YES, a calendar event.
Setup before you walk up: agent and dashboard running, `/demo` open on the laptop, iPhone mirrored via QuickTime, thread open to the line (+1 628 502 3837), Google Calendar open on the coming week, Wi-Fi tested.

## Setup (before every run, about 3 minutes)
1. `/demo` → **Reset demo**. This clears the course, so the syllabus goes in again (next step). It also removes calendar events from the last run.
2. Text the real syllabus PDF from your phone. Answer any question Syl asks (a missing date, the term start).
3. `/demo` → **Write quiz questions**. Wait about a minute, until the agent log or dashboard shows them ready.
4. Check on the dashboard that the next exam is **at least 2 days away**. The Planner needs a free slot before it, or it won't propose.
5. Don't answer anything else in the thread. Every topic should still be at 50%, so one miss drops it to 35% and brings the proposal.

Why a reset every run: the Planner proposes once per topic, and a NO blocks that topic for a day.

## Beats (what you do -> what the room sees -> what you say)

| # | You do | Phone shows | Say (one line) |
|---|---|---|---|
| 0 | Hold the phone, thread open | The syllabus summary from setup | "It's 12:50, next class in ten minutes, midterm Monday." |
| 1 | Scroll up a little | Syllabus summary + semester link | "I sent it my syllabus once. That's the only setup." |
| 2 | Type **what should I focus on this week?** | "Focus on [topic]: you're at 50%, and [exam] is N% of your grade in N days." | "That's code: weight, mastery, days left." |
| 3 | Laptop: `/demo` → **Send quiz now** | Phone buzzes: one A/B/C question | "When it's worth it, Syl texts first." |
| 4 | Tap a **wrong** letter | A question back, not the answer | "It asks me back instead of telling me." |
| 5 | Wait about 2 s | "[exam] is N% and [topic] is your weak spot. Want me to add 30 minutes of review on [day]? Reply YES or NO." + week link | "Weak topic, big exam: it offers a free slot." |
| 6 | Reply **YES** | "Done. [day, time]…" + Booked link; the event appears in Google Calendar | "Only my YES writes it. There it is." |
| 7 | Answer the question correctly | "Back to the question…", then it confirms and explains | "And it picks the question back up." |
| 8 | Close | | "Ten minutes of walking: ready-check, weak spot fixed, on my calendar. That's one slice." |

Close (10 sec): the one-slice line from `PITCH.md` (slides, rounds with a recap page, reminders, quiet hours, CALL), then "Study apps wait for you to open them. Syl texts you."

## Rehearsal log (3 clean runs in a row, no fixes between)
Runs 1-3 were the older Week 6 flow on the demo course. The ten-minute walk on the real syllabus still needs its own runs.
| Run | Date/time | Clean? | Notes |
|---|---|---|---|
| 1 | Nov 14, ~1:40 AM ET | Yes | All beats worked on the real iPhone and Google Calendar. |
| 2 | Nov 14, ~1:50 AM ET | Yes | Reset also removed the previous calendar event. |
| 3 | Nov 14, ~2:00 AM ET | Yes | Three clean runs in a row, no fixes between. |

## If something goes wrong
- No proposal after the miss: the topic was already below 50%, or there's no free slot before the exam. Say "it only offers when there's a free slot," then book one by text: "book me 30 minutes for [topic] on [day] at 4" (the Planner still asks for YES).
- No question after **Send quiz now**: the questions aren't written yet (setup step 3), or one is already open. Text "quiz me" from the phone instead.
- No reply in 10 s: say "Wi-Fi, one second", check the agent log, resend once. Don't resend twice.
- Calendar event missing: the dashboard Approve button takes the same write path; show the dashboard calendar panel.
- Odd model wording in the hint: keep going. The rules (YES-only writes, grading in code) are the point.

## Honest limits to say if asked
Questions come from model knowledge of the topic, not the reading's own text. Syl knows the graded items, dates, weights and topics from the syllabus, not each class's reading. On stage you trigger the first question; in real use the Nudger decides when, inside its rules. The agent runs on the laptop; DynamoDB, EventBridge and Textract are the production plan.
