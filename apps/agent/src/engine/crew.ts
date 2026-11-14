import { isAmbiguous, isDontKnow, isHintRequest, isUnsure, parseReply, rankTopics, daysUntil, inQuietHours, parseReminder, formatWhen } from "@syllabus-crew/core";
import { describe, DEFAULT_AGENT_NAME, PRODUCT_NAME, isNameQuestion, parseNameAnswer, parseRename, parseVibe, parseVibeCommand, voice } from "@syllabus-crew/core";
import { writeQuestions } from "./questions.ts";
import type { TopicJob } from "./questions.ts";
import { createHash } from "node:crypto";
import type { Attachment, CalendarWriter, ParsedSyllabus, StudentState } from "@syllabus-crew/core";
import { readSyllabus } from "./syllabus.ts";
import { approveProposal, declineProposal, pendingProposal } from "./approve.ts";
import { bypassFor, makeCtx, safeText, type Ctx, type Deps, type Opts } from "./ctx.ts";
import { askNext, refresh, tryAnswerAsk, needsAnswer } from "./onboarding.ts";
import { NUDGE_ROUND, tick } from "./nudger.ts";
import type { TickOptions, TickResult } from "./nudger.ts";
import { runScout } from "./scout.ts";
import { sendCard } from "./card.ts";
import { refreshSemester, semesterLink, sendLink } from "./cards.ts";
import { moveProposal, proposeOnRequest } from "./planner.ts";
import { finishDrill, gradeDrill, offerDrill, startDrill, timedOut, type Graded } from "./voice.ts";
import type { CallStatus } from "@syllabus-crew/core";
import { advanceSession, answerQuiz, renderQuiz, sendQuiz } from "./tutor.ts";
import { day1State, stagedParse, week6State } from "../seed.ts";

export interface CrewDeps extends Omit<Deps, "opts"> { calendar: CalendarWriter; opts?: Partial<Opts> }
export interface Inbound {
  text?: string; hasImage?: boolean; route?: { spaceId: string; senderId: string };
  /** Fetches the texted file (a photo or a PDF) when it is actually needed. Null = not a readable file. */
  file?: () => Promise<Attachment | null>;
}
type FileLoader = NonNullable<Inbound["file"]>;
const MAX_PAGES = 12;
/** "book me a study block", "schedule review time Tuesday at 2pm", "add study time to my calendar". */
const isStudyRequest = (text: string) =>
  /\b(book|schedule|add|put|block( out)?|set up|plan|reserve|find|make)\b[\s\S]*\b(study|review|session|block|calendar|slot|time to study)\b|\bstudy (block|session|time)\b/i.test(text);

/** Changes whenever the semester is replaced (Week 6, Reset, a new syllabus). */
const semesterKey = (s: StudentState) => `${s.phase}|${s.parsed}|${s.syllabusHash ?? ""}`;

/** Most texts one sender may send per hour before the agent stops answering (a flood guard for the public QR code). */
const MAX_INBOUND_PER_HOUR = 40;
const SHOT_WAIT_MS = 20_000;
const DEFAULTS: Opts = { bypassLimits: false, dashboardUrl: "http://localhost:3000", proposalDelayMs: 2000, llmTimeoutMs: 4000, llmProposals: false, sessionLength: 5, nextQuestionDelayMs: 1500, stagedPhoto: true, intakeWaitMs: 6000 };

/** Crew Lead: the one thing the student talks to. Routes to Scout / Tutor / Planner and enforces reply matching in code. */
export class Crew {
  private deps: Deps;
  private calendar: CalendarWriter; // only ever passed to approveProposal
  private locks = new Map<string, Promise<unknown>>();
  private inboundLog = new Map<string, number[]>();
  private intake = new Map<string, { files: FileLoader[]; timer?: ReturnType<typeof setTimeout>; baseline: string }>();
  /** A screenshot sent once the syllabus is in: held for the text that usually follows it, then shown to the model with that text. */
  private shots = new Map<string, { image: Attachment; at: number; timer?: ReturnType<typeof setTimeout> }>();

  constructor(d: CrewDeps) {
    const { calendar, opts, ...rest } = d;
    this.deps = { ...rest, opts: { ...DEFAULTS, ...opts } };
    this.calendar = calendar;
  }

  setBypass(on: boolean | string[]) { this.deps.opts.bypassLimits = on; }
  setStagedPhoto(on: boolean) { this.deps.opts.stagedPhoto = on; }
  get stagedPhoto(): boolean { return this.deps.opts.stagedPhoto; }

  private rateLimited(id: string): boolean {
    const now = this.deps.clock.now().getTime();
    const recent = (this.inboundLog.get(id) ?? []).filter((t) => now - t < 3_600_000);
    recent.push(now);
    this.inboundLog.set(id, recent);
    return recent.length > MAX_INBOUND_PER_HOUR;
  }

