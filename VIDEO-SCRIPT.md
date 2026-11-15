# Video script: Syllabus Crew (about 2 minutes)

A general walk-through for the pitch page (`content.js` → `SITE.videoUrl`) and the submission.
Voiceover only. **Everything is filmed on the iPhone**, because the product lives in iMessage and calls your phone: the texts, the card pages (they open in Safari), Google Calendar (the iPhone app), and the pitch page for the architecture (iPhone Safari). The MacBook never appears; it's only used off camera to send the first question.
Tracks it serves: **Education** (personal, interactive, accessible), **Photon** (it lives in iMessage, texts first, calls), **Amazon** (Claude on Bedrock, rules in code).

**The frame:** a 16:9 canvas in the page's cream (#f3eee2). The iPhone recording sits in the middle in a thin dark phone frame (#1e2740), full height. Captions sit to the left of the phone, one short line at a time, in Fraunces or Figtree, ink (#1e2740). The right side stays empty, or shows the step name (Setup · Syllabus · Quiz · Call · How it's built).
**Voice:** calm, plain, a little dry. No hype words. Read the VO lines as written; each fits its shot.

`[topic]`, `[exam]`, `[day]` are whatever your syllabus produces on the day; read them off the phone and fix the captions in the edit.

---

## Shot list

| # | Time | iPhone shows | Voiceover | Caption |
|---|---|---|---|---|
| 1 | 0:00–0:07 | Lock screen; a text from Syl arrives | "Study apps wait for you to open them. Syl texts you." | Syllabus Crew · a study agent in iMessage |
| **Setup** | | | | |
| 2 | 0:07–0:15 | You text **hi**. Syl introduces itself and asks what to call it | "There's no app. You text one number." | No app, no sign-up |
| 3 | 0:15–0:24 | You reply a name, then **hype**. The contact card arrives; tap it, save it | "You name it, pick how it talks to you, and it sends its own contact card." | Personal: your name for it, your vibe |
| **The syllabus** | | | | |
| 4 | 0:24–0:33 | Send the syllabus PDF. "Got it, reading your syllabus…" | "Then you send your syllabus. Once." | Read by Claude on Amazon Bedrock |
| 5 | 0:33–0:42 | The summary text and the link card. Tap it: the **semester card** opens in Safari (scroll it once), swipe back | "It pulls out every exam, date and weight, and checks the math in code." | Every grade weight, computed in code |
| 6 | 0:42–0:48 | You type **what's due next?** → "Next up: …" | "Ask it what's due, it answers from your syllabus." | Answers come from your syllabus |
| **The quiz → your calendar** | | | | |
| 7 | 0:48–0:56 | Syl texts one A/B/C question | "Between classes, it checks if you're ready." | One question, one tap |
| 8 | 0:56–1:04 | Tap a **wrong** letter → a question back, not the answer | "Get it wrong and it asks you back, like a good TA." | Interactive: a hint before the answer |
| 9 | 1:04–1:12 | The proposal: "[exam] is N% and [topic] is your weak spot. Want me to add 30 minutes of review on [day]?" + the week link | "Weak topic, big exam: it finds a free slot. It can't touch your calendar on its own." | It proposes. You decide. |
| 10 | 1:12–1:22 | Reply **YES** → "Done. …" + the Booked link. Swipe to the **Calendar app**: the event is there on [day] | "Only your YES writes it." | Only your YES writes to your calendar |
| **The call** | | | | |
| 11 | 1:22–1:27 | Back in Messages, text **drill me** → "Calling you now…: a 3-minute drill on [topic]." | "If you'd rather talk it through…" | Accessible: tap or talk |
| 12 | 1:27–1:39 | The incoming call shows the agent's name (the saved contact). Answer it; the call screen | (the real call audio: the agent asks, you explain) | Explain it out loud. It listens. Live lines captioned |
| 13 | 1:39–1:46 | The recap text, then the drill link. Tap it: the **drill card** in Safari (key points hit and missed, the answer) | "The recap comes back in writing, with what you missed." | Graded on key points, in code |
| **How it's built** | | | | |
| 14 | 1:46–1:54 | Safari on syllabus-crew.vercel.app, **The crew**: tap through the lanes (Scout, Tutor, Planner, Nudger) | "Behind the one thread is a crew. Syl reads every text and hands it to one of four agents." | Our own crew, no framework |
| 15 | 1:54–2:00 | Scroll to **Behind the gates** (you → iMessage → Syl → four agents → Bedrock, Google Calendar, cards, voice) | "The model writes words. Grading, timing and every calendar write are rules in code." | 243 tests · Photon · Bedrock · Google Calendar · ElevenLabs |
| **Close** | | | | |
| 16 | 2:00–2:08 | Back to the thread, scrolled to the top; the phone slides aside for a title card: **Personal. Interactive. Accessible.** then `syllabus-crew.vercel.app` | "Personal, interactive, accessible. Study apps wait for you to open them. Syl texts you." | syllabus-crew.vercel.app |

