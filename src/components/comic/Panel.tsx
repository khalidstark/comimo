"use client";

import { useState } from "react";
import { Art } from "@/art/Art";
import { BidiText } from "./BidiText";
import { Bubble } from "./Bubble";
import { FixedBadge } from "./FixedBadge";
import type { PanelArt, PanelView } from "./view";
import styles from "./comic.module.css";

const SIZES = "(min-width: 48rem) 70vw, 100vw";

function PanelImage({ art, alt }: { art: PanelArt; alt: string }) {
  if (art.kind === "art") return <Art asset={art.asset} className={styles.image} alt={alt} sizes={SIZES} />;
  // Object URLs for Blobs in the on-device store; next/image can't optimise them.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={styles.image} src={art.src} alt={alt} decoding="async" />;
}

interface ComicPanelProps {
  panel: PanelView;
  total: number;
}

/**
 * One panel: the art (a flip card when SAM fixed a face), the yellow caption
 * box, the speech bubbles, and the "Face fixed" stamp that flips it.
 */
export function ComicPanel({ panel, total }: ComicPanelProps) {
  const [face, setFace] = useState<"after" | "before">("after");
  const [flipped, setFlipped] = useState(false);
  const fixable = Boolean(panel.image && panel.before);
  const showingBefore = fixable && face === "before";
  const number = panel.index + 1;

  const toggle = () => {
    setFlipped(true);
    setFace((current) => (current === "after" ? "before" : "after"));
  };

  return (
    <li
      id={`panel-${number}`}
      className={styles.frame}
      data-frame={panel.index}
      data-face={fixable ? face : undefined}
      data-flipped={flipped || undefined}
      tabIndex={-1}
    >
      <span className="visually-hidden">
        Panel {number} of {total}
        {showingBefore ? ", before the face fix" : ""}.
      </span>

      {/* The printed sheet. The cell around it stays unclipped so it can be observed and hit-tested. */}
      <div className={`panel ${styles.sheet}`}>
        <div className={styles.art}>
          {fixable && panel.image && panel.before ? (
            <div className={styles.flipper}>
              <div className={`${styles.face} ${styles.front}`} aria-hidden={showingBefore || undefined}>
                <PanelImage art={panel.image} alt={panel.scene} />
              </div>
              <div className={`${styles.face} ${styles.back}`} aria-hidden={!showingBefore || undefined}>
                <PanelImage art={panel.before} alt={`Before the fix: ${panel.scene}`} />
                <span className={styles.beforeTag} aria-hidden="true">
                  Before
                </span>
              </div>
            </div>
          ) : panel.image ? (
            <PanelImage art={panel.image} alt={panel.scene} />
          ) : (
            <p className={styles.pencil} dir="auto">
              {panel.scene}
            </p>
          )}
        </div>

        <div className={styles.layer}>
          {panel.caption ? (
            <p className={`caption ${styles.caption}`} dir="auto">
              <BidiText text={panel.caption} />
            </p>
          ) : null}
          {panel.bubbles.map((bubble, i) => (
            <Bubble key={i} speaker={bubble.speaker} text={bubble.text} dir={bubble.dir} tail={bubble.tail} order={i} />
          ))}
        </div>

        {fixable ? <FixedBadge names={panel.fixedNames} showingBefore={showingBefore} onToggle={toggle} /> : null}
      </div>
    </li>
  );
}
