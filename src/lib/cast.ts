import { starterCast, starterCastById } from "@/fixtures/cast";
import { getMeta, listCast, newId, saveCharacter, setMeta } from "./store";
import type { Character, CharacterRole, SpriteSheet } from "./types";

/* ---------- Loading and seeding ---------- */

const SEEDED_KEY = "starterCastSeeded";

/**
 * The user's cast from the store. The invented starter cast is written once,
 * on the first run; after that the store is the truth, so a cast the user
 * emptied stays empty.
 */
export async function loadCast(): Promise<Character[]> {
  const [cast, seeded] = await Promise.all([listCast(), getMeta(SEEDED_KEY)]);
  if (seeded || cast.length > 0) {
    // Devices seeded before the flag existed get it now.
    if (!seeded) await setMeta(SEEDED_KEY, true);
    return cast;
  }
  const saved = await Promise.all(starterCast.map((character) => saveCharacter(character)));
  if (saved.every(Boolean)) await setMeta(SEEDED_KEY, true);
  return starterCast;
}

/**
 * The sheet to animate for a character. Starter characters seeded before the
 * sheets existed have `spriteSheet: null` in the store, so they borrow the
 * fixture's placeholder sheet by id.
 */
export function spriteSheetFor(character: Character): SpriteSheet | null {
  if (character.spriteSheet) return character.spriteSheet;
  return character.starter ? (starterCastById[character.id]?.spriteSheet ?? null) : null;
}

/* ---------- Roles ---------- */

export const ROLE_OPTIONS: { value: CharacterRole; label: string }[] = [
  { value: "self", label: "You" },
  { value: "friend", label: "Friend" },
  { value: "family", label: "Family" },
  { value: "teacher", label: "Teacher" },
  { value: "pet", label: "Pet" },
  { value: "other", label: "Someone else" },
];

export function defaultRoleLabel(role: CharacterRole): string {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label ?? "Someone else";
}

/* ---------- Drafts and validation ---------- */

export interface CharacterDraft {
  name: string;
  role: CharacterRole;
  roleLabel: string;
  look: string;
  personality: string;
  line: string;
}

export type DraftField = keyof CharacterDraft;
export type DraftErrors = Partial<Record<DraftField, string>>;

export const LIMITS = { name: 32, roleLabel: 24, look: 400, personality: 300, line: 90 } as const;
const MIN_LOOK = 12;

/** Letters from any script, marks, digits, spaces and a little punctuation names use (O'Neil, Al-Sayed, Jr.). */
const NAME_CHARS = /^[\p{L}\p{M}\p{N} '’.-]+$/u;
const HAS_LETTER = /\p{L}/u;

const tidy = (text: string) => text.replace(/\s+/g, " ").trim();

export function draftFrom(character?: Character): CharacterDraft {
  return {
    name: character?.name ?? "",
    role: character?.role ?? "friend",
    roleLabel: character?.roleLabel ?? "",
    look: character?.look ?? "",
    personality: character?.personality ?? "",
    line: character?.line ?? "",
  };
}

/** Field errors in plain words; an empty object means the draft can be saved. */
export function validateDraft(draft: CharacterDraft, others: Character[]): DraftErrors {
  const errors: DraftErrors = {};
  const name = tidy(draft.name);

  if (!name) errors.name = "Give them a name.";
  else if (name.length > LIMITS.name) errors.name = `Keep the name under ${LIMITS.name} characters.`;
  else if (!HAS_LETTER.test(name)) errors.name = "A name needs at least one letter.";
  else if (!NAME_CHARS.test(name)) errors.name = "Use letters, spaces, apostrophes, dots or hyphens.";
  else if (others.some((member) => member.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    errors.name = `${name} is already in your cast.`;
  }

  if (!ROLE_OPTIONS.some((option) => option.value === draft.role)) errors.role = "Pick who they are to you.";
  if (tidy(draft.roleLabel).length > LIMITS.roleLabel) {
    errors.roleLabel = `Keep this under ${LIMITS.roleLabel} characters.`;
  }

  const look = tidy(draft.look);
  if (!look) errors.look = "Describe how they look, so every panel draws the same person.";
  else if (look.length < MIN_LOOK) errors.look = "Add a little more: hair, clothes, something they always carry.";
  else if (look.length > LIMITS.look) errors.look = `Keep the look under ${LIMITS.look} characters.`;

  if (tidy(draft.personality).length > LIMITS.personality) {
    errors.personality = `Keep this under ${LIMITS.personality} characters.`;
  }
  if (tidy(draft.line).length > LIMITS.line) errors.line = `Keep their line under ${LIMITS.line} characters.`;

  return errors;
}

/** A new or edited character from a valid draft. Pictures stay as they were (new ones wait for the credits). */
export function characterFromDraft(draft: CharacterDraft, existing?: Character): Character {
  const roleLabel = tidy(draft.roleLabel) || defaultRoleLabel(draft.role);
  const line = tidy(draft.line);
  const base: Character = existing ?? {
    id: newId(),
    name: "",
    role: draft.role,
    roleLabel,
    look: "",
    personality: "",
    // Not drawn yet: the empty-cast outline stands in until Muse Image draws them.
    portrait: { kind: "art", path: "empty.cast" },
    referenceSheet: null,
    spriteSheet: null,
    starter: false,
    createdAt: new Date().toISOString(),
  };
  const next: Character = {
    ...base,
    name: tidy(draft.name),
    role: draft.role,
    roleLabel,
    look: tidy(draft.look),
    personality: tidy(draft.personality),
  };
  if (line) next.line = line;
  else delete next.line;
  return next;
}