Total about 2:05. To cut to 1:50: drop shot 6, and trim shot 15 to its caption.

---

## Recording plan (in pieces, edited together)

Record each block as its own iPhone screen recording. Any block can be redone without the others.

**Before you record**
- iPhone: Focus → Do Not Disturb, so nothing else pops up. Screen recording with the mic **off** (the voiceover is added later).
- Google Calendar signed in on the iPhone's Calendar app (or the Google Calendar app), showing the exam week.
- Agent running; its log says `voice drills on; cards on; calendar google`.
- `/demo` → **Reset demo** on the laptop before block A.
- Use your real syllabus. Its course name and dates will be visible in the video and on the card pages.
- Save the contact card in block A, so the drill call in block C shows the agent's **name**, not the voice number.

**Block A, setup and syllabus (shots 1–6):** reset, start recording, text hi → name → hype → save the card → send the PDF → wait for the summary → tap the link, scroll the semester card, swipe back → "what's due next?". For shot 1, record the lock screen when the first reply arrives (or re-shoot it last).
After this block, on the laptop: `/demo` → **Write quiz questions**; wait about a minute.

**Block B, quiz → calendar (shots 7–10):** start recording. On the laptop, off camera, press `/demo` → **Send quiz now** (the Nudger's job in real use; see the honesty notes). Tap a wrong letter, wait for the proposal, reply YES, then switch to the Calendar app and show the event. Answer the returning question (can be cut).
If no proposal comes: the topic wasn't at 50% (something was answered earlier). Reset and redo A and B.

**Block C, the call (shots 11–13):** text **drill me**, answer the call.
- iOS screen recording does **not** capture call audio. Put the call on **speaker** and record the sound with something else: the Mac (QuickTime → New Audio Recording) or a second phone, right next to it.
- Keep it short: answer its question, let it ask one follow-up, answer again, it wraps up. Use about 12 seconds of audio in the edit, captioned.
- The recap and the drill link arrive about 10 seconds after hanging up. Tap the link, scroll the card.

**Block D, architecture (shots 14–15):** iPhone Safari → syllabus-crew.vercel.app. Scroll to The crew, tap each lane slowly, then scroll to Behind the gates.

**Block E, voiceover:** all VO lines in one take, quiet room, AirPods or a mic close by. Read a little slower than feels natural.

---

## Editing notes
- Phone frame: a rounded rectangle with a thin dark bezel; don't draw a fake notch over the recording's own status bar.
- Captions: one line, under 8 words, ink on cream to match the page.
- Waiting (the PDF read, the call connecting, the recap): cut or speed up 4× with a small "about 10 s" label. Never cut inside a reply to make it look faster.
- Music: optional, very low, silent under the call audio.
- Export 1080p. Upload to YouTube as **Unlisted**, paste the link into `apps/site/content.js` → `SITE.videoUrl`, deploy the page (`cd apps/site && npx -y vercel@65 deploy --prod --yes`). The video section appears on its own.

## Honesty notes (show nothing the product doesn't do)
- Shot 7: you trigger the question from the laptop. In real use the Nudger decides when (9 AM to 8 PM, at most 3 a day, never mid-conversation). If you want it explicit: a small caption, "sent on cue for the recording".
- It proposes; it never books without YES. Questions have three choices (A, B, C).
- Syl knows the graded items, dates, weights and the readings tied to them, not which reading belongs to each class day.
- It runs on the laptop; the services (Photon, Bedrock, Google, Vercel, ElevenLabs) are real.
