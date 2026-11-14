# Demo script: Syllabus Crew (2 minutes, stage)

Setup before you walk up: agent and dashboard running, `/demo` open on the laptop (no key needed), iPhone mirrored via QuickTime, thread open to the line (+1 628 502 3837), Google Calendar open on the exam week, Wi-Fi tested.
Fallback if anything stalls: play the backup video, say "same flow, recorded earlier".

## Reset (before every run)
1. `/demo` -> **Reset demo**. Wait for the confirmation. The dashboard thread clears and Google Calendar loses any events from the last run.

## Optional opening (not rehearsed yet): the agent texts first
After Reset, press **Say hello** on `/demo`. The agent introduces itself and asks for a name, then a vibe (CHILL / STRICT / HYPE), then which class worries you most. Then send the PDF as in beat 1. Skip this and start at beat 1 if time is short.

## Beats (what you do -> what the room sees -> what you say)

| # | You do | Phone / screen shows | Say (one line) |
|---|---|---|---|
| 0 | Open on the phone thread | Empty thread | "Every student has a syllabus they never reread. This is an agent that lives in iMessage." |
| 1 | Attach `seed/macro-syllabus.pdf` in Messages and send it (AirDrop it to the phone first; save it in Files) | "Got it, reading your syllabus…", then about 10 s later the real summary: ECON 201, final exam 30%, heavy week | "I just sent the PDF of my syllabus. That's the whole setup. It read it: weights, dates, the heavy week." |
| 2 | Wait for the summary text, then `/demo` -> **Switch to Week 6** | Dashboard flips to Week 6, exam card appears | "Fast-forward to week six." |
| 3 | `/demo` -> **Run Scout now** | Phone buzzes: "Prof. Lee posted Week 6 slides" plus a chapter 5 A/B/C question (correct answer A, demo answer B) | "A new slide deck dropped, so it quizzes me before the exam." |
| 4 | Reply **B** (the wrong answer) | Socratic hint, not the answer; mastery bar drops on the dashboard | "Wrong answer. It asks a question back instead of telling me. Grading and mastery math are code, not the model." |
| 5 | Read the proposal text | Study block proposal with times, "reply YES" | "Weak topic plus a heavy exam, so it proposes study time. It cannot touch my calendar on its own." |
| 6 | Reply **YES** | Confirmation text; Google Calendar event appears | "Only my YES writes to the calendar. There it is." |
| 7 | Show dashboard (exam card, mastery, timeline) | Mastery bars, proposal approved | "Same state, mirrored for a human." |

Close (10 sec): "Photon for the iMessage line, Claude on Amazon Bedrock, Google Calendar on approval. It reads real syllabi, follows rule-bound nudges, and never texts a student who hasn't texted first."

## Rehearsal log (3 clean runs in a row, no fixes between)
Runs 1-3 used the photo (saved copy). Beat 1 is now the real PDF read: rehearse it again.
| Run | Date/time | Clean? | Notes |
|---|---|---|---|
| 1 | Nov 14, ~1:40 AM ET | Yes | All beats worked on the real iPhone and Google Calendar. |
| 2 | Nov 14, ~1:50 AM ET | Yes | Reset also removed the previous calendar event. |
| 3 | Nov 14, ~2:00 AM ET | Yes | Three clean runs in a row, no fixes between. |

## If something goes wrong
- The PDF read takes longer than 20 s (busy AI service): keep talking over it; if nothing after 45 s, text the photo `seed/macro-syllabus.jpg` instead, which loads the same course instantly from a saved copy (say so if asked).
- No reply in 10 s: say "Wi-Fi, one second", check the agent log, resend once. Don't resend twice.
- Odd model wording: keep going. The rules (YES-only writes, grading in code) are the point.
- Calendar event missing: the dashboard Approve button takes the same write path; show the dashboard calendar panel.
- Total failure: backup video.

## Honest limits to say if asked
Questions come from model knowledge of the reading, not the reading's text. Scout reads a staged inbox in the demo. The agent runs on the laptop; DynamoDB, EventBridge and Textract are the production plan.
