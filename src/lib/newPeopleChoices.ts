import { newPersonKey } from "./newPeople";
import { getMeta, setMeta } from "./store";
import type { NewPerson } from "./types";

/**
 * What this device remembers about new people: names the user said "Never
 * ask" to (for good), and names they said "Not now" to after one comic.
 * Browser only (IndexedDB through the store).
 */

/** Names the user said "Never ask for this name" to, on this device. */
const NEVER_KEY = "newPeople:never";
/** Names the user said "Not now" to, for one day. */
const laterKey = (dayId: string) => `newPeople:later:${dayId}`;

async function readList(key: string): Promise<string[]> {
  const value = await getMeta(key);
  if (typeof value !== "string") return [];
  try {
    const list: unknown = JSON.parse(value);
    return Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

async function remember(key: string, name: string) {
  const list = await readList(key);
  if (!list.includes(name)) await setMeta(key, JSON.stringify([...list, name].slice(-200)));
}

/** Name keys never to ask about again (see newPersonKey). */
export async function neverAskKeys(): Promise<Set<string>> {
  return new Set(await readList(NEVER_KEY));
}

/** Name keys declined for good or for this day. */
export async function declinedKeys(dayId: string): Promise<Set<string>> {
  const [never, later] = await Promise.all([readList(NEVER_KEY), readList(laterKey(dayId))]);
  return new Set([...never, ...later]);
}

/** Stop asking about this name on this device (best effort). */
export function rememberNever(person: Pick<NewPerson, "name">): Promise<void> {
  return remember(NEVER_KEY, newPersonKey(person));
}

/** Don't offer this name again after this day's comic (best effort). */
export function rememberLater(dayId: string, person: Pick<NewPerson, "name">): Promise<void> {
  return remember(laterKey(dayId), newPersonKey(person));
}
