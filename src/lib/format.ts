import type { Mood } from "./types";

/** Day weather as a word. Never a number or score. */
export const moodWords: Record<Mood, string> = {
  sunny: "Sunny",
  cloudy: "Cloudy",
  rainy: "Rainy",
  stormy: "Stormy",
  rainbow: "Rainbow",
};

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** "Thursday 29 October" from an ISO date. */
export function formatDay(iso: string): string {
  return dayFormat.format(new Date(`${iso}T00:00:00Z`));
}

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** Small counts as words ("four"), larger ones as digits. */
export function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}
