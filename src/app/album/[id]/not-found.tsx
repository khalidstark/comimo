import Link from "next/link";
import styles from "./albumPage.module.css";

/** A deleted album, a link that was changed, or a wrong address. */
export default function AlbumNotFound() {
  return (
    <main id="main" className={`page ${styles.main}`}>
      <div className={`panel ${styles.gone}`}>
        <p className={`caption ${styles.kicker}`}>Photo album</p>
        <h1 className={styles.goneTitle}>This album isn&apos;t here</h1>
        <p>The link may have been changed or the album deleted. Ask whoever shared it for the new link.</p>
        <Link href="/" className="btn btn--accent">
          Go to Comimo
        </Link>
      </div>
    </main>
  );
}
