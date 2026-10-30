"use client";

import Link from "next/link";
import { Icon } from "@/art/Icon";
import { PAGE_TURN } from "./PageTurn";
import styles from "./RecordStamp.module.css";

interface BaseProps {
  label: string;
  /** Accessible name when the visible label is short. */
  ariaLabel?: string;
  size?: "large" | "medium";
  className?: string;
}

type RecordStampProps =
  | (BaseProps & { href: string; onClick?: never; pressed?: never })
  | (BaseProps & { href?: never; onClick: () => void; pressed?: boolean });

/**
 * The big record button: a pink ink stamp on a sunflower sound-effect burst.
 * Renders a link (to the record page) or a button (on the record page).
 */
export function RecordStamp(props: RecordStampProps) {
  const { label, ariaLabel, size = "large", className } = props;
  const classes = [styles.stamp, styles[size], className].filter(Boolean).join(" ");
  const face = (
    <>
      <span className={styles.burst} aria-hidden="true" />
      <span className={styles.face}>
        <Icon name="record" size="1.6em" />
        <span className={styles.label}>{label}</span>
      </span>
    </>
  );

  if (props.href) {
    return (
      <Link href={props.href} className={classes} aria-label={ariaLabel} transitionTypes={PAGE_TURN}>
        {face}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={classes}
      aria-label={ariaLabel}
      aria-pressed={props.pressed}
      onClick={props.onClick}
    >
      {face}
    </button>
  );
}
