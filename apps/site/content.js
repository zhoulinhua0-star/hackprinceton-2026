// Everything the pitch page says, in one place. Threads use Syl's real reply wording (apps/agent/src/engine),
// on the example ECON 201 course. Edit freely; app.js only draws what is here.
window.SITE = {
  // Paste the demo video link when it exists (YouTube watch/share link, or a direct .mp4). Empty = the section stays hidden.
  videoUrl: "",
  // Interview quotes once you have them: [{ quote: "...", who: "junior, econ" }]. Empty = the section stays hidden.
  interviews: [],
};

window.CREW = {
  lead: { name: "Syl", color: "#2c6e6a" },
  scout: { name: "Scout", color: "#d98b2b" },
  tutor: { name: "Tutor", color: "#c8553d" },
  planner: { name: "Planner", color: "#6d7fb3" },
  nudger: { name: "Nudger", color: "#7a9e5a" },
};

// Each thread: [sender, text]. "me" is the student; a "card:" text draws as a tap-to-open card.
window.THREADS = {
  hello: [
    ["me", "Hi Syllabus Crew"],
    ["lead", "Hey! I'm your personal agent from Syllabus Crew, built for students. I read your syllabus, quiz you by text, and ask before I change anything. What do you want to call me?"],
    ["me", "Juno"],
    ["lead", "Juno it is. How should I talk to you? Reply CHILL, STRICT or HYPE."],
    ["me", "hype"],
    ["lead", "Hype it is. Let's go!"],
    ["lead", "vcard:Juno"],
    ["lead", "That's my card. Tap it, then Create New Contact, and my texts will show up as Juno with my face.\n\nLast one: which class worries you most this semester?"],
    ["me", "Macro, honestly"],
    ["lead", "Noted. Text me that syllabus as a PDF and I'll take it from there."],
  ],
  syllabus: [
    ["me", "file:ECON 201 syllabus.pdf"],
    ["lead", "Got it, reading your syllabus. Give me about 20 seconds."],
    ["lead", "Got it. ECON 201. Next up: Exam 2 on Nov 20 (25%). Final Exam is 30% and is cumulative. Week 12 looks heavy."],
    ["lead", "card:semester"],
    ["lead", "When is Final Exam?"],
    ["me", "December 16"],
    ["lead", "Got it. That's everything I needed."],
  ],
  chat: [
    ["me", "what should I focus on this week?"],
    ["lead", "Chapter 5. Exam 2 is Friday and it's 25% of your grade, and rates are your weakest topic so far (35%). Want a quick question on it now?"],
    ["me", "yes"],
    ["tutor", "Ch. 5 before Exam 2\nA rate hike makes borrowing…\nA) cheaper  B) more expensive  C) unchanged"],
  ],
  screenshot: [
    ["me", "file:IMG_2041.png"],
    ["me", "is this the same thing as chapter 5?"],
    ["lead", "Yes. That slide is the loanable-funds graph from chapter 5: when rates rise, the quantity of loans demanded falls. It's the idea behind the question you missed yesterday."],
  ],
  rename: [
    ["me", "call yourself Max"],
    ["lead", "Done. Call me Max."],
    ["lead", "Here's my updated card. Tap it to save the new one."],
  ],
  scout: [
    ["scout", "Prof. Lee posted Week 6 slides. Added a few questions to your quiz."],
    ["tutor", "Ch. 5: When the Fed raises rates, business investment usually…\nA) falls  B) rises  C) stays the same"],
    ["me", "A"],
    ["tutor", "Correct! Pricier loans mean fewer projects pay off, so firms invest less."],
  ],
  deadline: [
    ["scout", "Heads up: Problem Set 5 is due Thursday (part of 20%)."],
    ["me", "remind me wednesday at 7pm to start it"],
    ["nudger", "Got it. I'll remind you Wednesday at 7:00 PM to start it."],
  ],
  quiz: [
    ["me", "quiz me"],
    ["tutor", "Question 1 of 5 · Ch. 5 before Exam 2\nA rate hike makes borrowing…\nA) cheaper  B) more expensive  C) unchanged"],
    ["me", "A"],
    ["tutor", "Not quite. If the price of a loan is the interest rate, what happens to that price when rates go up?"],
    ["me", "B"],
    ["tutor", "Correct! Higher rates make every loan cost more."],
  ],
  round: [
    ["tutor", "Question 5 of 5 · Ch. 6 before Exam 2\nA tariff on imports usually makes the domestic price…\nA) fall  B) rise  C) stay the same"],
    ["me", "B"],
    ["tutor", "Correct! The tax raises what imports cost, so domestic prices rise too."],
    ["tutor", "That's the round: 4 of 5 on the first try."],
    ["tutor", "card:round"],
  ],
  idk: [
    ["tutor", "Ch. 4: When supply rises and demand stays the same, the price…\nA) rises  B) falls  C) stays the same"],
    ["me", "idk"],
    ["tutor", "The answer is B) falls. More of the good chasing the same buyers pushes the price down."],
  ],
  call: [
    ["tutor", "Exam 2 is in 3 days and Ch. 5: Rates is at 35%. Want a 3-minute voice drill? Reply CALL."],
    ["me", "CALL"],
    ["tutor", "Calling you now from (609) 555-0142: a 3-minute drill on Ch. 5: Rates."],
    ["tutor", "call:3 min · Syl voice drill"],
    ["tutor", "Nice work. You nailed why borrowing costs more. The missing piece: fewer projects pay off, so investment falls."],
    ["tutor", "card:drill"],
  ],
  propose: [
    ["planner", "Exam 2 is 25% and chapter 5 is your weak spot. Want me to add 30 minutes of review on Tuesday, Nov 17? Reply YES or NO."],
    ["planner", "card:week"],
    ["me", "YES"],
    ["planner", "Done. Tuesday, Nov 17, 4:00 PM-4:30 PM, ch. 5 review."],
    ["planner", "card:booked"],
  ],
  move: [
    ["planner", "Exam 2 is 25% and chapter 5 is your weak spot. Want me to add 30 minutes of review on Tuesday, Nov 17? Reply YES or NO."],
    ["me", "make it Monday at 2pm"],
    ["planner", "Moved: Monday, Nov 16, 2:00 PM-2:30 PM, ch. 5 review. Reply YES to book it, or NO."],
    ["me", "yes"],
    ["planner", "Done. Monday, Nov 16, 2:00 PM-2:30 PM, ch. 5 review."],
  ],
  book: [
    ["me", "book me an hour for chapter 4 on thursday at 3"],
    ["planner", "How about Thursday, Nov 19, 3:00 PM-4:00 PM: 60 minutes of ch. 4 review before Exam 2 (25%)? Reply YES to book it, or NO."],
    ["me", "no"],
    ["planner", "No problem, I won't add it."],
  ],
  remind: [
    ["me", "remind me sunday to start the essay"],
    ["nudger", "Got it. I'll remind you Sunday at 9:00 AM to start the essay."],
  ],
  nudge: [
    ["nudger", "Exam 2 is due in 3 days (25% of your grade), and you're at 35% on chapter 5. Want a quick 3-question round on it? Reply YES or NO."],
    ["me", "yes"],
    ["tutor", "Question 1 of 3 · Ch. 5 before Exam 2\nWhen rates rise, saving usually…\nA) falls  B) rises  C) stays the same"],
  ],
  pause: [
    ["me", "stop nudging me"],
    ["nudger", "Okay, I'll stay quiet for 3 days. Reminders you set still come through. Say \"resume\" to turn nudges back on."],
    ["me", "resume"],
    ["nudger", "Back on. I'll nudge you when something's coming up."],
  ],
  night: [
    ["note", "11:40 PM"],
    ["me", "quiz me"],
    ["tutor", "Question 1 of 5 · Ch. 5 before Exam 2\nA rate hike makes borrowing…\nA) cheaper  B) more expensive  C) unchanged"],
    ["note", "Syl answers when you text. It never starts a conversation between 11 PM and 8 AM, and nudges only between 9 AM and 8 PM."],
  ],
};

