import Link from "next/link";
import { Art } from "@/art/Art";
import { art } from "@/art/manifest";
import type { PanelArt } from "./comic/view";
import { PAGE_TURN } from "./PageTurn";
import styles from "./MagazineCover.module.css";

interface MagazineCoverProps {
  issue: string;
  coverLines: string[];
  /**
   * The cover picture of a user's own issue (its drawn cover or its best
   * panel, `MagazineIssue.cover.art`); null shows plain paper. Leave it out
   * only for the sample issue, which has its own art.
   */
  picture?: PanelArt | null;
  /** When set, the cover is a link (with this accessible name). */
  href?: string;
  linkLabel?: string;
  className?: string;
}

/** The month's issue as a tilted cover on a little stack of pages. */
export function MagazineCover({ issue, coverLines, picture, href, linkLabel, className }: MagazineCoverProps) {
  const sizes = "(min-width: 48rem) 22rem, 70vw";
  const shown =
    picture === undefined ? (
      <Art asset={art.month.cover} className={styles.art} alt="" sizes={sizes} />
    ) : picture === null ? null : picture.kind === "art" ? (
      <Art asset={picture.asset} className={styles.art} alt="" sizes={sizes} />
    ) : (
      // An object URL of the user's own panel or cover; next/image can't optimise Blobs.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={picture.src} className={styles.art} alt="" decoding="async" />
    );
  const inner = (
    <>
      {shown}
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
