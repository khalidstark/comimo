/**
 * Matching people's names the way a voice note says them: "Teta", "تيتا",
 * "teta samia" and "تيتا سامية" should all find the same cast member.
 *
 * Shared by the browser (new-person checks, the cast form) and the server
 * (cleaning the script model's answer). No model calls here.
 */

/** Arabic short vowels, shadda, sukun, tanween, the dagger alef and tatweel. */
const ARABIC_MARKS = /[ً-ٰٟـ]/g;
/** Latin accents after NFKD. */
const LATIN_MARKS = /[̀-ͯ]/g;

/**
 * A name folded for comparison: case, accents and Arabic spelling variants
 * (أ إ آ ا, ة ه, ى ي, ؤ و, ئ ي) removed, punctuation dropped, spaces collapsed.
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(LATIN_MARKS, "")
    .replace(ARABIC_MARKS, "")
    .toLocaleLowerCase("en")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Anyone with a name and other names (aliases) they go by. */
export interface Named {
  id: string;
  name: string;
  aliases?: string[];
}

/** Every spelling a person is known by, normalized and without empties. */
export function namesOf(person: Named): string[] {
  return [...new Set([person.name, ...(person.aliases ?? [])].map(normalizeName).filter(Boolean))];
}

/**
 * The cast member a spoken name refers to, or null. An exact match on a name
 * or alias wins; otherwise a name whose words all appear in one of theirs
 * ("Samia" for "Teta Samia", "تيتا" for "تيتا سامية"), but only when exactly
 * one person matches that way, so "Omar" never lands on "Omar Khaled" when
 * there is also an "Omar Hany".
 */
export function findByName<T extends Named>(people: T[], spoken: string): T | null {
  const wanted = normalizeName(spoken);
  if (!wanted) return null;
  const exact = people.find((person) => namesOf(person).includes(wanted));
  if (exact) return exact;
  const words = wanted.split(" ");
  const partial = people.filter((person) =>
    namesOf(person).some((name) => {
      const theirs = name.split(" ");
      return words.every((word) => theirs.includes(word));
    }),
  );
  return partial.length === 1 ? partial[0] : null;
}

/** Most aliases kept per character, and the longest one. */
export const ALIAS_LIMITS = { count: 8, length: 32 } as const;

/**
 * Aliases from what the user typed: split on commas (Latin or Arabic) and new
 * lines, tidied, without duplicates or the character's own name.
 */
export function parseAliases(text: string, ownName = ""): string[] {
  const own = normalizeName(ownName);
  const seen = new Set<string>(own ? [own] : []);
  const aliases: string[] = [];
  for (const raw of text.split(/[,،\n]/)) {
    const alias = raw.replace(/\s+/g, " ").trim();
    const key = normalizeName(alias);
    if (!alias || !key || seen.has(key)) continue;
    seen.add(key);
    aliases.push(alias);
  }
  return aliases;
}
