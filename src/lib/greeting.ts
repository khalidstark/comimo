/**
 * The record page's heading, so a daily visitor isn't met by the same sign.
 * It greets by first name, follows the time of day, notices a second comic
 * on the same day, and changes from one day to the next (stable within a day,
 * so it doesn't flicker between visits). The how-to line is only for the
 * first few comics; after that people know how it works.
 */

export const NEW_USER_COMICS = 3;

export const HOW_TO = "Talk the way you'd tell a friend. Arabic, English, or both in one sentence is fine.";

type Part = "morning" | "afternoon" | "evening" | "night" | "again";

const TITLES: Record<Part, readonly string[]> = {
  morning: ["Morning, {name}. Anything yet?", "Good morning, {name}. How did it start?", "صباح الخير يا {name}"],
  afternoon: ["Hey {name}, how's the day going?", "Afternoon, {name}. What happened so far?", "إزيك يا {name}؟ اليوم ماشي إزاي؟"],
  evening: ["Evening, {name}. How was today?", "So, {name}… how did it go?", "{name}, what happened today?", "يومك كان عامل إزاي يا {name}؟"],
  night: ["Still up, {name}?", "Late one, {name}. What kept you up?", "لسه صاحي يا {name}؟ احكيلي"],
  again: ["Back again, {name}? There's more to today.", "Another one from today, {name}?", "فيه حاجة كمان النهارده يا {name}؟"],
};

/** Starter questions; four a day, a different four tomorrow. */
export const PROMPTS: readonly string[] = [
  "What made you laugh today?",
  "ايه أحلى حاجة حصلت النهارده؟",
  "Who did you see?",
  "What was the hardest part, and what came after?",
  "What did you eat, and who with?",
  "مين كلمك النهارده؟",
  "What surprised you?",
  "What are you still thinking about?",
  "Where did you go today?",
  "ايه اللي ضايقك النهارده؟",
  "What did someone say that stuck?",
  "What would you do again?",
  "What took longer than it should have?",
  "حصل ايه في الطريق؟",
  "Who made today better?",
  "What's one small thing you noticed?",
];

const TILTS = ["-3deg", "2deg", "-1deg", "3deg"];

export function partOfDay(hour: number): Exclude<Part, "again"> {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

/** A small stable number for a date key, so each day gets its own pick. */
export function daySeed(dateKey: string): number {
  let hash = 0;
  for (const char of dateKey) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "";
}

export interface GreetingInput {
  name: string;
  hour: number;
  /** Local date, YYYY-MM-DD. */
  dateKey: string;
  /** Comics already in the book. */
  comics: number;
  /** True when a comic was already made today. */
  madeToday: boolean;
}

export function greeting({ name, hour, dateKey, comics, madeToday }: GreetingInput): { title: string; lede: string | null } {
  const first = firstName(name);
  const lede = comics < NEW_USER_COMICS ? HOW_TO : null;
  if (!first) return { title: "Tell me about today", lede };
  const options = TITLES[madeToday ? "again" : partOfDay(hour)];
  const title = options[daySeed(dateKey) % options.length].replaceAll("{name}", first);
  return { title, lede };
}

/** Four distinct starter questions for the day, with their bubble tilts. */
export function promptsFor(dateKey: string, count = 4): { text: string; tilt: string }[] {
  const start = daySeed(dateKey) % PROMPTS.length;
  // A step coprime with the pool size visits distinct prompts and mixes the languages.
  const step = 5;
  return Array.from({ length: Math.min(count, PROMPTS.length) }, (_, i) => ({
    text: PROMPTS[(start + i * step) % PROMPTS.length],
    tilt: TILTS[i % TILTS.length],
  }));
}