// The tour: one stop per crew member, every feature a button.
window.STOPS = [
  { id: "arches", n: 1, who: "lead", place: "The arches", title: "You text Syl. That's the whole setup.",
    blurb: "You only ever text one agent. It reads every message, matches A/B/C and YES/NO in code first, and hands the rest to the right specialist.",
    features: [["hello", "Say hi, name it, pick a vibe", "Then it texts you its contact card, with its face."], ["syllabus", "Send your syllabus PDF", "Read for real in about ten seconds. It asks only what's missing."], ["chat", "Ask it anything", "It knows your exams, weights and the last question."], ["screenshot", "Send a screenshot", "It reads the slide with the text that comes next."], ["rename", "Rename it any time", "And it sends a fresh card."]],
    wont: ["Guess at a YES you didn't send", "Text someone who hasn't texted it first", "Pretend to know something it doesn't"] },
  { id: "hall", n: 2, who: "scout", place: "The hall", title: "Scout notices what changed.",
    blurb: "New slides posted, a deadline coming up. Scout only reads, and it tells you once.",
    features: [["scout", "New slides posted", "They become new quiz questions."], ["deadline", "A deadline is close", "One heads-up, then you decide."]],
    wont: ["Send email", "Delete or edit anything", "Post on your behalf"] },
  { id: "quad", n: 3, who: "tutor", place: "The quad", title: "Tutor asks before it tells.",
    blurb: "Questions are written from your syllabus and double-checked before you see them. Miss once and you get a question back, not the answer. Grading is code.",
    features: [["quiz", "Quiz me", "One question, a hint after a miss."], ["round", "A round of five", "Then a recap card with your score."], ["idk", "I don't know", "It explains instead of making you guess."], ["call", "Reply CALL", "Your phone rings: explain it out loud, get a recap by text."]],
    wont: ["Reveal the answer on the first miss", "Call you unless you reply CALL", "Let the model do the math on your score"] },
  { id: "library", n: 4, who: "planner", place: "The library", title: "Planner proposes. You decide.",
    blurb: "A weak topic on a heavy exam gets a specific slot, in one text. Only your YES writes to Google Calendar.",
    features: [["propose", "Weak spot, big exam", "A proposal, then YES, then a real calendar event."], ["move", "Make it Monday at 2", "Move it by text before you say yes."], ["book", "Book me a study block", "Ask for one; say no if you change your mind."]],
    wont: ["Touch your calendar on its own", "Stack proposals: one open at a time", "Move events you made"] },
  { id: "tower", n: 5, who: "nudger", place: "The bell tower", title: "Nudger knows when to stay quiet.",
    blurb: "Reminders you ask for always arrive. Everything else has to earn its way into your day.",
    features: [["remind", "Remind me Sunday…", "Always delivered, moved out of quiet hours."], ["nudge", "A nudge before the exam", "Only when the stakes and your weak spots say so."], ["pause", "Stop nudging me", "Quiet until you say resume."], ["night", "It's 11:40 PM", "Syl answers, but never starts the conversation."]],
    wont: ["Nudge outside 9 AM to 8 PM", "Interrupt a conversation in progress", "Nudge more than 3 times a day"] },
];

