"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Art } from "@/art/Art";
import { firstStrongDir } from "@/lib/bidi";
import { BidiText } from "./BidiText";
import { Bubble } from "./Bubble";
import { FixedBadge } from "./FixedBadge";
import type { SlotView } from "./pageView";
import { SlotOutline } from "./SlotOutline";
import type { PanelArt, PanelView } from "./view";
import styles from "./comic.module.css";
import page from "./page.module.css";

const SIZES = "(min-width: 48rem) 60vw, 100vw";

function PanelImage({ art, alt }: { art: PanelArt; alt: string }) {
  if (art.kind === "art") return <Art asset={art.asset} className={styles.image} alt={alt} sizes={SIZES} />;
  // Object URLs for Blobs in the on-device store; next/image can't optimise them.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={styles.image} src={art.src} alt={alt} decoding="async" />;
}

/** Lettering sizes tried in turn: two steps to fit the band the art left empty, a last one to stay inside the panel. */
const FIT_STEPS = [0.88, 0.78, 0.7];

/**
 * Keep a panel's caption and bubbles in its lettering band: when they run
 * taller than the band, shrink them a step at a time; as a last resort shrink
 * once more so they at least stay inside their own panel and never spill over
 * a neighbour. Re-fits when the panel changes size.
 */
function useFitLettering(ref: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const layer = ref.current;
    const sheet = layer?.parentElement;
    if (!layer || !sheet || layer.childElementCount === 0) return;
    const fit = () => {
      delete layer.dataset.fit;
      layer.style.removeProperty("--fit");
      const band = layer.clientHeight;
      const box = sheet.getBoundingClientRect();
      const bottomInset = Number.parseFloat(getComputedStyle(layer).getPropertyValue("--ib")) || 0;
      const room = box.bottom - (box.height * bottomInset) / 100 - layer.getBoundingClientRect().top;
      for (let step = 0; step < FIT_STEPS.length; step++) {
        const need = layer.scrollHeight;
        const limit = step < 2 ? band : room;
        if (need <= limit + 1) break;
        layer.dataset.fit = String(step + 1);
        layer.style.setProperty("--fit", String(FIT_STEPS[step]));
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(sheet);
    return () => observer.disconnect();
  }, [ref]);
}

interface ComicPanelProps {
  panel: PanelView;
  slot: SlotView;
  total: number;
}

/**
 * One panel in its slot on the page: the art cut to the slot's shape (a flip
 * card when SAM fixed a face), the caption and bubbles in the space the art
 * left for them, the ink line, and the "Face fixed" stamp that flips it.
 */
export function ComicPanel({ panel, slot, total }: ComicPanelProps) {
  const [face, setFace] = useState<"after" | "before">("after");
  const [flipped, setFlipped] = useState(false);
  const layerRef = useRef<HTMLDivElement>(null);
  useFitLettering(layerRef);
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
      className={`${page.slot} ${styles.frame}`}
      style={slot.vars as CSSProperties}
      data-frame={panel.index}
      data-inset={slot.inset || undefined}
      data-zone={slot.zone.side}
      data-stamp={slot.stamp}
      data-flashback={panel.flashback || undefined}
      data-face={fixable ? face : undefined}
      data-flipped={flipped || undefined}
      tabIndex={-1}
    >
      <span className="visually-hidden">
        Panel {number} of {total}
        {showingBefore ? ", before the face fix" : ""}.
      </span>

      {/* The printed sheet. The cell around it stays unclipped so it can be observed and hit-tested. */}
      <div className={styles.sheet}>
        <div className={styles.shape}>
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
        </div>

        <div ref={layerRef} className={styles.layer}>
          {panel.caption ? (
            <p
              className={`caption ${styles.caption}`}
              dir="auto"
              data-narration={panel.narrated || undefined}
              data-rtl={firstStrongDir(panel.caption) === "rtl" || undefined}
            >
              <BidiText text={panel.caption} />
            </p>
          ) : null}
          {panel.bubbles.length > 0 ? (
            <div
              className={styles.bubbles}
              // The first speaker stands on the right: their bubble goes right and higher, so it is still read first.
              data-swapped={
                (panel.bubbles.length === 2 && panel.bubbles[0].tail === "right" && panel.bubbles[1].tail === "left") || undefined
              }
            >
              {panel.bubbles.map((bubble, i) => (
                <Bubble key={i} speaker={bubble.speaker} text={bubble.text} dir={bubble.dir} tail={bubble.tail} order={i} />
              ))}
            </div>
          ) : null}
        </div>

        <SlotOutline slot={slot} />

        {panel.flashback || panel.returning ? (
          <span className={styles.timeTag} data-when={panel.flashback ? "then" : "now"}>
            {panel.flashback ? "Memory" : "Now"}
          </span>
        ) : null}

        {fixable ? <FixedBadge names={panel.fixedNames} showingBefore={showingBefore} onToggle={toggle} /> : null}
      </div>
    </li>
  );
}
