import { art, type ArtAsset } from "@/art/manifest";

/**
 * The home page's demo: one real Comimo run on an invented day (lunch at
 * Teta Samia's), saved from the 03-02 pipeline test. Every panel was drawn by
 * Muse Image from the starter cast's reference sheets, once per art style.
 * Captions and bubbles are lettered here, the way the reader letters them.
 */

export type DemoStyle = "zine" | "painterly";

export interface DemoPanel {
  /** Wide panels take a full row of the page. */
  wide: boolean;
  art: Record<DemoStyle, ArtAsset>;
  caption: string;
  speaker: string;
  line: string;
  /** The same scene drawn without the cast's sheets, for the before/after flip. */
  before?: Record<DemoStyle, ArtAsset>;
}

export const DEMO_TRANSCRIPT =
  "So today Karim finally picked me up for lunch عند Teta Samia. عملت ملوخية وأصرت إن كريم ياكل طبقين، then Mishmish stole Karim's chair the second he stood up… وبعدين شربنا شاي على البلكونة.";

export const DEMO_TITLE = "ملوخية وشاي عالبلكونة";

export const demoPanels: DemoPanel[] = [
  {
    wide: true,
    art: { zine: art.demo.zine0, painterly: art.demo.painterly0 },
    caption: "Karim finally picked me up for lunch عند Teta",
    speaker: "Karim",
    line: "Yalla Nour, I'm actually on time!",
  },
  {
    wide: false,
    art: { zine: art.demo.zine1, painterly: art.demo.painterly1 },
    caption: "Teta عملت ملوخية",
    speaker: "Teta Samia",
    line: "لازم تاكل طبقين يا كريم!",
  },
  {
    wide: false,
    art: { zine: art.demo.zine2, painterly: art.demo.painterly2 },
    caption: "Mishmish stole his chair",
    speaker: "Karim",
    line: "خلاص يا معلم، الكرسي بتاعك",
    before: { zine: art.demo.beforeZine, painterly: art.demo.beforePainterly },
  },
  {
    wide: true,
    art: { zine: art.demo.zine3, painterly: art.demo.painterly3 },
    caption: "وبعدين شربنا شاي عالبلكونة",
    speaker: "Nour",
    line: "الجو حلو قوي، مش عايزة أمشي",
  },
];
