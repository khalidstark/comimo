/**
 * The walkthrough's invented day: Nour's Friday dinner at Teta's, with two
 * names the cast doesn't know yet (Omar and "the cashier").
 */

export type Segment = { t: string; who?: "teta" | "karim" | "mishmish" | "nour"; unknown?: "omar" | "cashier" };

export const SCRIPT: Segment[] = [
  { t: "Friday dinner at " },
  { t: "Teta", who: "teta" },
  { t: "'s flat. " },
  { t: "Karim", who: "karim" },
  { t: " was forty minutes late again: he and " },
  { t: "Omar", unknown: "omar" },
  { t: " stopped at the bakery, and " },
  { t: "the cashier", unknown: "cashier" },
  { t: " slipped them extra basbousa. Teta kept piling molokhia on his plate. " },
  { t: "Mishmish", who: "mishmish" },
  { t: " waited under the table for chicken. Then the power cut out, and we finished by candlelight, laughing in the dark." },
];

export const SCRIPT_TEXT = SCRIPT.map((s) => s.t).join("");

/** The chapter Muse Spark writes: one beat per panel. */
export const BEATS = [
  { shot: "Establishing", text: "Forty minutes late. Again.", kind: "caption" },
  { shot: "Medium", text: "Teta: “You are too thin. Eat.”", kind: "dialogue" },
  { shot: "Close-up", text: "Karim: “Teta, I swear I ate before I came!”", kind: "dialogue" },
  { shot: "Detail", text: "Mishmish, on chicken watch.", kind: "caption" },
  { shot: "Splash", text: "Then the lights went out.", kind: "caption" },
] as const;

export const OMAR_LOOK =
  "Adult man with short curly dark hair. Thin round glasses, a short beard and moustache. A white T-shirt under a light-blue denim jacket, a brown crossbody bag.";
