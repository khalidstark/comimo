import { ALIAS_LIMITS, findByName, normalizeName, parseAliases, type Named } from "./names";
import type { CharacterRole, ComicScript, NewPerson, OneOff, ScriptPanel } from "./types";

/**
 * New people: people in a voice note who aren't in the cast yet, named
 * ("Omar") or not ("the cashier"). The script model lists them and draws them
 * under a placeholder id (new1 to new4); this file cleans that list (server),
 * and swaps the placeholders for a cast id or a one-off id once the user has
 * said who they are, before any panel is drawn (browser, 03-06).
 */

export const MAX_NEW_PEOPLE = 4;
/** The ids the script model may use for new people, in the order it lists them. */
export const NEW_PERSON_IDS = ["new1", "new2", "new3", "new4"] as const;
/** One-off characters (drawn for one story only) have ids starting with this. */
export const ONE_OFF_PREFIX = "oneoff:";

const MAX_LOOK = 300;
const NEW_PERSON_ROLES: CharacterRole[] = ["friend", "family", "teacher", "pet", "other"];
const NAME_CHARS = /^[\p{L}\p{M}\p{N} '’.-]+$/u;

export function isNewPersonId(id: string): boolean {
  return (NEW_PERSON_IDS as readonly string[]).includes(id);
}

export function isOneOffId(id: string): boolean {
  return id.startsWith(ONE_OFF_PREFIX);
}

function cleanName(value: unknown): string {
  if (typeof value !== "string") return "";
  const name = value.replace(/\s+/g, " ").trim();
  return name.length <= ALIAS_LIMITS.length && /\p{L}/u.test(name) && NAME_CHARS.test(name) ? name : "";
}

export interface ResolvedNewPeople {
  people: NewPerson[];
  /**
   * What each placeholder the model used stands for in the script: itself for
   * a kept new person, a cast id when the "new" person was a cast member after
   * all (a missed alias), the kept duplicate's placeholder, or null (dropped).
   */
  ids: Map<string, string | null>;
}

/**
 * The model's `newPeople` answer, checked: real names only, nobody already in
 * the cast (by name or alias, in either script), no duplicates, at most four.
 */
export function resolveNewPeople(value: unknown, cast: Named[]): ResolvedNewPeople {
  const people: NewPerson[] = [];
  const ids = new Map<string, string | null>();
  if (!Array.isArray(value)) return { people, ids };
  const seen = new Map<string, string | undefined>();
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const raw = item as Record<string, unknown>;
    const placeholder = typeof raw.id === "string" && isNewPersonId(raw.id) && !ids.has(raw.id) ? raw.id : undefined;
    const drop = (to: string | null = null) => {
      if (placeholder) ids.set(placeholder, to);
    };
    const name = cleanName(raw.name);
    if (!name) {
      drop();
      continue;
    }
    const mentioned = Array.isArray(raw.mentionedAs) ? raw.mentionedAs.map(cleanName).filter(Boolean) : [];
    const forms = [name, ...parseAliases(mentioned.join(","), name)].slice(0, ALIAS_LIMITS.count);
    // Anyone the cast already covers (the model missed an alias) is not new: their panels use the cast id.
    const known = forms.map((form) => findByName(cast, form)).find(Boolean);
    if (known) {
      drop(known.id);
      continue;
    }
    const keys = forms.map(normalizeName);
    const twin = keys.find((key) => seen.has(key));
    if (twin !== undefined) {
      drop(seen.get(twin) ?? null);
      continue;
    }
    if (people.length >= MAX_NEW_PEOPLE) {
      drop();
      continue;
    }
    keys.forEach((key) => seen.set(key, placeholder));
    const role = NEW_PERSON_ROLES.includes(raw.role as CharacterRole) ? (raw.role as CharacterRole) : "friend";
    const look = typeof raw.look === "string" ? raw.look.replace(/\s+/g, " ").trim().slice(0, MAX_LOOK) : "";
    people.push({
      name,
      mentionedAs: forms,
      role,
      look,
      ...(placeholder ? { id: placeholder } : {}),
      ...(raw.named === false ? { named: false } : {}),
    });
    if (placeholder) ids.set(placeholder, placeholder);
  }
  return { people, ids };
}

