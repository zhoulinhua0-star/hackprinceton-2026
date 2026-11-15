# PITCH: Syllabus Crew

HackPrinceton Fall 2026. Tracks: Photon iMessage, Amazon "Best Practical AI", Education.
Everything here is checked against the code. Items marked **[YOU]** are facts only you can fill in. Say a claim on stage only if the demo shows it or the code does it.

The stage beats are in `DEMO-SCRIPT.md`; the 2-minute walk-through video is shot by shot in `VIDEO-SCRIPT.md`. This file covers what to *say*, the deck, the "on your phone" step at the table, and judges' questions.

---

## 1. The story: the ten-minute walk

One feature, told as one moment every student knows. Everything else Syl does gets one sentence at the end.

> It's 12:50. You just walked out of lecture, and your next class is ten minutes away across campus. Your midterm is Monday and it's 25% of your grade.
> The old way: find a seat in a café, open the syllabus PDF, work out what's on the exam, quiz yourself, open your calendar, find an hour. Fifteen minutes you don't have.
> With Syl, you do it on the walk, with your thumb.

**The line (hook and close):** "Study apps wait for you to open them. Syl texts you."

**One sentence if asked what it is:** *a study agent in iMessage that reads your syllabus, checks whether you're ready, and asks before it puts review time on your calendar.*

**Why this framing works:**
- It's concrete: a real ten-minute gap, a real exam, a real calendar.
- It shows the whole loop in under a minute: a question, one tap, graded in code, a proposal, YES, a calendar event.
- It lands all three Education words without saying them: **personal** (your syllabus, your weak spot), **interactive** (it asks you back), **accessible** (a text and a tap while walking).

---

## 2. Stage pitch (2 minutes, your phone mirrored)

Before you walk up, your real syllabus is already loaded and its questions are written (see `DEMO-SCRIPT.md`, Setup). `[topic]` and `[exam]` are whatever your syllabus produces; read them off the phone.

| Time | Say | Show |
|---|---|---|
| 0:00 | "It's 12:50. You just walked out of lecture, next class in ten minutes, midterm on Monday, 25% of your grade." | Phone, thread open |
| 0:12 | "The old way is a café seat, the syllabus PDF and your calendar app. Fifteen minutes you don't have." | |
| 0:20 | "I sent Syl my syllabus once, at the start of the term. That's the only setup." | Scroll up: the syllabus summary and its link |
| 0:28 | "So on the walk, I just ask." Type **what should I focus on this week?** | "Focus on [topic]: you're at 50%, and [exam] is 25% of your grade in N days." |
| 0:40 | "That answer is code: the grade weight, my mastery and the days left. Not the model guessing." | |
| 0:45 | "And when it's worth it, Syl texts first." (press **Send quiz now** on the laptop) | Phone buzzes: one A/B/C question |
| 0:55 | "One question, one tap. I'll get it wrong." Tap a wrong letter | A question back instead of the answer |
| 1:05 | "It doesn't just tell me. It asks me back, like a good TA." | |
| 1:10 | "Weak topic, big exam, so it offers a slot that's actually free." | "[exam] is 25% and [topic] is your weak spot. Want me to add 30 minutes of review on [day]? Reply YES or NO." + the week link |
| 1:20 | "It can't touch my calendar on its own. Only my YES does." Reply **YES** | "Done. [day, time]…" + the Booked link; Google Calendar shows the event |
| 1:32 | "And it picks the question back up." Answer correctly | "Back to the question…", then it confirms and explains |
| 1:40 | "Ten minutes of walking. I checked I'm ready, fixed a weak spot, and it's on my calendar. No café, no PDF, no calendar app." | |
| 1:48 | "That's one slice. Syl also reads new slides, runs practice rounds with a recap page, sends reminders, and knows when to stay quiet. And if you'd rather talk it through, reply CALL and it phones you." Then the line. | |

**If asked who sent the question:** "In real use the Nudger decides when, inside rules: 9 AM to 8 PM, at most 3 a day, never mid-conversation. On stage I trigger it so you don't wait."

**Don't say:**
- that it books on its own (it proposes; YES books it);
- "A, B, C or D" (questions have three choices);
- that it knows each class's reading (it knows the graded items, dates, weights and topics);
- that it runs in the cloud (it runs on the laptop).

---

## 3. "On your phone" (an offer after the pitch, about 30 seconds)

Not part of the 2 minutes. Offer it only when a judge is curious and there's time.
Tested Nov 14 with a friend's phone: the seat landed on a **different line** (+1 628 316 6196), and replies were fast.

| Step | You do | Their phone shows |
|---|---|---|
| 1 | `npm run seat -- +1 <their number>` (about 5 s) | |
| 2 | Read out the line it prints: "text this number, just say Hi" | |
| 3 | — | Syl says hi and asks for a name, then a vibe |
| 4 | — | The contact card with Syl's face and **their** line. "Tap it, Create New Contact." |
| 5 | Say: **"It's yours now. Send it any syllabus tonight and it'll quiz you."** | |

