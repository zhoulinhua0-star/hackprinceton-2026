# Product

Syllabus Crew: a personal study agent for college students that lives in iMessage. The student names it (default "Syl") and picks a vibe. It reads the syllabus, quizzes by text on what's worth the most, and asks before it puts study time on the calendar.

## Platform
web

## Stack
- `apps/agent`: Node/TS agent (Photon 2.0 iMessage, Claude on Amazon Bedrock, Google Calendar, ElevenLabs voice). Runs on the builder's laptop.
- `apps/web`: Next.js dashboard (localhost only). Live mirror plus presenter controls.
- `apps/cards`: Next.js tap-to-open card pages on Vercel.
- `apps/site` (planned): static pitch page on Vercel.

## Users
- **Pitch page:** HackPrinceton Fall 2026 judges (Photon iMessage, Amazon Best Practical AI, Education tracks), reading during or after judging, often on a phone. After reading they should believe it's real and safe, and ask the builder for a seat so Syl texts their phone. (Confirmed by the user, Nov 14.)
- **Product:** college students taking 4-5 courses.

## Product Purpose
"Study apps wait for you to open them. Syl texts you." Turn the syllabus (weights, dates) into action: quizzes on weak, high-stakes topics, and study blocks proposed by text and written only after YES.

## Positioning
Not an app you open: one iMessage thread, an agent you named, and four specialists behind it (Scout, Tutor, Planner, Nudger). Competitor named in the plan: UpAhead.

## Operating Context
Solo builder, hackathon weekend (Nov 13-15, 2026). The live demo runs on the builder's phone (mirrored) with the localhost dashboard. The pitch page is the always-online companion; it never shows live data.

## Capabilities and Constraints
Real: Photon iMessage in/out on a shared line with per-person seats; reading a real PDF syllabus (Sonnet 4.6) with code validation; written and double-checked A/B/C questions; Socratic hint then reveal; mastery and priority math in code; practice rounds; proposals written to Google Calendar only after YES; voice drills (reply CALL, ElevenLabs on a Photon number, recap by text); tap-to-open cards (semester donut, week, round, drill) on Vercel; a contact card with the agent's face; naming and vibes; reminders; Nudger rules (9am-8pm, 3/day, 4h gap, backoff); quiet hours 11pm-8am; 234 automated tests.
Staged in the demo: Scout reads a staged inbox; Week 6 is a fast-forward. Not built: hosting off the laptop, per-student Google sign-in, tapbacks (refused on shared lines), a sign-up form.

## Brand Commitments
- The dashboard's world is liked and safe: watercolor campus background (subtle), Fraunces + Figtree, ink navy, one highlighter yellow, the five stationery crew characters. A dashboard-like page is the solid backup; the user invites bolder explorations as options. (User, Nov 14.)
- Minimal and calm: "the chatbox cannot be too messy"; interactions smooth and personal.
- Must not look copied from the Elfie team's pitch page (structure may be similar; look, motion and wording may not).
- No hype words or big claims.

## Evidence on Hand
No interview quotes or numbers yet (placeholders only, never invented). A demo video will come later: reserve a slot for it. Real proof available now: example threads in the product's exact wording, real card pages, the test count, the stack.

## Product Principles
Asks before it acts. Math in code, language from the model. Texts only people who texted first. Honest limits stated plainly.

## Accessibility & Inclusion
Readable on phones; reduced-motion respected; text contrast on the watercolor ground kept high; every simulated thread labeled "example".
