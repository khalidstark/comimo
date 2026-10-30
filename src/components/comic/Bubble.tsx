import type { CSSProperties } from "react";
import { firstStrongDir } from "@/lib/bidi";
import type { TextDir } from "@/lib/types";
import { BidiText } from "./BidiText";
import type { TailSide } from "./view";
import styles from "./comic.module.css";

interface BubbleProps {
  speaker: string;
  text: string;
  /** The script's direction for the line; used only when the line has no letters to go by. */
  dir: TextDir;
  /** The side the speaker stands on; the tail points there. */
  tail: TailSide;
  /** Order within the panel, for the pop-in stagger. */
  order?: number;
}

/** A speech bubble: speaker name, then the line with each language run isolated. */
export function Bubble({ speaker, text, dir, tail, order = 0 }: BubbleProps) {
  // The bubble reads in the language the speaker started in ("I won't make it, مش هلحق" is
  // left to right); each run is isolated, so punctuation stays put in either direction.
  const base = firstStrongDir(text) ?? (dir === "auto" ? "ltr" : dir);
  return (
    <p className={`bubble ${styles.bubble}`} data-tail={tail} dir={base} style={{ "--b": order } as CSSProperties}>
      <span className="bubble__who">
        <bdi>{speaker}</bdi>
      </span>
      <BidiText text={text} />
    </p>
  );
}
