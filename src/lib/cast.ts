import { artAt } from "@/art/manifest";
import { starterCast, starterCastById } from "@/fixtures/cast";
import { PERSONALITY_MAX } from "./aboutYou";
import { ALIAS_LIMITS, namesOf, normalizeName, parseAliases } from "./names";
import { ANIMATIONS } from "@/art/sprites";
import { getCharacter, getImage, getMeta, listCast, newId, putImage, saveCharacter, setMeta } from "./store";
import type { ArtStyleId } from "./artStyles";
import type {
  ApiError,
  Character,
  CharacterRole,
  CharacterSheetRequest,
  CharacterSheetResponse,
  ImageRef,
  ReferenceSheet,
  SpriteRequest,
  SpriteResponse,
  SpriteSheet,
  WireImage,
} from "./types";
import { blobToWire, wireToBlob } from "./wireImage";

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
 * Starter characters stored before aliases existed have none; they get the
 * shipped ones ("Teta", "تيتا") until the user edits them.
 */
function withStarterAliases(character: Character): Character {
  if (character.aliases !== undefined || !character.starter) return character;
  const shipped = starterCastById[character.id]?.aliases;
  return shipped ? { ...character, aliases: shipped } : character;
}

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
    return cast.map(withStarterAliases).sort(byShippedOrder);
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
 * The character's reference sheet in a style, or null if it isn't drawn in
 * that style yet. Starter characters stored before the sheets shipped have
 * none in the store, so they use the fixture's drawn sheet by id.
 */
export function referenceSheetFor(character: Character, style: ArtStyleId): ReferenceSheet | null {
  const own = character.referenceSheets?.[style];
  if (own) return own;
  return character.starter ? (starterCastById[character.id]?.referenceSheets?.[style] ?? null) : null;
}

/** Names one sheet image; an uploaded file is only reused for the image it came from. */
export function referenceKey(ref: ImageRef): string {
  return ref.kind === "blob" ? `blob:${ref.id}` : `art:${artAt(ref.path).src}`;
}

/** The signed Files API token for the character's sheet in a style, if it was uploaded. */
export function referenceFileTokenFor(character: Character, style: ArtStyleId): string | undefined {
  const sheet = referenceSheetFor(character, style);
  return sheet?.file && sheet.file.sheet === referenceKey(sheet.image) ? sheet.file.token : undefined;
}

/** Keep an uploaded sheet's token on the character for a style (or forget it with null). */
export function withReferenceFile(character: Character, style: ArtStyleId, token: string | null): Character {
  const sheet = referenceSheetFor(character, style);
  if (!sheet) return character;
  const next: ReferenceSheet = { ...sheet };
  if (token) next.file = { token, sheet: referenceKey(sheet.image) };
  else delete next.file;
  return { ...character, referenceSheets: { ...character.referenceSheets, [style]: next } };
}

/** A sheet-drawing failure with a message the cast screen can show. */
export class SheetError extends Error {
  name = "SheetError";
}

/**
 * Ask Muse Image for the character's reference sheet in a style, keep the
 * image on this device and save the character with it. Returns the updated character.
 */
export async function drawReferenceSheet(character: Character, style: ArtStyleId, signal?: AbortSignal): Promise<Character> {
  return (await requestSheet(character, style, signal)).character;
}

/**
 * Draw the character's sheet with the person cut from their photo as the
 * reference. The photo goes in this one request and is never stored: the
 * caller drops it once this resolves. `photoRefused` is true when Muse Image
 * wouldn't use the photo and drew from the written look instead.
 */
export function drawReferenceSheetFromPhoto(
  character: Character,
  style: ArtStyleId,
  photo: WireImage,
  signal?: AbortSignal,
): Promise<{ character: Character; photoRefused: boolean }> {
  return requestSheet(character, style, signal, photo);
}

