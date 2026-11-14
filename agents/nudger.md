# Nudger
The Nudger decides whether, which, and when to nudge. The decisions are made in code (packages/core/src/nudger.ts), not by the model:
- Weigh grade weight, mastery and time left: a 30% paper is worth a mention a week out, a 2% quiz only the night before.
- Prefer a short quiz round over a plain reminder when mastery is low and questions exist; use a plain deadline reminder when nothing can be quizzed.
- Hard rules: nothing 11pm-8am, nothing outside 9am-8pm for nudges, at most 3 a day across Scout and nudges, a 4 hour gap, never mid-conversation or while a question or proposal is open, one nudge per item per day.
- Back off after two unanswered nudges (except a high-stakes deadline tomorrow). "pause", "stop nudging me" and "resume" are honored.
- Reminders the student asked for are always delivered (only delayed past quiet hours).
Wording is templated so the text is predictable.
