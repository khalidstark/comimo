import { PRONOUNS, type AboutYou, type Character, type Pronouns, type ReferenceSheet } from "./types";
import type { ArtStyleId } from "./artStyles";

/**
 * "About you": what the user tells Comimo about themselves right after sign-up
 * (their photo, interests, how they are with people, what people call them),
 * turned into their "self" character.
 *
 * Pure and shared: the welcome flow and cast page use it in the browser, the
 * script route uses `cleanAbout` and the prompt uses the voice lines. No
 * model calls, no storage here.
 */

/** Same as the cast form's personality limit (LIMITS.personality in cast.ts). */
export const PERSONALITY_MAX = 300;
export const OWN_INTERESTS_MAX = 3;
export const OWN_INTEREST_LENGTH = 24;

export interface InterestChoice {
  id: string;
  label: string;
}

/** The interest chips, in the order they are shown (and written into the personality). */
export const INTERESTS: readonly InterestChoice[] = [
  { id: "football", label: "Football" },
  { id: "gaming", label: "Gaming" },
  { id: "music", label: "Music" },
  { id: "reading", label: "Reading" },
  { id: "anime", label: "Anime" },
  { id: "cooking", label: "Cooking" },
  { id: "art", label: "Art" },
  { id: "coding", label: "Coding" },
  { id: "gym", label: "Gym" },
  { id: "movies", label: "Movies" },
  { id: "travel", label: "Travel" },
  { id: "coffee", label: "Coffee" },
  { id: "studying", label: "Studying" },
  { id: "fashion", label: "Fashion" },
  { id: "pets", label: "Pets" },
  { id: "photography", label: "Photography" },
];

export interface MannerChoice {
  id: string;
  /** The chip. */
  label: string;
  /** How it reads in "With people: …". */
  trait: string;
  /** One line under the chip, and how the script model is told they talk. */
  voice: string;
  /** A line in their voice for the cast card. */
  line: string;
}

/** How you are with people, in the order shown (and written). */
export const MANNERS: readonly MannerChoice[] = [
  { id: "sarcastic", label: "Sarcastic", trait: "sarcastic", voice: "answers with dry, sarcastic one-liners", line: "Oh great. Another plot twist." },
  { id: "quiet", label: "Quiet", trait: "quiet", voice: "says little, in short lines", line: "Mm. Fair." },
  { id: "loud", label: "Loud", trait: "loud", voice: "says everything loudly, with big reactions", line: "WAIT. Say that again!" },
  { id: "caring", label: "Caring", trait: "caring", voice: "checks on everyone, warm and gentle", line: "Did you eat today?" },
  { id: "funny", label: "Funny", trait: "funny", voice: "turns almost anything into a joke", line: "Okay but hear me out." },
  { id: "shy", label: "Shy", trait: "shy", voice: "a bit hesitant, warms up slowly", line: "Oh, um, hi." },
  { id: "blunt", label: "Blunt", trait: "blunt", voice: "says exactly what they think", line: "No. Next question." },
  { id: "dramatic", label: "Dramatic", trait: "dramatic", voice: "reacts to small things like big events", line: "This is the worst day of my entire life." },
  { id: "calm", label: "Calm", trait: "calm", voice: "unbothered, steady when things get messy", line: "It's fine. We'll sort it." },
  { id: "overthinker", label: "Overthinker", trait: "an overthinker", voice: "replays every moment in their head", line: "Wait, what did they mean by that?" },
  { id: "planner", label: "The planner", trait: "the planner", voice: "has a plan, and a backup plan", line: "I made a list for this." },
  { id: "listener", label: "The listener", trait: "the listener", voice: "listens more than they talk", line: "Go on, I'm listening." },
];

const INTEREST_IDS = new Map(INTERESTS.map((choice, i) => [choice.id, i]));
const MANNER_IDS = new Map(MANNERS.map((choice, i) => [choice.id, i]));

export const PRONOUN_LABELS: Record<Pronouns, string> = { he: "He / him", she: "She / her", they: "They / them" };

const tidy = (text: string) => text.replace(/\s+/g, " ").trim();
/** Letters, marks, digits, spaces and a little punctuation; no quotes or brackets that could steer a prompt. */
const OWN_INTEREST_CHARS = /^[\p{L}\p{M}\p{N} '’&+.-]+$/u;

/** Known ids only, once each, in the order shown. */
function knownIds(value: unknown, order: Map<string, number>): string[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set(value.filter((id): id is string => typeof id === "string" && order.has(id)));
  return [...ids].sort((a, b) => order.get(a)! - order.get(b)!);
}

/** Typed interests, tidied: at most 3, each short, letters only, no repeats (also of a chip). */
export function cleanOwnInterests(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set(INTERESTS.map((choice) => choice.label.toLowerCase()));
  const kept: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const text = tidy(item);
    const key = text.toLowerCase();
    if (!text || text.length > OWN_INTEREST_LENGTH || !OWN_INTEREST_CHARS.test(text) || seen.has(key)) continue;
    seen.add(key);
    kept.push(text);
    if (kept.length === OWN_INTERESTS_MAX) break;
  }
  return kept;
}