  /** Serialize work per student so two quick texts can't overwrite each other's state. */
  private async run<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(id) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.locks.set(id, next.catch(() => undefined));
    return next;
  }

  private async open(id: string, create: boolean): Promise<Ctx | undefined> {
    let state = await this.deps.store.load(id);
    if (!state) {
      if (!create) return undefined;
      state = day1State(id);
    }
    return makeCtx(this.deps, state);
  }

  // ---------- inbound ----------
  async onInbound(id: string, msg: Inbound): Promise<void> {
    if (this.rateLimited(id)) return; // flooding: stop answering until the hour rolls over
    return this.run(id, async () => {
      const ctx = (await this.open(id, true))!;
      const { state } = ctx;
      state.openedByStudent = true; // the student texted first
      if (msg.route) state.route = msg.route;
      state.messages.push({ dir: "in", text: msg.text ?? (msg.hasImage ? "[photo]" : ""), at: this.deps.clock.now().toISOString() });
      state.messages = state.messages.slice(-200);
      await ctx.commit();

      if (state.pendingOffer && new Date(state.pendingOffer.expiresAt).getTime() <= this.deps.clock.now().getTime()) state.pendingOffer = undefined;
      if (msg.hasImage) return this.onImage(ctx, msg.file);
      const text = (msg.text ?? "").trim();
      // 0. First contact: the agent says who it is and asks for a name, then a vibe. Anything that isn't an answer falls through.
      if (state.pendingName && (await this.onNaming(ctx, text))) return;
      if (this.isFirstContact(state)) return this.greet(ctx);
      const reply = parseReply(text);
      const proposal = pendingProposal(ctx);

      // 1. Replies to pending items are matched in code, before any LLM.
      if (reply.kind === "choice" && state.pendingQuiz) return answerQuiz(ctx, reply.value);
      if (reply.kind === "yes" && proposal) return approveProposal(ctx, this.calendar, proposal.id);
      if (reply.kind === "no" && proposal) return declineProposal(ctx, proposal.id);

      // 1a-voice. CALL (or YES to a drill offer, or "drill me") starts a voice drill. Nothing rings without this.
      const callOffer = state.pendingOffer?.kind === "call" ? state.pendingOffer : undefined;
      if (!state.pendingQuiz && !proposal && (/^(call|call me|call me now|drill me|voice drill|ok call|yes,? call|start (the )?(voice )?drill)\W*$/i.test(text) || (callOffer && reply.kind === "yes"))) {
        state.pendingOffer = undefined;
        return startDrill(ctx, callOffer?.topicId);
      }
      if (callOffer && reply.kind === "no") { state.pendingOffer = undefined; return ctx.say("No problem. Text CALL whenever you want a voice drill.", "drill"); }

      // 1a. The agent asked "want a quick round?" on its own: YES starts it, NO drops it.
      if (state.pendingOffer?.kind === "round" && !proposal && !state.pendingQuiz && (reply.kind === "yes" || reply.kind === "no")) {
        const offer = state.pendingOffer;
        state.pendingOffer = undefined;
        if (reply.kind === "no") return ctx.say("No problem. I'll check in again another time.", "nudge");
        if (await sendQuiz(ctx, { solicited: true, startSession: NUDGE_ROUND, preferTopic: offer.topicId })) return;
        return ctx.say("I don't have any new questions right now. Say \"quiz me\" later.", "clarify");
      }

      // 1b. A question about the syllabus is open: a date or percent answers it.
      if (needsAnswer(state) && !state.pendingQuiz && (await tryAnswerAsk(ctx, text))) return refreshSemester(ctx); // the card shows the fix; no new link

      // 2b. Leaving a practice round, or passing on a question.
      if (state.session && /^(stop|enough|that'?s (all|enough)|no more|i'?m done|done|end)\W*$/i.test(text)) { state.session = undefined; return ctx.say(`Okay, that's enough for now. Say "quiz me" whenever you want more.`, "tutor"); }
      // Tutoring while a question is open: giving up counts as a miss (hint first, answer on the second), a hint request is free.
      if (state.pendingQuiz && (isDontKnow(text) || (!proposal && isUnsure(text)))) return answerQuiz(ctx, "unknown");
      if (state.pendingQuiz && isHintRequest(text)) {
        const q = state.questions.find((x) => x.id === state.pendingQuiz!.questionId)!;
        state.pendingQuiz!.hinted = true; // so a later "I don't know" is treated as giving up
        return ctx.say(`Hint: ${q.socratic}`, "tutor");
      }
      if (state.pendingQuiz && /^(skip|pass|next)\W*$/i.test(text)) {
        state.askedQuestionIds.push(state.pendingQuiz.questionId);
        state.pendingQuiz = undefined;
        await ctx.say("Skipped.", "tutor");
        return state.session ? advanceSession(ctx) : undefined;
      }

      // "skip" with only a proposal waiting (no question open) declines it.
      if (proposal && !state.pendingQuiz && /^(skip|pass)\W*$/i.test(text)) return declineProposal(ctx, proposal.id);

      // 1c. A new day/time while a proposal waits moves it ("make it Wednesday at 5pm").
      if (proposal && !state.pendingQuiz && (await moveProposal(ctx, text))) return;

      // 2. Unclear replies while something is pending get a clarifying text, never an action.
      if (proposal && isAmbiguous(text)) return ctx.say("I didn't catch that. Reply YES to add it to your calendar, or NO to skip it.", "clarify");
      if (state.pendingQuiz && reply.kind === "other" && /^\S{1,3}$/.test(text)) return ctx.say("Reply A, B or C.", "clarify"); // a short mis-typed answer is not small talk
      if (reply.kind === "choice") return ctx.say("I don't have a question open right now. Say \"quiz me\" for one.", "clarify");
      if ((reply.kind === "yes" || reply.kind === "no") && !proposal) return ctx.say(reply.kind === "yes" ? 'Nothing to confirm right now. Say "quiz me" if you want a question.' : "Nothing to confirm right now.", "clarify");

      // 3. Free text.
      const renamed = parseRename(text);
      if (renamed) { state.agentName = renamed; await ctx.say(`Done. Call me ${renamed}.`, "naming"); return this.refreshCard(ctx); }
      const vibe = parseVibeCommand(text);
      if (vibe) { state.vibe = vibe; await ctx.say(voice(vibe).picked, "naming"); return this.refreshCard(ctx); }
      if (isNameQuestion(text)) return ctx.say(`I'm ${this.nameOf(state)}, your personal agent from ${PRODUCT_NAME}. Say "call yourself ..." to rename me.`, "naming");
      const prefs = this.prefsCommand(ctx, text);
      if (prefs) return ctx.say(prefs, "prefs");
      const rem = parseReminder(text, this.deps.clock.now(), this.deps.tz);
      if (rem) {
        if ("error" in rem) return ctx.say(rem.error === "no_what" ? "What should I remind you about?" : rem.error === "past" ? "That time has already passed today. Try a later time, or say tomorrow." : 'When should I remind you? For example "remind me Sunday to start the essay", or "in 2 hours".', "reminder");
        (state.reminders ??= []).push({ id: `rem_${state.reminders.length + 1}`, text: rem.text, dueISO: rem.due.toISOString(), status: "pending", createdAt: this.deps.clock.now().toISOString() });
        return ctx.say(`Got it. I'll remind you ${formatWhen(rem.due, this.deps.clock.now(), this.deps.tz)} to ${rem.text}.`, "reminder");
      }
      if (/\bquiz me\b|another (one|question)|next question|^(next|more|again|keep going|go on|continue)\W*$|\bwhere('?s| is) (my|the) (quiz|question)|\b(give|send|start) me (a |the |my )?(quiz|question)|\bi want (a |to )?quiz\b|^(a )?quiz\W*$/i.test(text)) {
        const open = state.pendingQuiz && state.questions.find((q) => q.id === state.pendingQuiz!.questionId);
        if (open) return ctx.say(`Still waiting on this one:\n\n${renderQuiz(ctx, open)}`, "quiz");
        if (await sendQuiz(ctx, { solicited: true, startSession: this.deps.opts.sessionLength })) return;
        if (state.phase === "live" && !state.questions.length) {
          if (state.questionsStatus === "generating") return ctx.say("I'm still writing your questions. Give me a minute.", "clarify");
          void this.startQuestions(id, { announce: true }).catch(() => {}); // after this turn; never blocks the reply
          return ctx.say("I'm writing your first questions now. I'll text you when they're ready.", "clarify");
        }
        return ctx.say("I can't send a question right now. Try again a bit later.", "clarify");
      }
      if (/\b(focus|prioriti[sz]e)\b|what should i (study|work on)/i.test(text)) return ctx.say(this.focusSummary(state), "focus");
      if (isStudyRequest(text)) return proposeOnRequest(ctx, text); // the Planner proposes; only YES books it
      const shot = this.takeScreenshot(id);
      const small = await safeText(this.deps, "smalltalk", "crew-lead", this.chatContext(state, text, !!shot),
        "I'm here. I'll text you quiz questions on what's coming up, and I'll ask before I change your calendar.", () => true,
        `\n\nYour name is ${this.nameOf(state)}. You are the student's personal agent from ${PRODUCT_NAME}. Tone: ${state.vibe ?? "chill"}.`,
        shot ? [shot] : undefined);
      // If the reply offers a quiz, remember the offer, so a YES starts one and a NO is understood (step 1a).
      if (/\b(quiz|question|practice|round|drill)\b[^?]*\?\s*$/i.test(small)) state.pendingOffer = { kind: "round", expiresAt: new Date(this.deps.clock.now().getTime() + 2 * 3_600_000).toISOString() };
      return ctx.say(small, "smalltalk");
    });
  }

  /** What the model sees for a free-text reply: the recent thread and the last question, so "I think it's B" makes sense. */
  private chatContext(state: StudentState, text: string, withShot = false): string {
    // Card links and the contact card are shown to the model as what they are, never as URLs it could quote back (#106).
    const shown = (m: StudentState["messages"][number]) => m.kind === "card" ? "[a tap-to-open card: a summary page, not a quiz]" : m.kind === "contact-card" ? "[your contact card]" : m.text.replace(/https?:\/\/\S+/g, "[link]");
    const recent = state.messages.slice(-9, -1).map((m) => `${m.dir === "in" ? "Student" : "You"}: ${shown(m)}`).join("\n");
    const lastId = state.pendingQuiz?.questionId ?? state.askedQuestionIds.at(-1);
    const q = lastId && state.questions.find((x) => x.id === lastId);
    const quiz = q ? `\n\nThe last quiz question: ${q.prompt} A) ${q.choices.A} B) ${q.choices.B} C) ${q.choices.C}. Correct answer: ${q.correct}) ${q.choices[q.correct]}. Why: ${q.explanation}${state.pendingQuiz ? " (still open: do not reveal the answer)" : " (already answered)"}` : "";
    const shot = withShot ? "\n\nThe student sent the attached screenshot just before this message (often of something you said earlier). Read it." : "";
    return `Recent messages:\n${recent || "(none)"}${quiz}${shot}\n\nThe student's new message: ${text}`;
  }

  // ---------- naming ----------
  private nameOf(state: StudentState): string { return state.agentName ?? DEFAULT_AGENT_NAME; }

  /** Holds a screenshot for the text that usually follows. If none comes within 20 s, asks what it's about. */
  private async holdScreenshot(ctx: Ctx, image: Attachment): Promise<void> {
    const id = ctx.state.id;
    clearTimeout(this.shots.get(id)?.timer);
    const entry: { image: Attachment; at: number; timer?: ReturnType<typeof setTimeout> } = { image, at: Date.now() };
    entry.timer = setTimeout(() => {
      if (this.shots.get(id) !== entry) return;
      void this.run(id, async () => {
        const c = await this.open(id, false);
        if (c && this.shots.get(id) === entry) await c.say("Got your screenshot. What would you like me to do with it?", "photo");
      }).catch(() => {});
    }, SHOT_WAIT_MS);
    entry.timer.unref?.();
    this.shots.set(id, entry);
  }
  private takeScreenshot(id: string): Attachment | undefined {
    const s = this.shots.get(id);
    this.shots.delete(id);
    if (s) clearTimeout(s.timer);
    return s && Date.now() - s.at < 5 * 60_000 ? s.image : undefined;
  }

  /** A brand-new thread: nothing parsed, nothing said yet. A photo first skips this (the name stays the default). */
  private isFirstContact(state: StudentState): boolean {
    return !state.agentName && !state.pendingName && state.phase === "day1" && !state.parsed && !state.messages.some((m) => m.dir === "out");
  }

  private greet(ctx: Ctx): Promise<void> {
    ctx.state.pendingName = { step: "name", tries: 0 };
    return ctx.say(`Hey! I'm your personal agent from ${PRODUCT_NAME}, built for students. I read your syllabus, quiz you by text, and ask before I touch your calendar.\n\nFirst: what do you want to call me? (Say skip and I'll go by ${DEFAULT_AGENT_NAME}.)`, "naming");
  }

  /** Handles a reply to the name or vibe question. Returns false when the text is something else, so it is handled normally. */
  private async onNaming(ctx: Ctx, text: string): Promise<boolean> {
    const { state } = ctx;
    const p = state.pendingName!;
    // A command, a question, or a bare YES / A / B / C is not a name: keep the default and handle it normally.
    const isCommand = /\b(quiz me|remind me|focus|help)\b|\?\s*$/i.test(text) || ["yes", "choice"].includes(parseReply(text).kind);
    if (p.step === "name") {
      const a = isCommand ? ({ kind: "unclear" } as const) : parseNameAnswer(text);
      if (a.kind === "unclear" && !isCommand && p.tries === 0) {
        p.tries = 1;
        await ctx.say(`Just a name, up to 20 characters. Or say skip and I'll go by ${DEFAULT_AGENT_NAME}.`, "naming");
        return true;
      }
      if (a.kind === "unclear") { state.pendingName = undefined; return false; } // stays the default; treat the text as a normal message
      if (a.kind === "name") state.agentName = a.name;
      state.pendingName = { step: "vibe", tries: 0 };
      await ctx.say(`${this.nameOf(state)} it is. How should I talk to you? Reply CHILL, STRICT or HYPE.`, "naming");
      return true;
    }
    const passed = /^(skip|idk|i don'?t know|dunno|whatever|none|nothing|you (pick|choose|decide)|default)\W*$/i.test(text);
    if (p.step === "vibe") {
      const v = parseVibe(text);
      if (!v && !passed) { state.pendingName = undefined; return false; } // stays chill; treat the text as a normal message
      state.vibe = v ?? "chill";
      state.pendingName = { step: "focus", tries: 0 };
      const last = "Last one: which class worries you most this semester?";
      // The contact card: the name and face show in the thread header once they save it. If it fails, skip it quietly.
      if (this.deps.opts.lineNumber && this.deps.messenger.sendFile) {
        await ctx.say(voice(state.vibe).picked, "naming");
        if (await sendCard(ctx)) {
          await ctx.say(`That's my card. Tap it, then Create New Contact, and my texts will show up as ${this.nameOf(state)} with my face.\n\n${last}`, "naming");
          return true;
        }
        await ctx.say(last, "naming");
        return true;
      }
      await ctx.say(`${voice(state.vibe).picked} ${last}`, "naming");
      return true;
    }
    // The one open question. Their own words are kept; a command, a rename or a vibe change is handled normally instead.
    state.pendingName = undefined;
    if (isCommand || parseRename(text) || parseVibeCommand(text) || isNameQuestion(text) || !text) return false;
    if (!passed) state.focusCourse = text.replace(/\s+/g, " ").slice(0, 60);
    const next = state.parsed ? "I'll keep an eye on it." : `Text me ${passed ? "a" : "that"} syllabus as a PDF and I'll take it from there.`;
    await ctx.say(`${passed ? "No problem." : "Noted."} ${next}`, "naming");
    return true;
  }

  /** After a rename or vibe change: a fresh card, if they already got one and it now shows the wrong name or face. */
  private async refreshCard(ctx: Ctx): Promise<void> {
    const { state } = ctx;
    if (!state.cardFor || state.cardFor === `${this.nameOf(state)}|${state.vibe ?? "chill"}`) return;
    if (await sendCard(ctx)) await ctx.say("Here's my updated card. Tap it to save the new one.", "naming");
  }

  /**
   * The agent texts first. Only for someone who asked for it (the presenter's "Say hello" control, later a sign-up
   * form), and only into a thread Photon already knows.
   */
  async startOnboarding(id: string): Promise<{ sent: boolean; reason?: string }> {
    return this.run(id, async () => {
      const ctx = (await this.open(id, true))!;
      if (!ctx.state.route) return { sent: false, reason: "no thread yet: text the line once so there is a thread to reply in" };
      ctx.state.openedByStudent = true; // opted in
      await this.greet(ctx);
      return { sent: true };
    });
  }

  /** "pause nudges for 2 days", "stop nudging me", "resume". Reminders the student set are never affected. */
  private prefsCommand(ctx: Ctx, text: string): string | null {
    const { state } = ctx;
    const now = this.deps.clock.now();
    let m: RegExpMatchArray | null;
    if ((m = text.match(/^(?:please\s+)?(?:pause|mute|snooze)(?:\s+(?:the\s+)?(?:nudges|texts|notifications|messages))?(?:\s+for\s+(\d+)\s*(hour|day|week)s?)?\W*$/i))) {
      const n = m[1] ? +m[1] : 3, unit = (m[2] ?? "day").toLowerCase();
      const ms = n * (unit === "hour" ? 3_600_000 : unit === "week" ? 7 * 86_400_000 : 86_400_000);
      state.prefs = { mutedUntil: new Date(now.getTime() + ms).toISOString() };
      return `Okay, I'll stay quiet for ${n} ${unit}${n === 1 ? "" : "s"}. Reminders you set still come through. Say "resume" to turn nudges back on.`;
    }
    if (/^(?:please\s+)?(?:stop (?:nudging|texting|messaging|pinging) me|no more nudges)\W*$/i.test(text)) {
      state.prefs = { mutedUntil: "2099-01-01T00:00:00.000Z" };
      return 'Okay, no more nudges. Reminders you set still come through, and I\'m here whenever you text. Say "resume" to turn nudges back on.';
    }
    if (/^(?:please\s+)?(?:resume|unmute|start nudging|turn nudges on|you can text me again)\W*$/i.test(text)) {
      state.prefs = undefined;
      return "Back on. I'll nudge you when something's coming up.";
    }
    return null;
  }

  // ---------- the scheduler ----------
  /** One scheduler pass for one student. Returns what was (or, in a dry run, would be) done. */
  async tickStudent(id: string, o: TickOptions = {}): Promise<TickResult | undefined> {
    return this.run(id, async () => { const c = await this.open(id, false); return c ? tick(c, o) : undefined; });
  }
  /** A pass over every student. Never texts anyone who hasn't texted the line first. */
  async tickAll(o: TickOptions = {}): Promise<Record<string, TickResult>> {
    const out: Record<string, TickResult> = {};
    for (const id of await this.deps.store.ids()) { const r = await this.tickStudent(id, o); if (r) out[id] = r; }
    return out;
  }

  private async onImage(ctx: Ctx, file?: FileLoader): Promise<void> {
    const { state, deps } = ctx;
    state.pendingName = undefined; // a photo instead of a name: keep the default name and get to work
    if (file) {
      // A PDF is always read for real, at once (it is the whole syllabus). A slow or failed download counts as a photo.
      const loaded = await Promise.race([file().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 3000).unref?.())]);
      if (loaded?.mediaType === "application/pdf") return this.collect(ctx, async () => loaded, 0);
      if (!deps.opts.stagedPhoto) return this.collect(ctx, loaded ? async () => loaded : file);
      // The syllabus is already in: a photo now is part of the conversation (usually a screenshot), not a syllabus page.
      if (state.parsed && loaded && loaded.mediaType !== "image/gif") return this.holdScreenshot(ctx, loaded);
    }
    if (state.phase === "day1" && !state.parsed) {
      // Staged: the stored parse for the demo syllabus photo, not Textract + the LLM.
      const p = stagedParse(deps.clock.now(), deps.tz);
      state.courses = p.courses; state.exams = p.exams; state.topics = p.topics; state.parsed = true;
      const link = await semesterLink(ctx);
      await ctx.say(link ? p.summary : `${p.summary} Here's your semester: ${deps.opts.dashboardUrl}`, "onboarding");
      await sendLink(ctx, link);
      return;
    }
    // Several photos sent together get one reply, not one each.
    const last = [...state.messages].reverse().find((m) => m.dir === "out");
    if (last?.kind === "photo" || (last?.kind === "onboarding" && deps.clock.now().getTime() - new Date(last.at).getTime() < 60_000)) return;
    return ctx.say("Got the photo. I can't read photos yet, so send your syllabus as a PDF and I'll read that.", "photo");
  }

  // ---------- a syllabus texted as photos or a PDF ----------
  /** Pages arrive as separate texts: acknowledge the first, then wait for a quiet moment and read them together. */
  private async collect(ctx: Ctx, file: FileLoader, waitMs = this.deps.opts.intakeWaitMs): Promise<void> {
    const id = ctx.state.id;
    let job = this.intake.get(id);
    if (!job) {
      job = { files: [], baseline: semesterKey(ctx.state) };
      this.intake.set(id, job);
      await ctx.say("Got it, reading your syllabus. Give me about 20 seconds.", "onboarding");
    }
    if (job.files.length < MAX_PAGES) job.files.push(file);
    clearTimeout(job.timer);
    job.timer = setTimeout(() => void this.readIntake(id).catch(() => {}), waitMs);
    job.timer.unref?.();
  }

  /** Reads what was collected and installs it. The slow download and model call run outside the per-student lock. */
  async readIntake(id: string): Promise<"installed" | "duplicate" | "unreadable" | "none"> {
    const job = this.intake.get(id);
    if (!job) return "none";
    clearTimeout(job.timer);
    this.intake.delete(id);
    const tell = (text: string) => this.run(id, async () => { const c = await this.open(id, false); if (c) await c.say(text, "onboarding"); });
    const pages = (await Promise.all(job.files.map((f) => f().catch(() => null)))).filter((a): a is Attachment => !!a);
    if (!pages.length) { await tell("I couldn't open that file. Send the syllabus as a photo of each page, or as a PDF."); return "unreadable"; }
    const hash = createHash("sha256").update(pages.map((a) => a.base64).join("|")).digest("hex");
    if (await this.hasSyllabus(id, hash)) { await tell("That's the syllabus I already have, so nothing changed."); return "duplicate"; }
    const read = await readSyllabus(this.deps.llm, pages, this.deps.tz, this.deps.clock.now());
    if (!read.ok) { await tell("I couldn't find a syllabus in that, so nothing changed. Try a clearer photo of each page, or send the PDF."); return "unreadable"; }
    if (!(await this.applySyllabus(id, read.parsed, hash, job.baseline))) return "none"; // the semester changed while reading
    void this.startQuestions(id, { announce: true }).catch(() => {});
    return "installed";
  }

  private focusSummary(state: StudentState): string {
    const now = this.deps.clock.now();
    const top = rankTopics(state, now, this.deps.tz)[0];
    if (!top) return "Send me your syllabus as a PDF and I'll tell you what to focus on.";
    const topic = state.topics.find((t) => t.id === top.topicId)!;
    const exam = state.exams.find((e) => e.topicIds.includes(top.topicId))!;
    const pct = Math.round((state.mastery[top.topicId] ?? 0.5) * 100);
    return `Focus on ${topic.name}: you're at ${pct}%, and ${exam.name} is ${Math.round(exam.weight * 100)}% of your grade in ${daysUntil(exam.date, now, this.deps.tz)} days.`;
  }

  // ---------- proactive / controls ----------
  async runScoutNow(id: string): Promise<boolean> {
    return this.run(id, async () => { const c = await this.open(id, false); if (!c) return false; const found = await runScout(c); if (found) await refreshSemester(c); return found; });
  }
  // ---------- voice drills ----------
  async offerDrillNow(id: string, force = true): Promise<{ sent: boolean; reason?: string }> {
    return this.run(id, async () => { const c = await this.open(id, false); return c ? offerDrill(c, { force }) : { sent: false, reason: "this number hasn't texted the line" }; });
  }
  async startDrillNow(id: string): Promise<void> {
    return this.run(id, async () => { const c = await this.open(id, false); if (c) await startDrill(c); });
  }
  /** Checks this student's drill calls; when one has ended, grades it (outside the lock) and texts the recap. */
  async checkDrills(id: string): Promise<number> {
    const caller = this.deps.caller;
    if (!caller) return 0;
    const calling = (await this.deps.store.load(id))?.drills?.filter((d) => d.status === "calling") ?? [];
    let finished = 0;
    for (const d of calling) {
      let status: CallStatus;
      try { status = await caller.getCall(d.callId!); } catch { status = { state: "pending" }; }
      if (status.state === "pending") {
        if (!timedOut(d, this.deps.clock.now())) continue;
        status = { state: "failed", answered: true }; // never finished: tell the student, free the slot
      }
      let graded: Graded | undefined;
      if (status.state === "done" && status.answered) graded = await gradeDrill(this.deps.llm, d, status);
      await this.run(id, async () => { const c = await this.open(id, false); if (c) await finishDrill(c, d.id, status, graded); });
      finished++;
    }
    return finished;
  }
  async checkAllDrills(): Promise<void> {
    for (const id of await this.deps.store.ids()) {
      const s = await this.deps.store.load(id);
      if (s?.drills?.some((d) => d.status === "calling")) await this.checkDrills(id);
    }
  }

  /** Why Scout found nothing, in words the presenter can act on. */
  async whyNoScout(id: string): Promise<string> {
    const s = await this.deps.store.load(id);
    if (!s?.openedByStudent) return "This number hasn't texted the line yet.";
    if (!s.inbox.length) return s.phase === "week6" ? "Nothing new to find." : "Scout finds the staged Week 6 slides. Press Switch to Week 6 first, then Run Scout now.";
    if (s.inbox.every((m) => s.foundMaterialIds.includes(m.id))) return "Scout already found the Week 6 slides. Press Reset demo to run the demo again.";
    return "It's outside the hours or over today's limit for texts the agent starts.";
  }
  async sendQuizNow(id: string): Promise<boolean> {
    return this.run(id, async () => { const c = await this.open(id, false); return c ? sendQuiz(c, { force: true }) : false; });
  }
  /** Dashboard Approve / Not now: same approve path as a YES text. */
  async approveFromDashboard(id: string, proposalId: string, approve = true): Promise<void> {
    return this.run(id, async () => {
      const c = await this.open(id, false);
      if (c) await (approve ? approveProposal(c, this.calendar, proposalId) : declineProposal(c, proposalId));
    });
  }

  // ---------- real syllabus ----------
  /**
   * Installs a syllabus the reader produced as this student's semester, tells them what it found, and asks about
   * what's missing. Returns undefined when the student has never texted the line: the agent never texts first.
   */
  async applySyllabus(id: string, parsed: ParsedSyllabus, hash?: string, ifSemester?: string): Promise<{ summary: string; question: string | null } | undefined> {
    return this.run(id, async () => {
      const prev = await this.deps.store.load(id);
      if (!prev?.openedByStudent || !prev.route) return undefined;
      // A read that started before Week 6 / Reset / another syllabus must not overwrite what happened since.
      if (ifSemester !== undefined && semesterKey(prev) !== ifSemester) return undefined;
      await this.deleteApprovedEvents(prev); // a new syllabus is a new semester: remove the old demo's calendar events
      const state = day1State(id, true);
      state.route = prev.route;
      state.messages = prev.messages;
      state.agentName = prev.agentName; state.vibe = prev.vibe; state.cardFor = prev.cardFor; state.focusCourse = prev.focusCourse; // the name belongs to the thread, not the semester
      state.phase = "live"; state.parsed = true; state.syllabus = parsed; state.syllabusHash = hash;
      const ctx = makeCtx(this.deps, state);
      const { patch, missing } = refresh(state, this.deps.tz);
      const link = await semesterLink(ctx);
      const read = describe(parsed, patch, this.deps.tz, this.deps.clock.now());
      const summary = link ? read : `${read} Here's your semester: ${this.deps.opts.dashboardUrl}`;
      await ctx.say(summary, "onboarding");
      await sendLink(ctx, link);
      const question = await askNext(ctx, missing);
      await refreshSemester(ctx); // the open question shows on the card too
      return { summary, question };
    });
  }

  /**
   * Writes quiz questions for the topics that matter most right now. The slow model calls run outside the
   * per-student lock, so the student's replies are never held up while the questions are being written.
   */
  async generateQuestions(id: string, o: { perTopic?: number; maxTopics?: number; announce?: boolean } = {}): Promise<{ started: boolean; added: number; reason?: string }> {
    const plan = await this.planQuestions(id, o);
    if ("reason" in plan) return { started: false, added: 0, reason: plan.reason };
    return this.finishQuestions(id, plan, o);
  }

  /** Like generateQuestions, but returns as soon as it is known whether the writer started; the writing continues in the background. */
  async startQuestions(id: string, o: { perTopic?: number; maxTopics?: number; announce?: boolean } = {}, onDone?: (r: { added: number }) => void): Promise<{ started: boolean; reason?: string }> {
    const plan = await this.planQuestions(id, o);
    if ("reason" in plan) return { started: false, reason: plan.reason };
    void this.finishQuestions(id, plan, o).then((r) => onDone?.(r)).catch(() => onDone?.({ added: 0 }));
    return { started: true };
  }

  private async planQuestions(id: string, o: { perTopic?: number; maxTopics?: number }) {
    const perTopic = o.perTopic ?? 3, maxTopics = o.maxTopics ?? 8;
    // 1. decide what to write (locked, quick)
    return this.run(id, async () => {
      const state = await this.deps.store.load(id);
      if (!state?.syllabus || state.phase !== "live") return { reason: "no real syllabus installed" } as const;
      if (state.questionsStatus === "generating") return { reason: "already writing" } as const;
      const have = (topicId: string) => state.questions.filter((q) => q.topicId === topicId && !state.askedQuestionIds.includes(q.id)).length;
      const jobs: TopicJob[] = [];
      for (const { topicId } of rankTopics(state, this.deps.clock.now(), this.deps.tz)) {
        if (jobs.length >= maxTopics) break;
        if (have(topicId) >= perTopic) continue;
        const topic = state.topics.find((t) => t.id === topicId), exam = state.exams.find((e) => e.topicIds.includes(topicId));
        if (topic && exam && !/^cumulative$/i.test(topic.name.trim())) jobs.push({ topicId, topic: topic.name, assessment: exam.name, course: state.courses[0]?.name ?? "" });
      }
      if (!jobs.length) return { reason: "nothing to write" } as const;
      state.questionsStatus = "generating";
      await this.deps.store.save(state);
      return { jobs, startAt: state.questions.length, perTopic, hash: state.syllabusHash } as const;
    });
  }

  private async finishQuestions(id: string, plan: { jobs: TopicJob[]; startAt: number; perTopic: number; hash?: string }, o: { announce?: boolean }): Promise<{ started: boolean; added: number }> {
    const perTopic = plan.perTopic;
    // 2. the slow part: no lock held
    let written: Awaited<ReturnType<typeof writeQuestions>> | undefined;
    try { written = await writeQuestions(this.deps.llm, plan.jobs, perTopic, plan.startAt); } catch { /* handled below */ }

    // 3. save the result and (optionally) tell the student
    return this.run(id, async () => {
      const ctx = await this.open(id, false);
      if (!ctx) return { started: true, added: 0 };
      const { state } = ctx;
      // The semester changed while the questions were being written (Week 6, Reset, another syllabus): drop them quietly.
      if (state.phase !== "live" || state.syllabusHash !== plan.hash) return { started: true, added: 0 };
      const qs = written?.questions ?? [];
      const ids = new Set(state.questions.map((q) => q.id));
      const fresh = qs.filter((q) => !ids.has(q.id));
      state.questions.push(...fresh);
      state.unlockedQuestionIds.push(...fresh.map((q) => q.id));
      state.questionsStatus = state.questions.length ? "ready" : "failed";
      await ctx.commit();
      const quiet = !bypassFor(this.deps, id) && inQuietHours(this.deps.clock.now(), this.deps.tz);
      if (o.announce && fresh.length && !quiet) await ctx.say(`I wrote ${fresh.length} practice question${fresh.length === 1 ? "" : "s"} for your upcoming work. Say "quiz me" whenever you want one.`, "tutor");
      return { started: true, added: fresh.length };
    });
  }

  /** True if this exact upload is already installed for the student (a double click or a re-send). */
  async hasSyllabus(id: string, hash: string): Promise<boolean> {
    const s = await this.deps.store.load(id);
    return s?.phase === "live" && s.syllabusHash === hash;
  }

  private async deleteApprovedEvents(prev: StudentState | undefined): Promise<{ removedEvents: number; failedEvents: number }> {
    let removedEvents = 0, failedEvents = 0;
    for (const p of prev?.proposals ?? []) {
      if (p.status !== "approved" || !p.calendarEventId || !this.calendar.deleteEvent) continue;
      try { await this.calendar.deleteEvent(p.calendarEventId); removedEvents++; } catch { failedEvents++; }
    }
    return { removedEvents, failedEvents };
  }

  // ---------- demo states ----------
  /** The iMessage thread can't be reset; the thread stays "opened" so proactive texts still work. */
  async resetDemo(id: string): Promise<{ removedEvents: number; failedEvents: number }> {
    return this.run(id, async () => {
      const prev = await this.deps.store.load(id);
      // Remove the calendar events this demo created, so reruns don't pile up on the same slot.
      const { removedEvents, failedEvents } = await this.deleteApprovedEvents(prev);
      const next = day1State(id, prev?.openedByStudent ?? false);
      next.route = prev?.route; // the Photon route belongs to the thread, not the demo state
      await this.deps.store.save(next);
      return { removedEvents, failedEvents };
    });
  }
  async switchToWeek6(id: string): Promise<void> {
    return this.run(id, async () => {
      const prev = await this.deps.store.load(id);
      const next = week6State(id, this.deps.clock.now(), prev?.openedByStudent ?? false, this.deps.tz);
      next.messages = prev?.messages ?? [];
      next.route = prev?.route; // the Photon route belongs to the thread, not the demo state
      next.agentName = prev?.agentName; next.vibe = prev?.vibe; next.cardFor = prev?.cardFor;
      await this.deps.store.save(next);
    });
  }
}
