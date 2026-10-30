import { artAt } from "@/art/manifest";
import { starterCast, starterCastById } from "@/fixtures/cast";
import { getMeta, listCast, newId, putImage, saveCharacter, setMeta } from "./store";
import type {
  ApiError,
  Character,
  CharacterRole,
  CharacterSheetRequest,
  CharacterSheetResponse,
  ImageRef,
  SpriteSheet,
} from "./types";
import { wireToBlob } from "./wireImage";

/* ---------- Loading and seeding ---------- */

const STARTER_ORDER = new Map(starterCast.map((character, i) => [character.id, i]));

/** Oldest first; the starter cast shares one date, so it keeps the order it ships in. */
function byShippedOrder(a: Character, b: Character): number {
  return (
    a.createdAt.localeCompare(b.createdAt) ||
    (STARTER_ORDER.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (STARTER_ORDER.get(b.id) ?? Number.MAX_SAFE_INTEGER)
  );
}

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
    return [...cast].sort(byShippedOrder);
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

/* ---------- Reference sheets ---------- */

/**
 * The character's reference sheet. Starter characters seeded before the
 * sheets shipped have `referenceSheet: null` in the store, so they use the
 * fixture's drawn sheet by id.
 */
export function referenceSheetFor(character: Character): ImageRef | null {
  if (character.referenceSheet) return character.referenceSheet;
  return character.starter ? (starterCastById[character.id]?.referenceSheet ?? null) : null;
}

/** Names one sheet; an uploaded file is only reused for the sheet it came from. */
export function referenceKey(ref: ImageRef): string {
  return ref.kind === "blob" ? `blob:${ref.id}` : `art:${artAt(ref.path).src}`;
}

/** The signed Files API token for the character's current sheet, if it was uploaded. */
export function referenceFileTokenFor(character: Character): string | undefined {
  const sheet = referenceSheetFor(character);
  const file = character.referenceFile;
  return sheet && file && file.sheet === referenceKey(sheet) ? file.token : undefined;
}

/** Keep an uploaded sheet's token on the character (or forget it with null). */
export function withReferenceFile(character: Character, token: string | null): Character {
  const sheet = referenceSheetFor(character);
  const next = { ...character };
  if (token && sheet) next.referenceFile = { token, sheet: referenceKey(sheet) };
  else delete next.referenceFile;
  return next;
}

/** A sheet-drawing failure with a message the cast screen can show. */
export class SheetError extends Error {
  name = "SheetError";
}

/**
 * Ask Muse Image for the character's reference sheet, keep the image on this
 * device and save the character with it. Returns the updated character.
 */
export async function drawReferenceSheet(character: Character, signal?: AbortSignal): Promise<Character> {
  const body: CharacterSheetRequest = {
    characterId: character.id,
    name: character.name,
    role: character.role,
    look: character.look,
  };
  let response: Response;
  try {
    response = await fetch("/api/character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new SheetError("Couldn't reach Comimo. Check your connection and try again.");
  }
  const result = (await response.json().catch(() => null)) as CharacterSheetResponse | ApiError | null;
  if (!response.ok || !result || !("image" in result)) {
    throw new SheetError((result as ApiError | null)?.error || `The sheet didn't draw (${response.status}). Try again.`);
  }

  const imageId = `${character.id}-sheet`;
  if (!(await putImage(imageId, wireToBlob(result.image)))) {
    throw new SheetError("Couldn't keep the sheet on this device. Private windows can block storage.");
  }
  const drawn = withReferenceFile({ ...character, referenceSheet: { kind: "blob", id: imageId } }, result.fileToken);
  if (!(await saveCharacter(drawn))) {
    throw new SheetError("Couldn't save the sheet on this device. Private windows can block storage.");
  }
  return drawn;
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
