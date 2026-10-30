import type { MoodKey, SceneKey, SpriteKey } from "@/art/manifest";

/**
 * Invented demo content: a starter cast and a few sample days, so every page
 * has something real to show before anyone records. Nothing here is a real
 * person or a real diary.
 */

export interface CastMember {
  id: SpriteKey;
  name: string;
  role: string;
  /** One line in their own voice, shown in a speech bubble. */
  line: string;
}

export const starterCast: CastMember[] = [
  { id: "nour", name: "Nour", role: "You", line: "Five more minutes. I mean it this time." },
  { id: "karim", name: "Karim", role: "Best friend", line: "أنا جاي، I'm literally on my way" },
  { id: "teta", name: "Teta Samia", role: "Grandmother", line: "كُلي الأول، وبعدين نتكلم" },
  { id: "mishmish", name: "Mishmish", role: "The cat", line: "Mrrp. (He wants your seat.)" },
];

export interface Bubble {
  who: string;
  text: string;
}

export interface Panel {
  scene: SceneKey;
  caption?: string;
  bubbles: Bubble[];
}

export interface Day {
  id: string;
  /** ISO date, local day. */
  date: string;
  title: string;
  mood: MoodKey;
  /** Whether the day sounded heavy enough for the check-in card. */
  heavy: boolean;
  panels: Panel[];
}

export const sampleDays: Day[] = [
  {
    id: "sample-teta",
    date: "2026-10-04",
    title: "Teta's birthday, round two",
    mood: "rainbow",
    heavy: false,
    panels: [
      { scene: "home", caption: "Teta insisted on a second cake.", bubbles: [{ who: "Teta Samia", text: "الكيكة الأولى كانت تجربة بس" }] },
      { scene: "home", bubbles: [{ who: "Nour", text: "A test? We ate all of it." }] },
      { scene: "home", caption: "Meanwhile, under the table.", bubbles: [{ who: "Mishmish", text: "Mrrp." }] },
      { scene: "rooftop", caption: "Later.", bubbles: [{ who: "Nour", text: "Best day this month, honestly." }] },
    ],
  },
  {
    id: "sample-deadline",
    date: "2026-10-12",
    title: "Two deadlines, one me",
    mood: "stormy",
    heavy: true,
    panels: [
      { scene: "desk", caption: "Three tabs. Two deadlines. One me.", bubbles: [{ who: "Nour", text: "مش هلحق، I won't make it" }] },
      { scene: "desk", bubbles: [{ who: "Teta Samia", text: "كلتي حاجة؟" }] },
      { scene: "desk", caption: "9:40 pm.", bubbles: [{ who: "Nour", text: "Still on slide four." }] },
      { scene: "desk", caption: "11:52 pm.", bubbles: [{ who: "Nour", text: "Sent. Nobody talk to me." }] },
    ],
  },
  {
    id: "sample-rooftop",
    date: "2026-10-21",
    title: "Rooftop tea with Karim",
    mood: "sunny",
    heavy: false,
    panels: [
      { scene: "rooftop", caption: "Golden hour, finally.", bubbles: [{ who: "Karim", text: "الشاي ده أحسن من أي café" }] },
      { scene: "rooftop", bubbles: [{ who: "Nour", text: "We should do this every Thursday." }] },
      { scene: "rooftop", caption: "We won't.", bubbles: [] },
      { scene: "rooftop", caption: "But still.", bubbles: [{ who: "Karim", text: "Same time next week?" }] },
    ],
  },
  {
    id: "sample",
    date: "2026-10-29",
    title: "The bus that never came",
    mood: "cloudy",
    heavy: false,
    panels: [
      { scene: "street", caption: "7:40 am. Already late.", bubbles: [{ who: "Nour", text: "يلا يا باص… any minute now" }] },
      { scene: "street", caption: "8:15 am.", bubbles: [{ who: "Nour", text: "OK, now it's personal." }] },
      { scene: "street", bubbles: [{ who: "Karim", text: "اركبي معايا، أنا جاي" }] },
      { scene: "rooftop", caption: "Evening.", bubbles: [{ who: "Nour", text: "Worst morning. Best shawarma." }] },
    ],
  },
];

export const checkInQuestions = [
  "What took the most out of you today?",
  "Is there one thing you can set down until tomorrow?",
  "Who would you want to tell about today?",
];

export function getSampleDay(id: string): Day | undefined {
  return sampleDays.find((day) => day.id === id);
}

export const moodWords: Record<MoodKey, string> = {
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

export function formatDay(iso: string): string {
  return dayFormat.format(new Date(`${iso}T00:00:00Z`));
}