/**
 * The About-you answers with anything unknown or oversized dropped. Used on
 * the server for what the browser sends, and in the browser before saving.
 */
export function cleanAbout(value: unknown): Pick<AboutYou, "interests" | "ownInterests" | "manner" | "pronouns"> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const pronouns = PRONOUNS.find((p) => p === raw.pronouns);
  return {
    interests: knownIds(raw.interests, INTEREST_IDS),
    ownInterests: cleanOwnInterests(raw.ownInterests),
    manner: knownIds(raw.manner, MANNER_IDS),
    ...(pronouns ? { pronouns } : {}),
  };
}

/** Interests as words in a sentence ("football"), or as chips ("Football") with `asChips`. */
export function interestLabels(about: Pick<AboutYou, "interests" | "ownInterests">, asChips = false): string[] {
  const labels = knownIds(about.interests, INTEREST_IDS).map((id) => INTERESTS[INTEREST_IDS.get(id)!].label);
  return [...(asChips ? labels : labels.map((label) => label.toLowerCase())), ...cleanOwnInterests(about.ownInterests)];
}

export function mannerChoices(about: Pick<AboutYou, "manner">): MannerChoice[] {
  return knownIds(about.manner, MANNER_IDS).map((id) => MANNERS[MANNER_IDS.get(id)!]);
}

/** "a", "a and b", "a, b and c". */
function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

const upperFirst = (text: string) => (text ? text[0].toLocaleUpperCase("en") + text.slice(1) : text);

function compose(traits: string[], voices: string[], interests: string[]): string {
  const parts: string[] = [];
  if (traits.length) parts.push(`With people: ${traits.join(", ")}.`);
  if (voices.length) parts.push(`${upperFirst(voices.join("; "))}.`);
  if (interests.length) parts.push(`Into ${listJoin(interests)}.`);
  return parts.join(" ");
}

/**
 * The personality the script model writes from, built from the chips: always
 * the same sentence for the same choices, and never over PERSONALITY_MAX.
 * When it would be too long, the talk lines go first (from the last), then
 * interests, then traits. Empty when nothing was chosen.
 *
 * e.g. "With people: sarcastic, caring. Answers with dry, sarcastic
 * one-liners; checks on everyone, warm and gentle. Into football, anime and coffee."
 */
export function personalityFrom(about: Pick<AboutYou, "interests" | "ownInterests" | "manner">): string {
  const manners = mannerChoices(about);
  const traits = manners.map((m) => m.trait);
  const voices = manners.map((m) => m.voice);
  const interests = interestLabels(about);
  let text = compose(traits, voices, interests);
  while (text.length > PERSONALITY_MAX && voices.length) text = compose(traits, (voices.pop(), voices), interests);
  while (text.length > PERSONALITY_MAX && interests.length) text = compose(traits, voices, (interests.pop(), interests));
  while (text.length > PERSONALITY_MAX && traits.length) text = compose((traits.pop(), traits), voices, interests);
  return text;
}

/** The first person in the cast whose role is "self" (the narrator), or null. */
export function findSelf<T extends Pick<Character, "role">>(cast: T[]): T | null {
  return cast.find((member) => member.role === "self") ?? null;
}

/** True when the self character is drawn from the user's own photo (not the starter stand-in). */
export function hasOwnFace(character: Character): boolean {
  if (character.starter) return false;
  return Object.values(character.referenceSheets ?? {}).some((sheet) => sheet?.image.kind === "blob");
}

/** A sheet drawn from the user's photo in About you. */
export interface DrawnFace {
  /** How they look, as Muse Spark described the photo. */
  look: string;
  style: ArtStyleId;
  sheet: ReferenceSheet;
}

export interface AboutAnswers {
  name: string;
  aliases: string[];
  /** Missing while the steps are still being answered (a face can be saved before the chips). */
  about?: AboutYou;
  /** A new drawing from their photo; missing keeps the look they had. */
  face?: DrawnFace;
}

/**
 * The self character with the user's answers. The id stays the same, so old
 * comics still find them (their panels keep the names they were made with).
 *
 * A new face replaces the starter stand-in completely: their look, only the
 * new sheet (the other style is drawn when a comic first needs it), no
 * borrowed sprite. Without one, a starter self keeps the stand-in look and
 * pictures under the user's name until they add a photo.
 */
export function applyAboutYou(self: Character, answers: AboutAnswers): Character {
  const next: Character = {
    ...self,
    name: tidy(answers.name) || self.name,
    aliases: answers.aliases,
    role: "self",
    roleLabel: "You",
  };
  if (answers.face) {
    next.look = answers.face.look;
    next.referenceSheets = { [answers.face.style]: answers.face.sheet };
    next.spriteSheet = null;
    next.portrait = { kind: "art", path: "empty.cast" };
    next.starter = false;
  }
  if (answers.about) {
    next.about = answers.about;
    next.personality = personalityFrom(answers.about);
    const first = mannerChoices(answers.about)[0];
    if (first) next.line = first.line;
    else delete next.line;
  }
  return next;
}
