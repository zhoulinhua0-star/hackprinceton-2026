// The student names their agent and picks how it talks. All parsing here is code, never the model.

/** What the agent goes by until the student names it. */
export const DEFAULT_AGENT_NAME = "Syl";
export const PRODUCT_NAME = "Syllabus Crew";

export type Vibe = "chill" | "strict" | "hype";
export const VIBES: Vibe[] = ["chill", "strict", "hype"];

const SKIP = /^(skip|idk|i don'?t know|dunno|no idea|whatever|anything|you (pick|choose|decide)|surprise me|none|nah|no|default)\W*$/i;
const LEAD_IN = /^(?:(?:i(?:'ll| will| wanna| want to|'d like to)?\s+)?(?:call|name)\s+you|(?:your|ur)\s+name\s+is|you(?:'re| are)|how about|let'?s go with|maybe|hmm+,?)\s+/i;
const RENAME = /^(?:please\s+)?(?:(?:i(?:'ll| will| wanna| want to|'d like to)?\s+)?(?:call|name)\s+you|call\s+yourself|(?:your|ur)\s+(?:new\s+)?name\s+is(?:\s+now)?|(?:re)?name\s+yourself(?:\s+to)?|rename\s+(?:you\s+)?to|change\s+(?:your|ur)\s+name\s+to)\s+(.+)$/i;

/** Tidies what the student typed into a name, or null when it can't be one (too long, a link, a sentence). */
export function cleanName(raw: string): string | null {
  const t = raw.trim().replace(/^["'“”‘’]+|["'“”‘’.!?,\s]+$/g, "").replace(/\s+/g, " ");
  if (!t || t.length > 20 || t.split(" ").length > 3) return null;
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '’\-]*$/u.test(t)) return null; // letters, digits, spaces, apostrophes, hyphens
  return t;
}

/** The answer to "what do you want to call me?". `default` = the student passed; `unclear` = ask once more. */
export function parseNameAnswer(text: string): { kind: "name"; name: string } | { kind: "default" } | { kind: "unclear" } {
  const t = text.trim();
  if (SKIP.test(t)) return { kind: "default" };
  const name = cleanName(t.replace(LEAD_IN, ""));
  return name ? { kind: "name", name } : { kind: "unclear" };
}

/** "call yourself Kiki", "I'll call you Momo", "your name is Pip": a rename at any time. Null when it isn't one. */
export function parseRename(text: string): string | null {
  const m = text.trim().match(RENAME);
  return m ? cleanName(m[1]!) : null;
}

/** "chill", "2", "be strict", "hype mode", "switch to chill". Null when no vibe is named. */
export function parseVibe(text: string): Vibe | null {
  const t = text.trim().toLowerCase().replace(/[.!?]+$/, "");
  if (/^[123]$/.test(t)) return VIBES[+t - 1]!;
  const m = t.match(/^(?:(?:be|go|stay|switch to|change (?:your |the )?vibe to|vibe:?|i (?:want|pick|choose))\s+)?(?:more\s+)?(chill|strict|hype)(?:\s+(?:mode|vibe|please))?$/);
  return m ? (m[1] as Vibe) : null;
}

/** A vibe change outside onboarding needs the command form, so a quiz answer or small talk never flips it. */
export function parseVibeCommand(text: string): Vibe | null {
  return /^(be|go|stay|switch|change|vibe)\b|\b(mode|vibe)\W*$/i.test(text.trim()) ? parseVibe(text) : null;
}

export const isNameQuestion = (text: string) => /\b(what(?:'?s| is) (?:your|ur) name|who are you|what (?:should|do) i call you)\b/i.test(text);

/** The short set phrases that change with the vibe. Chill is the original wording. */
export function voice(vibe: Vibe | undefined) {
  if (vibe === "strict") return { correct: "Correct.", miss: "Wrong.", picked: "Strict it is. I'll hold you to it." };
  if (vibe === "hype") return { correct: "YES! Correct!", miss: "So close!", picked: "Hype it is. Let's go!" };
  return { correct: "Correct!", miss: "Not quite.", picked: "Chill it is. No pressure, just steady." };
}