// Each stop's place, cut from the campus paintings: [image, focus x%, focus y%, zoom].
window.PLACES = {
  arches: ["campus-commons", 36, 58, 160], hall: ["campus-commons", 2, 50, 200], quad: ["campus-commons", 44, 80, 220],
  library: ["library-study-hall", 20, 72, 150], tower: ["campus-commons", 88, 22, 260],
};

window.RULES = [
  ["Only your YES writes to your calendar", "The approve path is the only code that can write. Planner can only propose."],
  ["It never texts first into a new thread", "You text first. Strangers can't be messaged, and every number needs a seat."],
  ["Quiet from 11 PM to 8 AM", "Nudges only from 9 AM to 8 PM, at most 3 a day, 4 hours apart, never mid-conversation."],
  ["It backs off", "Two ignored nudges and it goes quiet. \"Stop nudging me\" pauses it."],
  ["Math in code, words from the model", "Grading, mastery, priority and timing are plain code. Claude writes the sentences."],
  ["A failed text leaves nothing behind", "Syl sends first, then records. One open quiz and one open proposal at a time."],
];

window.FLOW = {
  you: "You, in iMessage",
  channel: ["Photon 2.0", "your seat on a shared iMessage line"],
  lead: ["Syl, the Crew Lead", "matches A/B/C and YES/NO in code, routes everything else"],
  crew: [["scout", "Scout", "reads new slides and deadlines"], ["tutor", "Tutor", "questions, hints, mastery, voice drills"], ["planner", "Planner", "proposals only, one at a time"], ["nudger", "Nudger", "decides if, which and when"]],
  out: [["Claude on Amazon Bedrock", "Sonnet 4.6 reads syllabi and writes questions; Haiku 4.5 chats"], ["Google Calendar", "written only after YES"], ["Tap-to-open cards", "Vercel pages with the detail"], ["ElevenLabs voice", "drills on a Photon number"]],
};