/** The checked list alone (see resolveNewPeople). */
export function cleanNewPeople(value: unknown, cast: Named[]): NewPerson[] {
  return resolveNewPeople(value, cast).people;
}

/**
 * A panel with every id swapped through `to` (null drops it): characters,
 * speakers (a dropped speaker's line goes), at most three characters, no repeats.
 */
export function remapPanel<T extends Pick<ScriptPanel, "characterIds" | "dialogue">>(panel: T, to: (id: string) => string | null): T {
  const characterIds = [...new Set(panel.characterIds.map(to).filter((id): id is string => id !== null))].slice(0, 3);
  const dialogue = panel.dialogue.flatMap((line) => {
    const speakerId = to(line.speakerId);
    return speakerId !== null && characterIds.includes(speakerId) ? [{ ...line, speakerId }] : [];
  });
  return { ...panel, characterIds, dialogue };
}

/** The key a "never for this name" choice is remembered under. */
export function newPersonKey(person: Pick<NewPerson, "name">): string {
  return normalizeName(person.name);
}

/**
 * The people to offer after a comic: not in the cast now (they may have been
 * added since), and not turned down for good or for this day.
 */
export function peopleToOffer(people: NewPerson[] | undefined, cast: Named[], declined: Set<string>): NewPerson[] {
  return (people ?? []).filter(
    (person) => !declined.has(newPersonKey(person)) && !person.mentionedAs.some((form) => findByName(cast, form)) && !findByName(cast, person.name),
  );
}

/* ---------- Choosing before drawing (03-06) ---------- */

/**
 * What the user said about one new person before the panels were drawn:
 * - "cast": added to the cast (the character, sheet drawn or being drawn);
 * - "oneoff": drawn just for this story;
 * - "never": drawn just for this story, and never asked about again;
 * - "skip": "Skip all" with no choice made: a one-off today, offered again after the comic.
 */
export type FaceChoice = { kind: "cast"; characterId: string; name: string } | { kind: "oneoff" } | { kind: "never" } | { kind: "skip" };

/** A one-off's id for a new person in this comic: stable for its placeholder. */
export function oneOffIdFor(person: NewPerson, index: number): string {
  return `${ONE_OFF_PREFIX}${person.id ?? `new${index + 1}`}`;
}

/** The one-off record for a new person: their name as said, their look from the note (may be ""). */
export function oneOffFor(person: NewPerson, index: number): OneOff {
  return { id: oneOffIdFor(person, index), name: person.name, look: person.look, role: person.role };
}

/**
 * The script with every new person's placeholder swapped for who they turned
 * out to be: the new cast member's id, or a one-off id (listed in `oneOffs`).
 * People the user skipped stay in `newPeople`, so the comic can offer them once;
 * everyone else is settled and leaves that list.
 */
export function applyFaceChoices(script: ComicScript, choices: Record<string, FaceChoice>): ComicScript {
  const people = script.newPeople ?? [];
  const map = new Map<string, string>();
  const oneOffs: OneOff[] = [...(script.oneOffs ?? [])];
  const skipped: NewPerson[] = [];
  people.forEach((person, index) => {
    const key = person.id ?? `new${index + 1}`;
    const choice = choices[key] ?? { kind: "skip" };
    if (choice.kind === "cast") {
      map.set(key, choice.characterId);
      return;
    }
    const oneOff = oneOffFor(person, index);
    if (!oneOffs.some((o) => o.id === oneOff.id)) oneOffs.push(oneOff);
    map.set(key, oneOff.id);
    if (choice.kind === "skip") skipped.push(person);
  });
  // A placeholder with no person behind it (the model used an id it didn't list) is dropped.
  const to = (id: string) => (isNewPersonId(id) ? (map.get(id) ?? null) : id);
  const panels = script.panels.map((panel) => remapPanel(panel, to));
  const { newPeople: _settled, ...rest } = script;
  void _settled;
  return {
    ...rest,
    panels,
    ...(oneOffs.length > 0 ? { oneOffs } : {}),
    ...(skipped.length > 0 ? { newPeople: skipped } : {}),
  };
}
