# PITCH: Syllabus Crew

HackPrinceton Fall 2026. Tracks: Photon iMessage, Amazon "Best Practical AI", Education.
Everything here is checked against the code. Items marked **[YOU]** are facts only you can fill in. Say a claim on stage only if the demo shows it or the code does it.

The stage beats are in `DEMO-SCRIPT.md`. This file covers what to *say*, the deck, the "on your phone" step at the table, and judges' questions.

---

## 1. The line (say it twice: in the hook and in the close)

> **"Study apps wait for you to open them. Syl texts you."**

Close: **"Your quiz answers just rewrote your calendar. Nobody opened an app."**

One sentence if someone asks what it is: *a study agent in iMessage that reads your syllabus, quizzes you on what's worth the most, and asks before it puts study time on your calendar.*

---

## 2. Stage pitch (2 minutes, your phone mirrored)

| Time | Say | Show (DEMO-SCRIPT beat) |
|---|---|---|
| 0:00 | "Who here has a syllabus they opened exactly once?" Then the line. | Empty thread (0) |
| 0:15 | "The syllabus says what matters and how much it's worth. Nothing acts on it." | |
| 0:25 | "I text it my syllabus PDF. That's the whole setup." | PDF → summary + semester card (1) |
| 0:45 | "Fast-forward to week six." | Switch to Week 6 (2) |
| 0:50 | "New slides dropped, so **it texts me first** with a question." | Scout → quiz (3) |
| 1:00 | "I answer wrong. It asks me a question back instead of telling me." | B → hint (4) |
| 1:15 | "Weak topic, big exam: it proposes study time. It can't touch my calendar." | Proposal + week card (5) |
| 1:25 | "Only my YES writes it." | YES → Google Calendar event (6) |
| 1:40 | Trust: "It only texts people who texted it, does the math in code, and never touches your calendar without a YES." | Tap the week card |
| 1:50 | The close. Then: **"Want it on your phone? Give me your number."** | |

**Don't say:** that it reads slides from a real inbox (Scout reads a staged inbox in the demo), or that it runs in the cloud (it runs on the laptop).

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
3. **Live demo.** Just the phone.
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
- **Education:**
  - Socratic hint before the answer, then the reveal after two misses.
  - Mastery per topic: wrong ×0.7, right +30% of the gap.
  - Practice rounds with a recap card.
  - Voice drills: "explain it out loud", graded against key points.
  - Study time weighted by grade stakes.
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
- [ ] Rehearse DEMO-SCRIPT beat 1 with the PDF (the earlier runs used the photo).
- [ ] A friend's phone tested once with `npm run seat`. **[YOU]**
- [ ] Old seats released; `npm run seat -- list` shows only who should be there.
- [ ] `seed/macro-syllabus.pdf` saved in Files on your phone, ready to AirDrop.
- [ ] Interview quote and number on slide 2. **[YOU]**
- [ ] Photon SIP password rotated (it appeared in a screenshot).
- [ ] Flow frozen about 3 hours before judging. After that, bug fixes only.
