"use client";

import Link from "next/link";
import { useRef, type CSSProperties, type PointerEvent } from "react";
import { PAGE_TURN } from "@/components/PageTurn";
import type { DiaryColor, DiarySticker as StickerName } from "@/lib/types";
import { DiarySticker } from "./DiarySticker";
import styles from "./diary.module.css";

interface NotebookProps {
  href: string;
  name: string;
  color: DiaryColor;
  sticker: StickerName;
  count: number;
  /** The newest comic's title, on the bookmark ribbon. */
  last?: string;
  /** The built-in daily diary: a spiral notebook instead of a bound one. */
  daily?: boolean;
}

/**
 * A diary on the shelf: a bound notebook (spiral for Every day) with a washi
 * tape label, a sticker, an elastic band and the pages showing at the edge.
 * It leans towards the pointer and lifts off the shelf on hover or focus.
 */
export function Notebook({ href, name, color, sticker, count, last, daily }: NotebookProps) {
  const ref = useRef<HTMLAnchorElement>(null);

  function lean(event: PointerEvent<HTMLAnchorElement>) {
    if (event.pointerType !== "mouse") return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    event.currentTarget.style.setProperty("--ry", `${(x * 16).toFixed(1)}deg`);
    event.currentTarget.style.setProperty("--rx", `${(-y * 12).toFixed(1)}deg`);
    event.currentTarget.style.setProperty("--gx", `${((x + 0.5) * 100).toFixed(0)}%`);
  }

  function rest() {
    ref.current?.style.removeProperty("--ry");
    ref.current?.style.removeProperty("--rx");
  }

  return (
    <Link
      ref={ref}
      href={href}
      className={styles.notebook}
      data-color={color}
      data-daily={daily || undefined}
      onPointerMove={lean}
      onPointerLeave={rest}
      transitionTypes={PAGE_TURN}
      style={{ "--tilt": `${(name.length % 5) - 2}deg` } as CSSProperties}
    >
      <span className={styles.pages} aria-hidden="true" />
      <span className={styles.cover}>
        <span className={styles.spine} aria-hidden="true" />
        <span className={styles.shine} aria-hidden="true" />
        <DiarySticker name={sticker} className={styles.sticker} />
        <span className={styles.label}>
          <span className={styles.labelName} dir="auto">
            {name}
          </span>
        </span>
        <span className={styles.count}>{count === 0 ? "Empty, for now" : count === 1 ? "1 comic" : `${count} comics`}</span>
        <span className={styles.band} aria-hidden="true" />
      </span>
      {last ? (
        <span className={styles.ribbon} dir="auto">
          <span className="visually-hidden">Newest: </span>
          {last}
        </span>
      ) : null}
    </Link>
  );
}
