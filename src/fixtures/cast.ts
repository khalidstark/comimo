import type { CastBrief, Character } from "@/lib/types";

/**
 * The invented starter cast. Nobody here is a real person; they exist so every
 * page and the mock model layer have characters before the user makes their own.
 */

const SHIPPED = "2026-10-01T00:00:00.000Z";

export const starterCast: Character[] = [
  {
    id: "nour",
    name: "Nour",
    role: "self",
    roleLabel: "You",
    look:
      "Woman in her early twenties, shoulder-length curly dark hair held up in a claw clip, round tortoiseshell glasses, mustard cardigan over a navy T-shirt, a canvas tote bag covered in enamel pins.",
    personality:
      "Always five minutes late, narrates her own life in her head, switches between Egyptian Arabic and English mid-sentence, dry humour over a soft heart.",
    line: "Five more minutes. I mean it this time.",
    portrait: { kind: "art", path: "sprites.nour" },
    referenceSheet: null,
    spriteSheet: null,
    starter: true,
    createdAt: SHIPPED,
  },
  {
    id: "karim",
    name: "Karim",
    role: "friend",
    roleLabel: "Best friend",
    look:
      "Tall, lanky young man with a short fade haircut and a thin moustache he is proud of, oversized olive bomber jacket, white trainers, usually holding a phone or a glass of tea.",
    personality:
      "Loud and loyal, always 'on his way', solves every problem with food or a car ride, drops English slang into Egyptian Arabic.",
    line: "أنا جاي، I'm literally on my way",
    portrait: { kind: "art", path: "sprites.karim" },
    referenceSheet: null,
    spriteSheet: null,
    starter: true,
    createdAt: SHIPPED,
  },
  {
    id: "teta",
    name: "Teta Samia",
    role: "family",
    roleLabel: "Grandmother",
    look:
      "Small, round grandmother with silver hair under a lilac headscarf, reading glasses on a beaded chain, a floral house dress and soft slippers.",
    personality:
      "Feeds you first and asks questions later, teases with love, speaks Egyptian Arabic and pretends not to understand English when it suits her.",
    line: "كُلي الأول، وبعدين نتكلم",
    portrait: { kind: "art", path: "sprites.teta" },
    referenceSheet: null,
    spriteSheet: null,
    starter: true,
    createdAt: SHIPPED,
  },
  {
    id: "mishmish",
    name: "Mishmish",
    role: "pet",
    roleLabel: "The cat",
    look: "Chubby orange tabby cat with a white chest, one bent ear and a very fluffy tail.",
    personality: "Steals warm seats, sleeps on homework, judges everyone in silence.",
    line: "Mrrp. (He wants your seat.)",
    portrait: { kind: "art", path: "sprites.mishmish" },
    referenceSheet: null,
    spriteSheet: null,
    starter: true,
    createdAt: SHIPPED,
  },
];

export const starterCastById: Record<string, Character> = Object.fromEntries(
  starterCast.map((character) => [character.id, character]),
);

/** The starter cast as the script model sees it. */
export const starterCastBriefs: CastBrief[] = starterCast.map(({ id, name, role, look, personality }) => ({
  id,
  name,
  role,
  look,
  personality,
}));
