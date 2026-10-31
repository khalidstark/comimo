import type { LanguageHint, LanguageMix, LanguageTag } from "./types";

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const LATIN = /[A-Za-zÀ-ɏ]/;

/** Which languages the transcript uses, by counting words in each script. */
export function detectLanguages(text: string, hint: LanguageHint): LanguageMix {
  let ar = 0;
  let en = 0;
  for (const word of text.split(/\s+/)) {
    if (ARABIC.test(word)) ar += 1;
    else if (LATIN.test(word)) en += 1;
  }
  if (ar === 0 && en === 0) {
    const dominant: LanguageTag = hint === "ar" ? "ar" : "en";
    return { spoken: [dominant], dominant, mixed: false };
  }
  const dominant: LanguageTag = ar === en ? (hint === "en" ? "en" : "ar") : ar > en ? "ar" : "en";
  const other: LanguageTag = dominant === "ar" ? "en" : "ar";
  const mixed = ar > 0 && en > 0;
  return { spoken: mixed ? [dominant, other] : [dominant], dominant, mixed };
}