They carry on later (PDF, summary card, quiz, CALL) and you get your table back. If a judge stays: AirDrop `seed/macro-syllabus.pdf` for their own semester card, then CALL so their phone rings.
For no quiz limits, add their number to `TESTERS` in `.env` and restart the agent (before the table if you know who's coming).
Their calendar is the stand-in. If asked: "on mine it's real Google, because a real student would connect their own account."

**If something fails:**
- No reply after "Hi": check `npm run seat -- list` says "has texted". If it doesn't, they texted the wrong number or sent an SMS (green bubble).
- They texted your line instead of theirs: read out the printed line again.
- "25 of 25 seats": `npm run seat -- release +1...`.
- They went off-script at the vibe ("be romantic"): Syl asks once more, then stays chill.

After the event: release every seat except yours.

---

## 4. Deck (6 slides)

1. **Title.** Syllabus Crew, with the line under it.
2. **The problem.** The syllabus has the stakes (weights, dates) and no one acts on it. One interview quote **[YOU]** plus a number, e.g. "N of M students said…" **[YOU]**.
3. **Live demo: the ten-minute walk.** Just the phone.
4. **How it works.**
   - One iMessage thread.
   - Crew Lead routes every text. Four specialists (Scout, Tutor, Planner, Nudger) work behind it.
   - Claude on Amazon Bedrock: Haiku 4.5 for chat, Sonnet 4.6 for syllabi, questions and drills.
   - Three things we built:
     - **Priority score:** grade weight × weakness × days left decides what you study.
     - **Double-checked questions:** written, then checked before you see them.
     - **YES-gated calendar:** the only code that writes to it runs after a YES.
5. **Built on Photon: what we tried, how we got around it.**
   - Tapbacks are refused on the shared line, so replies stay as plain text.
   - The line's profile can't be set on a shared line, so Syl texts its own contact card with its face.
   - There's no app card in 2.0, so we send tap-to-open link cards with charts.
   - Voice drills on a Photon number through ElevenLabs. The call ends and a recap text follows in the same thread.
6. **What's next, and "text Syl."** Real accounts and per-student Google; Canvas/LMS feeds; production on AWS (DynamoDB is built and blocked only by the event account's policy).

**Competitor (backup slide, or say it if asked):** UpAhead **[YOU: one line on what it does]**. The difference: we're not an app you open. We're in the thread, we text first, and we ask before acting.

---

## 5. One backup slide per track (swap in for that judge)

- **Amazon (Best Practical AI):**
  - Bedrock with two models, chosen per task to balance cost and speed.
  - The model is used for language only. Grading, mastery, priority and timing are code.
  - DynamoDB store built (`STORE=dynamo`), blocked by the event account's org policy.
  - A practical safety story: YES-gated writes, quiet hours, daily limits.
- **Education** (the track asks for personal, interactive, accessible):
  - **Personal:** built from your syllabus; the priority score (grade weight × weakness × days left) picks what you study.
  - **Interactive:** a question back before the answer; the reveal after two misses; reply CALL and explain it out loud on a 3-minute call.
  - **Accessible:** no app or sign-up, just Messages on your iPhone; tap or talk; every recap comes back in writing, with a link.
  - Mastery in code: a miss keeps 70%, a right answer gains 30% of the gap.
- **Photon:**
  - Slide 5 in more depth.
  - Inbound via the Socket.IO stream plus a poll, deduplicated.
  - Attachments both ways (PDF in, vCard out).
  - Per-person lines on a shared pool: each seat's line is remembered (`receivedBy.handle`).
  - A seat command for onboarding.
  - Spacing between texts, and no typing indicator on shared lines.

---

## 6. Questions judges might ask

- **Why iMessage and not an app?** Students already live there, and a text gets read. Study apps wait to be opened.
- **What if the AI is wrong?** Questions are double-checked before sending. Grading is code against a stored answer, and the calendar needs a YES. Honest limit: questions come from the model's knowledge of the topic, not the reading's own text.
- **Privacy?**
  - It only texts people who texted first.
  - Card pages have no name or phone number and aren't indexed.
  - Your calendar is touched only after a YES, and Reset deletes only events the app made.
- **Why several agents and not one prompt?** Different jobs, rules and risks. Only the Planner can propose, and only the approve path can write. Each piece is small and tested (233 tests).
- **Does it spam?** No texts 11pm–8am, at most 3 nudges a day with 4-hour gaps, never mid-conversation, and it backs off after 2 unanswered.
- **Can it run for real users?** The pieces are real: Photon, Bedrock, Google, Vercel cards. What's missing is hosting off the laptop and per-student Google sign-in.

---

## 7. Before stage (check list)

- [ ] Agent and dashboard running. The agent log says `voice drills on; cards on`, and the calendar is `google`.
- [ ] Google token fresh (it expires about 7 days after connecting).
- [ ] `/demo` → Reset. The thread is clear and the calendar has no leftover events.
- [ ] Real syllabus loaded, questions written, and the next exam at least 2 days out (see DEMO-SCRIPT Setup).
- [ ] One full rehearsal of the ten-minute walk on the real syllabus.
- [ ] A friend's phone tested once with `npm run seat`. **[YOU]**
- [ ] Old seats released; `npm run seat -- list` shows only who should be there.
- [ ] `seed/macro-syllabus.pdf` saved in Files on your phone, ready to AirDrop.
- [ ] Interview quote and number on slide 2. **[YOU]**
- [ ] Photon SIP password rotated (it appeared in a screenshot).
- [ ] Flow frozen about 3 hours before judging. After that, bug fixes only.
