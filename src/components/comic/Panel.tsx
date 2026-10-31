"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Art } from "@/art/Art";
import { firstStrongDir } from "@/lib/bidi";
import { throughCrop } from "@/lib/layout/crop";
import type { Rect } from "@/lib/layout/geometry";
import { placeLettering, type LetteringItem, type LetteringPlan } from "@/lib/layout/placeLettering";
import type { UnitBox } from "@/lib/types";
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

/** Lettering scales tried for free placement, largest first. */
const FREE_SCALES = [1, 0.88, 0.78, 0.7];

/**
 * Lettering for panels SAM measured (03-03): the caption and bubbles go into
 * the panel's free space, off every head SAM found, off any inset laid over
 * the panel and off the face-fix stamp, near their speaker with the tail at
 * their head (placeLettering). The boxes are mapped through this page's crop.
 * Shrinks a step at a time until everything is clear; re-places on resize.
 */
function useFreeLettering(ref: RefObject<HTMLDivElement | null>, panel: PanelView, slot: SlotView) {
  useLayoutEffect(() => {
    const layer = ref.current;
    const sheet = layer?.parentElement;
    const figures = panel.figures;
    if (!layer || !sheet || !figures) return;
    const elements = Array.from(layer.children) as HTMLElement[];
    if (elements.length === 0) return;

    const place = () => {
      const box = sheet.getBoundingClientRect();
      const W = box.width;
      const H = box.height;
      if (W < 40 || H < 40) return;
      const style = getComputedStyle(sheet);
      const share = (name: string) => (Number.parseFloat(style.getPropertyValue(name)) || 0) / 100;
      const desktop = style.getPropertyValue("--show-desktop").trim() === "inline";
      const band = share("--band");
      const crop = slot.crop[desktop ? "desktop" : "phone"];
      const art = { x: 0, y: H * band, w: W, h: H * (1 - band) };
      const toPx = (unit: UnitBox): Rect => {
        const view = throughCrop(unit, crop);
        return { x: art.x + view.x * art.w, y: art.y + view.y * art.h, w: view.w * art.w, h: view.h * art.h };
      };
      const pad = (r: Rect, sx: number, top: number, bottom: number): Rect => ({ x: r.x - r.w * sx, y: r.y - r.h * top, w: r.w * (1 + 2 * sx), h: r.h * (1 + top + bottom) });
      const heads = figures.items.map((item) => pad(toPx(item.head), 0.22, 0.25, 0.1));
      const bodies = figures.items.map((item) => toPx(item.box));
      const covers = slot.covers[desktop ? "desktop" : "phone"].map((c) => pad({ x: c.x * W, y: c.y * H, w: c.w * W, h: c.h * H }, 0.03, 0.03, 0.03));
      const stamp = sheet.querySelector<HTMLElement>("button[aria-pressed]")?.getBoundingClientRect();
      const hard = [...heads, ...covers, ...(stamp ? [{ x: stamp.left - box.left - 4, y: stamp.top - box.top - 4, w: stamp.width + 8, h: stamp.height + 8 }] : [])];
      const margin = Math.max(4, W * 0.012);
      const area = {
        x: W * share("--il") + margin,
        y: H * share("--it") + margin,
        w: W * (1 - share("--il") - share("--ir")) - 2 * margin,
        h: H * (1 - share("--it") - share("--ib")) - 2 * margin,
      };

      // Each item's possible widths, measured at each scale.
      const widths = elements.map((element) => {
        const caption = element.dataset.kind === "caption";
        const font = Number.parseFloat(getComputedStyle(element).fontSize) || 16;
        return caption ? [area.w * 0.94, area.w * 0.64, area.w * 0.46] : [Math.min(area.w * 0.86, font * 18), Math.min(area.w * 0.86, font * 11)];
      });
      const measure = (scale: number) =>
        elements.map((element, i) =>
          widths[i].map((width) => {
            element.style.zoom = String(scale);
            element.style.left = "0px";
            element.style.top = "0px";
            element.style.maxWidth = `${width / scale}px`;
            const rect = element.getBoundingClientRect();
            return { w: rect.width, h: rect.height };
          }),
        );

      // Clear of every head first; then legible beats roomy: a smaller step is taken to keep off bodies only down to 0.88.
      const rank = (plan: LetteringPlan, scale: number) => (plan.clear ? 0 : 1000 + plan.cost) + (plan.roomy ? 0 : 0.6) + (1 - scale) * 4;
      let chosen: { plan: LetteringPlan; scale: number; rank: number } | null = null;
      for (const scale of FREE_SCALES) {
        const sizes = measure(scale);
        const items: LetteringItem[] = elements.map((element, i) => {
          if (element.dataset.kind === "caption") return { kind: "caption", sizes: sizes[i], rtl: element.dataset.rtl !== undefined };
          const speaker = figures.items.find((item) => item.characterId && item.characterId === element.dataset.speaker);
          return {
            kind: "bubble",
            sizes: sizes[i],
            ...(speaker ? { target: toPx(speaker.head) } : { side: element.dataset.tail === "right" ? ("right" as const) : ("left" as const) }),
          };
        });
        const plan = placeLettering({ width: W, height: H, area, hard, soft: bodies, items });
        const score = rank(plan, scale);
        if (!chosen || score < chosen.rank) chosen = { plan, scale, rank: score };
        if (plan.clear && plan.roomy) break;
      }
      const { plan, scale } = chosen!;
      elements.forEach((element, i) => {
        const spot = plan.spots[i];
        element.style.zoom = String(scale);
        element.style.maxWidth = `${widths[i][spot.size] / scale}px`;
        // Lengths on a zoomed element are zoomed too, so positions are divided back.
        element.style.left = `${spot.x / scale}px`;
        element.style.top = `${spot.y / scale}px`;
        if (spot.tail) {
          element.style.setProperty("--tail-x", `${spot.tail.x / scale}px`);
          element.dataset.tailDir = spot.tail.up ? "up" : "down";
        }
      });
      layer.dataset.placed = plan.clear ? "clear" : "crowded";
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(sheet);
    return () => observer.disconnect();
  }, [ref, panel, slot]);
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
  const freeRef = useRef<HTMLDivElement>(null);
  // Panels SAM measured place their lettering in free space; older ones letter into the band the art left.
  const free = Boolean(panel.figures && panel.image);
  useFitLettering(layerRef);
  useFreeLettering(freeRef, panel, slot);
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

        {free ? (
          <div ref={freeRef} className={styles.free}>
            {panel.caption ? (
              <p
                className={`caption ${styles.caption}`}
                dir="auto"
                data-kind="caption"
                data-narration={panel.narrated || undefined}
                data-rtl={firstStrongDir(panel.caption) === "rtl" || undefined}
              >
                <BidiText text={panel.caption} />
              </p>
            ) : null}
            {panel.bubbles.map((bubble, i) => (
              <Bubble key={i} speaker={bubble.speaker} speakerId={bubble.speakerId} text={bubble.text} dir={bubble.dir} tail={bubble.tail} order={i} />
            ))}
          </div>
        ) : (
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
        )}

        <SlotOutline slot={slot} />

        {panel.flashback || panel.returning ? (
          <span className={styles.timeTag} data-when={panel.flashback ? "then" : "now"}>
            {panel.flashback ? "Memory" : "Now"}
          </span>
        ) : null}

        {fixable ? <FixedBadge names={panel.fixedNames} showingBefore={showingBefore} bySam={panel.checkedBy === "sam"} onToggle={toggle} /> : null}
      </div>
    </li>
  );
}
