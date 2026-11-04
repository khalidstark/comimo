import type { PersonMatch, PhotoPerson } from "./index";

/**
 * The pure part of today's outfit: which people in the day's
 * photos are worth a look, and which matches are sure enough to dress.
 */

/** People dressed per day. */
export const MAX_DRESSED = 3;
/** People looked at per photo. */
export const PEOPLE_PER_PHOTO = 3;
/** Below this the match is a guess: skip it quietly. */
export const MATCH_CONFIDENCE = 0.7;

/** Confident, not tiny (2% of the photo), biggest first, at most three. */
export function peopleWorthALook(people: PhotoPerson[], width: number, height: number): PhotoPerson[] {
  const area = (p: PhotoPerson) => (p.x2 - p.x1) * (p.y2 - p.y1);
  return people
    .filter((p) => p.score >= 0.4 && area(p) / (width * height) >= 0.02)
    .sort((a, b) => area(b) - area(a))
    .slice(0, PEOPLE_PER_PHOTO);
}

/** One sure match per character, in `order` (the narrator first), at most three. */
export function pickMatches(matches: PersonMatch[], order: string[]): PersonMatch[] {
  const best = new Map<string, PersonMatch>();
  for (const match of matches) {
    if (match.confidence < MATCH_CONFIDENCE) continue;
    const current = best.get(match.characterId);
    if (!current || match.confidence > current.confidence) best.set(match.characterId, match);
  }
  return order.flatMap((id) => best.get(id) ?? []).slice(0, MAX_DRESSED);
}
