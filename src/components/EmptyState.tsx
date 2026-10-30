import type { ReactNode } from "react";
import { Art } from "@/art/Art";
import type { ArtAsset } from "@/art/manifest";
import styles from "./EmptyState.module.css";

interface EmptyStateProps {
  art: ArtAsset;
  title: string;
  /** Heading level, so the empty state fits the page outline. */
  as?: "h1" | "h2" | "h3";
  children: ReactNode;
  action?: ReactNode;
}

/** An empty page is an invitation: picture, what's missing, what to do. */
export function EmptyState({ art, title, as: Heading = "h2", children, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <Art asset={art} className={styles.art} alt="" />
      <div className={styles.text}>
        <Heading className={styles.title}>{title}</Heading>
        <div className={styles.body}>{children}</div>
        {action ? <div className={styles.action}>{action}</div> : null}
      </div>
    </div>
  );
}