window.TRIED = [
  ["Tapbacks", "Refused on shared lines.", "Replies stay plain text: a YES is a YES."],
  ["The line's name and photo", "Can't be set on a shared line.", "Syl texts its own contact card, with a face per vibe."],
  ["App cards in the thread", "2.0 has no mini-app card.", "Syl sends a link that iMessage draws as a card, with charts on the page."],
  ["One line for everyone", "Each seat can land on a different pooled line.", "Syl remembers which line each person texts; a one-line command adds a seat."],
  ["Typing dots", "Not available on shared lines.", "Slow work gets a short \"Got it, reading your syllabus\" first, and texts are spaced so they arrive in order."],
];

window.TRACKS = {
  "Photon iMessage": [
    "The whole product is one iMessage thread on Photon 2.0: inbound by WebSocket with a polling fallback, deduplicated.",
    "Files both ways: PDFs and screenshots in, a contact card (vCard) out.",
    "Per-person lines on a shared pool, and a seat command for onboarding at the table.",
    "Voice drills on a Photon number through ElevenLabs; the call ends and a recap text follows in the same thread.",
    "Inbound first: it never texts someone who hasn't texted it.",
  ],
  "Amazon · Best Practical AI": [
    "Claude on Amazon Bedrock with two models picked per task: Sonnet 4.6 for reading syllabi and writing questions, Haiku 4.5 for chat.",
    "The model writes words; grading, mastery, priority and timing are code, so the numbers are never invented.",
    "A practical safety story: YES-gated writes, quiet hours, daily limits, all enforced in code and tested (234 tests).",
    "An Amazon DynamoDB store is built and switchable; the event account's policy blocked it, so state stays in a file for the demo.",
  ],
  "Education": [
    "A Socratic hint before the answer, then the reveal after two misses.",
    "Mastery per topic: right gains 30% of the gap, wrong keeps 70%.",
    "Practice rounds with a recap card, and voice drills where you explain it out loud and get graded on key points.",
    "Study time weighted by what's actually at stake on the syllabus.",
  ],
};

window.ORIGINALS = [
  ["The priority score", "Grade weight × how weak you are × how soon it's due decides what you study next. Try it above."],
  ["Questions checked twice", "Each question is written, then answered again independently before it reaches you. Unsure ones are dropped."],
  ["The YES gate", "Only one path in the code can write to your calendar, and it only runs after your YES."],
];

window.SERVICES = [
  ["Messaging", "Photon 2.0", "The iMessage thread, files, per-person seats"],
  ["Messaging", "Photon voice number", "Where voice drills ring from"],
  ["AI", "Claude Sonnet 4.6 on Amazon Bedrock", "Reads syllabi, writes and checks questions, grades drills"],
  ["AI", "Claude Haiku 4.5 on Amazon Bedrock", "Everyday chat and short replies"],
  ["Voice", "ElevenLabs Agents", "The voice drill call"],
  ["Calendar", "Google Calendar API", "Study blocks, after YES only"],
  ["Cards", "Vercel + Vercel Blob", "Tap-to-open card pages and their data"],
  ["Cards", "Next.js image generation", "The preview image iMessage shows for each card"],
  ["Data", "Amazon DynamoDB", "Student state store (built; blocked on the event account)"],
  ["App", "Next.js", "The live dashboard and the card site"],
  ["App", "Node.js + TypeScript", "The agent and its four specialists"],
  ["Built by us", "The crew engine", "Routing, grading, mastery, priority, Nudger rules"],
  ["Built by us", "234 automated tests", "Every rule above, checked on fakes"],
];

window.NEXT = [
  ["Hosted for real", "Off the laptop, so Syl runs while we sleep."],
  ["Your own Google sign-in", "Every student's YES writes to their own calendar."],
  ["Canvas and LMS feeds", "Scout reads the real course page, not a staged inbox."],
  ["Questions from the reading itself", "Built from your slides' text, not the model's general knowledge."],
  ["Group study threads", "One Syl for a study group, with a shared plan."],
  ["Every course at once", "Five syllabi, one week planned across all of them."],
];