async function requestSheet(
  character: Character,
  style: ArtStyleId,
  signal?: AbortSignal,
  photo?: WireImage,
): Promise<{ character: Character; photoRefused: boolean }> {
  const body: CharacterSheetRequest = {
    characterId: character.id,
    name: character.name,
    role: character.role,
    look: character.look,
    style,
    ...(photo ? { photo, consent: true } : {}),
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

  const imageId = `${character.id}-sheet-${style}`;
  if (!(await putImage(imageId, wireToBlob(result.image)))) {
    throw new SheetError("Couldn't keep the sheet on this device. Private windows can block storage.");
  }
  const image: ImageRef = { kind: "blob", id: imageId };
  const sheet: ReferenceSheet = { image };
  if (result.sheetToken) sheet.sheetToken = result.sheetToken;
  if (result.fileToken) sheet.file = { token: result.fileToken, sheet: referenceKey(image) };
  const drawn = await updateStoredCharacter(character, (current) => ({
    ...current,
    referenceSheets: { ...current.referenceSheets, [style]: sheet },
  }));
  if (!drawn) throw new SheetError("Couldn't save the sheet on this device. Private windows can block storage.");
  return { character: drawn, photoRefused: result.photoRefused === true };
}

/**
 * Apply a change to the stored copy of a character (falling back to the one
 * in hand) and save it, so a sheet and a sprite finishing at the same time
 * don't overwrite each other. Null when storage refused.
 */
async function updateStoredCharacter(character: Character, change: (current: Character) => Character): Promise<Character | null> {
  const stored = await getCharacter(character.id);
  const next = change(stored ? withStarterAliases(stored) : character);
  return (await saveCharacter(next)) ? next : null;
}

/* ---------- Adding someone new ---------- */

/** How adding a new person to the cast went, in words for the screen. */
export interface JoinResult {
  /** The character as saved (with the sheet when it drew). */
  character: Character;
  message: string;
  /** True when they joined but the sheet didn't draw. */
  sheetFailed: boolean;
}

/**
 * Add a new person to the cast and draw their sheet once in `style`, from
 * the photo's cut-out when there is one (used for this one drawing and then
 * dropped) or from the written look. Null when the browser won't save. The
 * animated sprite is up to the caller (animateCharacter).
 */
export async function joinCast(added: Character, style: ArtStyleId, photo: WireImage | null, signal?: AbortSignal): Promise<JoinResult | null> {
  if (!(await saveCharacter(added))) return null;
  try {
    if (photo) {
      const { character, photoRefused } = await drawReferenceSheetFromPhoto(added, style, photo, signal);
      return {
        character,
        sheetFailed: false,
        message: photoRefused
          ? `Muse Image wouldn't draw from that photo, so ${character.name} was drawn from the description instead. The photo is gone.`
          : `${character.name} is in your cast, drawn from the photo. The photo is gone; only the drawing is kept.`,
      };
    }
    const character = await drawReferenceSheet(added, style, signal);
    return { character, sheetFailed: false, message: `${character.name} is in your cast and looks the same from now on.` };
  } catch (problem) {
    if (signal?.aborted) throw problem;
    return {
      character: added,
      sheetFailed: true,
      message: `${added.name} joined your cast, but the sheet didn't draw (${problem instanceof SheetError ? problem.message : "try again"}).`,
    };
  }
}

/* ---------- Animated sprites ---------- */

/** A drawn sheet the server will animate: a stored Blob with its server signature (prefers the zine one). */
function animatableSheet(character: Character): ReferenceSheet | null {
  for (const style of ["zine", "painterly"] as const) {
    const sheet = character.referenceSheets?.[style];
    if (sheet?.image.kind === "blob" && sheet.sheetToken) return sheet;
  }
  return null;
}

/** True when the character has no sprite yet but a sheet that can be animated. */
export function canAnimate(character: Character): boolean {
  return !spriteSheetFor(character) && animatableSheet(character) !== null;
}

const animating = new Map<string, Promise<Character | null>>();
/** Set when the server said sprites aren't available (mock mode), so nobody asks again this session. */
let spritesUnavailable = false;

/**
 * Give a character their animated sprite once: five Muse Image poses from
 * their reference sheet, assembled on the server. Resolves to the updated
 * character, or null when it couldn't be made (the card keeps the still
 * picture). Concurrent calls for one character share the request.
 */
export function animateCharacter(character: Character): Promise<Character | null> {
  if (spritesUnavailable || !canAnimate(character)) return Promise.resolve(null);
  const pending = animating.get(character.id);
  if (pending) return pending;
  const run = (async () => {
    const sheet = animatableSheet(character)!;
    const blob = sheet.image.kind === "blob" ? await getImage(sheet.image.id) : undefined;
    if (!blob) return null;
    const body: SpriteRequest = {
      characterId: character.id,
      name: character.name,
      role: character.role,
      look: character.look,
      sheet: await blobToWire(blob),
      ...(sheet.sheetToken ? { sheetToken: sheet.sheetToken } : {}),
    };
    let response: Response;
    try {
      response = await fetch("/api/sprite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch {
      return null;
    }
    const result = (await response.json().catch(() => null)) as SpriteResponse | ApiError | null;
    if (!response.ok || !result || !("image" in result)) {
      if ((result as ApiError | null)?.code === "unavailable") spritesUnavailable = true;
      return null;
    }
    const spriteId = `${character.id}-sprite`;
    const portraitId = `${character.id}-portrait`;
    const stored = (await putImage(spriteId, wireToBlob(result.image))) && (await putImage(portraitId, wireToBlob(result.portrait)));
    if (!stored) return null;
    const spriteSheet: SpriteSheet = {
      image: { kind: "blob", id: spriteId },
      frameWidth: result.frameWidth,
      frameHeight: result.frameHeight,
      columns: result.columns,
      animations: ANIMATIONS,
    };
    return updateStoredCharacter(character, (current) => ({ ...current, spriteSheet, portrait: { kind: "blob", id: portraitId } }));
  })().finally(() => animating.delete(character.id));
  animating.set(character.id, run);
  return run;
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
  /** Other names, comma separated as typed ("Teta, تيتا"). */
  aliases: string;
  role: CharacterRole;
  roleLabel: string;
  look: string;
  personality: string;
  line: string;
}

export type DraftField = keyof CharacterDraft;
export type DraftErrors = Partial<Record<DraftField, string>>;

export const LIMITS = { name: 32, aliases: 200, roleLabel: 24, look: 400, personality: PERSONALITY_MAX, line: 90 } as const;
const MIN_LOOK = 12;

/** Letters from any script, marks, digits, spaces and a little punctuation names use (O'Neil, Al-Sayed, Jr.). */
const NAME_CHARS = /^[\p{L}\p{M}\p{N} '’.-]+$/u;
const HAS_LETTER = /\p{L}/u;

const tidy = (text: string) => text.replace(/\s+/g, " ").trim();

export function draftFrom(character?: Character): CharacterDraft {
  return {
    name: character?.name ?? "",
    aliases: (character?.aliases ?? []).join(", "),
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
  else {
    const clash = others.find((member) => namesOf(member).includes(normalizeName(name)));
    if (clash) errors.name = clash.name === name ? `${name} is already in your cast.` : `${clash.name} already goes by ${name}.`;
  }

  const aliases = parseAliases(draft.aliases, name);
  if (draft.aliases.length > LIMITS.aliases) errors.aliases = `Keep other names under ${LIMITS.aliases} characters.`;
  else if (aliases.length > ALIAS_LIMITS.count) errors.aliases = `Up to ${ALIAS_LIMITS.count} other names.`;
  else if (aliases.some((alias) => alias.length > ALIAS_LIMITS.length)) errors.aliases = `Keep each name under ${ALIAS_LIMITS.length} characters.`;
  else if (aliases.some((alias) => !HAS_LETTER.test(alias) || !NAME_CHARS.test(alias))) {
    errors.aliases = "Use letters, spaces, apostrophes, dots or hyphens, with commas between names.";
  } else {
    for (const alias of aliases) {
      const clash = others.find((member) => namesOf(member).includes(normalizeName(alias)));
      if (clash) {
        errors.aliases = `${clash.name} already goes by ${alias}.`;
        break;
      }
    }
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
    referenceSheets: {},
    spriteSheet: null,
    starter: false,
    createdAt: new Date().toISOString(),
  };
  const next: Character = {
    ...base,
    name: tidy(draft.name),
    aliases: parseAliases(draft.aliases, draft.name),
    role: draft.role,
    roleLabel,
    look: tidy(draft.look),
    personality: tidy(draft.personality),
  };
  if (line) next.line = line;
  else delete next.line;
  return next;
}
