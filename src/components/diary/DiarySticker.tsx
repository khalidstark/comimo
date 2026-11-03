import type { DiarySticker as StickerName } from "@/lib/types";

/** Hand-drawn-looking sticker shapes for diary covers: thick ink outline, flat riso fill. */
const PATHS: Record<StickerName, { d: string; fill: string }> = {
  heart: { d: "M32 54C14 41 6 31 6 21c0-8 6-14 13-14 6 0 10 3 13 8 3-5 7-8 13-8 7 0 13 6 13 14 0 10-8 20-26 33z", fill: "#f2397a" },
  cloud: { d: "M18 48c-7 0-12-5-12-11s5-11 11-11c1-8 8-14 16-14 7 0 13 5 15 11 7 0 12 5 12 12s-5 13-12 13z", fill: "#d9e2ef" },
  star: { d: "M32 5l7 17 18 2-14 12 4 18-15-9-15 9 4-18L7 24l18-2z", fill: "#ffc738" },
  bolt: { d: "M37 4L12 36h16l-5 24 27-34H33z", fill: "#ffc738" },
  leaf: { d: "M10 54C8 30 22 10 54 8c2 30-16 46-40 46l-4 4M14 50l22-22", fill: "#47b26b" },
  moon: { d: "M40 6C26 10 18 22 20 36s14 22 28 22c-6 2-12 2-18 0C16 54 8 40 10 26S26 4 40 6z", fill: "#b9a4f2" },
  spark: { d: "M32 4l5 21 21 7-21 7-5 21-5-21-21-7 21-7z", fill: "#0f9e8e" },
  rain: { d: "M14 34c-6 0-10-4-10-9s4-9 9-9c1-7 7-12 14-12 6 0 11 4 13 9 6 0 10 4 10 10s-4 11-10 11zM16 44l-3 8M28 44l-3 8M40 44l-3 8", fill: "#3d7fe0" },
};

export function DiarySticker({ name, className }: { name: StickerName; className?: string }) {
  const { d, fill } = PATHS[name] ?? PATHS.heart;
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <path d={d} fill={fill} stroke="#1b2148" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
