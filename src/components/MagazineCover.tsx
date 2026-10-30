import Link from "next/link";
import { Art } from "@/art/Art";
import { art } from "@/art/manifest";
import { PAGE_TURN } from "./PageTurn";
import styles from "./MagazineCover.module.css";

interface MagazineCoverProps {
  issue: string;
  coverLines: string[];
  /** When set, the cover is a link (with this accessible name). */
  href?: string;
  linkLabel?: string;
  className?: string;
}

/** The month's issue as a tilted cover on a little stack of pages. */
export function MagazineCover({ issue, coverLines, href, linkLabel, className }: MagazineCoverProps) {
  const inner = (
    <>
      <Art asset={art.month.cover} className={styles.art} alt="" sizes="(min-width: 48rem) 22rem, 70vw" />
      <span className={styles.masthead}>comimo</span>
      <span className={styles.issue}>{issue}</span>
      <span className={styles.lines}>
        {coverLines.map((line) => (
          <span key={line} dir="auto">
            {line}
          </span>
        ))}
      </span>
    </>
  );
  const classes = [styles.cover, href ? styles.linked : "", className].filter(Boolean).join(" ");

  if (href) {
    return (
      <Link href={href} className={classes} transitionTypes={PAGE_TURN}>
        {inner}
        <span className="visually-hidden">{linkLabel ?? `Open the ${issue} issue`}</span>
      </Link>
    );
  }
  return (
    <div className={classes} role="img" aria-label={`Cover of the ${issue} issue`}>
      {inner}
    </div>
  );
}
