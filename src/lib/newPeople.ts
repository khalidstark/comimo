import { ALIAS_LIMITS, findByName, normalizeName, parseAliases, type Named } from "./names";
import type { CharacterRole, NewPerson } from "./types";

/**
 * New people: named people in a voice note who aren't in the cast yet. The
 * script model lists them; this file cleans that list (server) and decides
 * which ones to offer after the comic (browser).
 */

export const MAX_NEW_PEOPLE = 4;
const MAX_LOOK = 300;
const NEW_PERSON_ROLES: CharacterRole[] = ["friend", "family", "teacher", "pet", "other"];
const NAME_CHARS = /^[\p{L}\p{M}\p{N} '’.-]+$/u;

function cleanName(value: unknown): string {
  if (typeof value !== "string") return "";
  const name = value.replace(/\s+/g, " ").trim();
  return name.length <= ALIAS_LIMITS.length && /\p{L}/u.test(name) && NAME_CHARS.test(name) ? name : "";
}

/**
 * The model's `newPeople` answer, checked: real names only, nobody already in
 * the cast (by name or alias, in either script), no duplicates, at most four.
 */
export function cleanNewPeople(value: unknown, cast: Named[]): NewPerson[] {
  if (!Array.isArray(value)) return [];
  const people: NewPerson[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const raw = item as Record<string, unknown>;
    const name = cleanName(raw.name);
    if (!name) continue;
    const mentioned = Array.isArray(raw.mentionedAs) ? raw.mentionedAs.map(cleanName).filter(Boolean) : [];
    const forms = [name, ...parseAliases(mentioned.join(","), name)].slice(0, ALIAS_LIMITS.count);
    // Anyone the cast already covers (the model missed an alias) is not new.
    if (forms.some((form) => findByName(cast, form))) continue;
    const keys = forms.map(normalizeName);
    if (keys.some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));
    const role = NEW_PERSON_ROLES.includes(raw.role as CharacterRole) ? (raw.role as CharacterRole) : "friend";
    const look = typeof raw.look === "string" ? raw.look.replace(/\s+/g, " ").trim().slice(0, MAX_LOOK) : "";
    people.push({ name, mentionedAs: forms, role, look });
    if (people.length >= MAX_NEW_PEOPLE) break;
  }
  return people;
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
