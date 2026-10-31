import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ownedAlbum, publicAlbum, type PublicAlbum } from "@/lib/server/album";
import { readSession, sessionCookieName } from "@/lib/server/session";
import { AlbumOwner } from "./AlbumOwner";
import styles from "./albumPage.module.css";

/**
 * /album/:id — a day's photo album, for anyone with the link (or the QR code
 * on the comic's last page). Shows only the photos, their captions, the
 * day's title and an optional link to an album elsewhere: nothing about the
 * cast, the comic or the account. Never indexed. The owner also gets the
 * album controls here.
 */

export const metadata: Metadata = {
  title: "Photo album",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false, noimageindex: true } },
  // The album id is the key: don't hand it to sites linked from here.
  referrer: "no-referrer",
};

interface AlbumPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Every album address is unknown at build time and private to its link, so
 * the page renders per request and waits for the album before sending
 * anything: a missing one answers a real 404 (the proxy checks first too).
 */
export const instant = false;

export default async function AlbumPage({ params }: AlbumPageProps) {
  const { id } = await params;
  const album = await publicAlbum(id);
  if (!album) notFound();

  const session = await readSession((await cookies()).get(sessionCookieName())?.value);
  const owned = session ? await ownedAlbum(session.id, id) : null;

  return (
    <main id="main" className={`page ${styles.main}`}>
      <AlbumView album={album} />
      {owned?.ok ? <AlbumOwner album={owned.value} /> : null}
    </main>
  );
}

function hostOf(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function AlbumView({ album }: { album: PublicAlbum }) {
  const count = album.photos.length;
  return (
    <article className={styles.album} aria-labelledby="album-title">
      <header className={`page-head ${styles.head}`}>
        <p className={`caption ${styles.kicker}`}>The real day</p>
        <h1 id="album-title" dir="auto" className={styles.title}>
          {album.title}
        </h1>
        <p className={styles.count}>{count === 0 ? "No photos here yet." : count === 1 ? "One photo" : `${count} photos`}</p>
      </header>

      {count > 0 ? (
        <ol className={styles.wall}>
          {album.photos.map((photo, i) => (
            <li key={photo.id} className={styles.print}>
              <figure className={styles.figure}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/album/${album.id}/photos/${photo.id}`}
                  width={photo.width}
                  height={photo.height}
                  alt={photo.caption || `Photo ${i + 1} of ${count}`}
                  loading={i < 4 ? "eager" : "lazy"}
                  decoding="async"
                  className={styles.photo}
                  referrerPolicy="no-referrer"
                />
                {photo.caption ? (
                  <figcaption className={styles.caption} dir="auto">
                    {photo.caption}
                  </figcaption>
                ) : null}
              </figure>
            </li>
          ))}
        </ol>
      ) : null}

      {album.link ? (
        <aside className={`panel ${styles.elsewhere}`}>
          <p className={styles.elsewhereText}>More photos from this day are kept on {hostOf(album.link) || "another site"}.</p>
          <a className="btn btn--accent" href={album.link} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer">
            Open the album <span aria-hidden="true">↗</span>
          </a>
        </aside>
      ) : null}

      <footer className={styles.foot}>
        <p>
          Shared from a comic made with{" "}
          <Link href="/" className="link">
            Comimo
          </Link>
          . Anyone with this link can see these photos.
        </p>
      </footer>
    </article>
  );
}
