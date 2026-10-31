"use client";

import { useEffect, useRef, useState } from "react";
import {
  albumApi,
  albumUrl,
  MAX_PHOTO_BYTES,
  photoSrc,
  preparePhoto,
  rememberAlbum,
  type OwnedAlbumView,
} from "@/lib/albumClient";
import styles from "./album.module.css";

const MAX_PHOTOS = 20;
const CAPTION_MAX = 200;
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

type Confirm = null | "relink" | "delete";

interface AlbumEditorProps {
  dayId: string;
  /** The day's title, printed on the album page. */
  title: string;
  /** The album when the page already has it (the album page); otherwise it is looked up for the day. */
  initial?: OwnedAlbumView | null;
  /** The album page follows a new link and leaves after a deletion. */
  onRelinked?: (album: OwnedAlbumView) => void;
  onDeleted?: () => void;
  /** Heading level inside the page. */
  headingLevel?: 2 | 3;
}

/**
 * The owner's photo album controls for one day: add up to 20 real photos or
 * paste a link to an album elsewhere, caption them (by hand or with Muse
 * Spark when asked), get a new link, delete the album. Used on the day page
 * and, for the owner, on the album page.
 */
export function AlbumEditor({ dayId, title, initial, onRelinked, onDeleted, headingLevel = 2 }: AlbumEditorProps) {
  const [album, setAlbum] = useState<OwnedAlbumView | null>(initial ?? null);
  const [loading, setLoading] = useState(initial === undefined);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; tone: "info" | "error" } | null>(null);
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState(initial?.link ?? "");
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const Heading = headingLevel === 2 ? "h2" : "h3";

  useEffect(() => {
    if (initial !== undefined) return;
    let cancelled = false;
    void albumApi.forDay(dayId).then((answer) => {
      if (cancelled) return;
      setLoading(false);
      if (answer.ok) {
        setAlbum(answer.value);
        setLink(answer.value.link ?? "");
        void rememberAlbum(dayId, answer.value.id);
      } else if (answer.status === 404) {
        void rememberAlbum(dayId, null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [dayId, initial]);

  const show = (next: OwnedAlbumView) => {
    setAlbum(next);
    setLink(next.link ?? "");
    void rememberAlbum(dayId, next.id);
  };

  const fail = (text: string) => setStatus({ text, tone: "error" });

  async function ensureAlbum(withLink?: string): Promise<OwnedAlbumView | null> {
    if (album) return album;
    const created = await albumApi.create(dayId, title, withLink);
    if (!created.ok) {
      fail(created.error);
      return null;
    }
    show(created.value);
    return created.value;
  }

  async function addPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setStatus(null);
    try {
      const target = await ensureAlbum();
      if (!target) return;
      const room = MAX_PHOTOS - target.photos.length;
      const picked = Array.from(files).slice(0, Math.max(0, room));
      const skipped = files.length - picked.length;
      const problems: string[] = [];
      let current = target;
      for (const [i, file] of picked.entries()) {
        setStatus({ text: `Adding photo ${i + 1} of ${picked.length}…`, tone: "info" });
        if (file.size > MAX_PHOTO_BYTES) {
          problems.push(`${file.name} is over 5 MB.`);
          continue;
        }
        const added = await albumApi.addPhoto(current.id, await preparePhoto(file));
        if (!added.ok) {
          problems.push(added.status === 400 ? added.error : `${file.name}: ${added.error}`);
          if (added.status === 429 || added.status === 507) break;
          continue;
        }
        current = { ...current, photos: [...current.photos, added.value] };
        setAlbum(current);
      }
      if (skipped > 0) problems.push(`An album holds up to ${MAX_PHOTOS} photos, so ${skipped === 1 ? "one photo was" : `${skipped} photos were`} left out.`);
      setStatus(problems.length ? { text: problems.join(" "), tone: "error" } : { text: "Photos added.", tone: "info" });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function saveLink(next: string | null) {
    setBusy(true);
    setStatus(null);
    try {
      if (!album) {
        if (next) {
          const made = await ensureAlbum(next);
          if (made) setStatus({ text: "Album link saved.", tone: "info" });
        }
        return;
      }
      const saved = await albumApi.update(album.id, { link: next });
      if (!saved.ok) return fail(saved.error);
      show(saved.value);
      setStatus({ text: next ? "Album link saved." : "Album link removed.", tone: "info" });
      setLinkOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function suggest() {
    if (!album) return;
    setBusy(true);
    setStatus({ text: "Muse Spark is looking at your photos…", tone: "info" });
    const answer = await albumApi.suggestCaptions(album.id);
    setBusy(false);
    if (!answer.ok) return fail(answer.error);
    // Fill only empty captions; nothing is saved until the owner presses Save.
    setCaptions((typed) => {
      const next = { ...typed };
      for (const photo of album.photos) {
        const current = typed[photo.id] ?? photo.caption;
        if (!current && answer.value.captions[photo.id]) next[photo.id] = answer.value.captions[photo.id];
      }
      return next;
    });
    setStatus({ text: "Suggested captions are filled in. Change any you like, then save.", tone: "info" });
  }

  async function saveCaptions() {
    if (!album) return;
    setBusy(true);
    const changed = Object.fromEntries(Object.entries(captions).filter(([id, text]) => album.photos.find((p) => p.id === id)?.caption !== text));
    const saved = await albumApi.update(album.id, { captions: changed });
    setBusy(false);
    if (!saved.ok) return fail(saved.error);
    show(saved.value);
    setCaptions({});
    setStatus({ text: "Captions saved.", tone: "info" });
  }

  async function removePhoto(photoId: string) {
    if (!album) return;
    setBusy(true);
    const removed = await albumApi.removePhoto(album.id, photoId);
    setBusy(false);
    if (!removed.ok) return fail(removed.error);
    setAlbum({ ...album, photos: album.photos.filter((photo) => photo.id !== photoId) });
    setCaptions((typed) => Object.fromEntries(Object.entries(typed).filter(([id]) => id !== photoId)));
  }

  async function relink() {
    if (!album) return;
    setBusy(true);
    setConfirm(null);
    const renewed = await albumApi.newLink(album.id);
    setBusy(false);
    if (!renewed.ok) return fail(renewed.error);
    show(renewed.value);
    setStatus({ text: "New link ready. The old link and the old QR code no longer open the album.", tone: "info" });
    onRelinked?.(renewed.value);
  }

  async function remove() {
    if (!album) return;
    setBusy(true);
    setConfirm(null);
    const removed = await albumApi.remove(album.id);
    setBusy(false);
    if (!removed.ok) return fail(removed.error);
    setAlbum(null);
    setLink("");
    setCaptions({});
    await rememberAlbum(dayId, null);
    setStatus({ text: "Album deleted. Its link and QR code no longer work.", tone: "info" });
    onDeleted?.();
  }

  async function copy() {
    if (!album) return;
    try {
      await navigator.clipboard.writeText(albumUrl(album.id));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      fail("Couldn't copy the link. Open the album and copy it from the address bar.");
    }
  }

  const dirty = album ? Object.entries(captions).some(([id, text]) => album.photos.find((p) => p.id === id)?.caption !== text) : false;
  const photos = album?.photos ?? [];

  return (
    <section className={`panel ${styles.editor}`} aria-labelledby={`album-${dayId}`} aria-busy={busy || loading}>
      <header className={styles.editorHead}>
        <p className={`caption ${styles.kicker}`}>Photo album</p>
        <Heading id={`album-${dayId}`} className={styles.editorTitle}>
          {album ? "The real day, in photos" : "Add the real day"}
        </Heading>
      </header>

      {loading ? <p className={styles.muted}>Looking for this day&apos;s album…</p> : null}

      {!loading && !album ? (
        <p className={styles.lede}>
          Add up to {MAX_PHOTOS} real photos from this day, or paste a link to an album you already keep somewhere else. The last page of
          your comic gets a QR code that opens it.
        </p>
      ) : null}

      {!loading ? (
        <p className={styles.notice}>
          <strong>Anyone with the link or the QR code can see this album:</strong> the photos, their captions and the day&apos;s title.
          Nothing else from your comic or your cast. Photos are saved without their location or camera details.
        </p>
      ) : null}

      {photos.length > 0 && album ? (
        <ol className={styles.editGrid}>
          {photos.map((photo, i) => (
            <li key={photo.id} className={styles.editItem}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoSrc(album.id, photo.id)} alt={photo.caption || `Photo ${i + 1}`} className={styles.thumb} loading="lazy" decoding="async" />
              <label className={styles.captionField}>
                <span className="visually-hidden">Caption for photo {i + 1}</span>
                <textarea
                  rows={2}
                  maxLength={CAPTION_MAX}
                  dir="auto"
                  placeholder="Add a caption"
                  value={captions[photo.id] ?? photo.caption}
                  onChange={(event) => setCaptions((typed) => ({ ...typed, [photo.id]: event.target.value }))}
                />
              </label>
              <button type="button" className={styles.removePhoto} onClick={() => void removePhoto(photo.id)} disabled={busy} aria-label={`Remove photo ${i + 1}`}>
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}

      {!loading ? (
        <div className={styles.actions}>
          {photos.length < MAX_PHOTOS ? (
            <label className={`btn btn--accent ${styles.fileButton}`} aria-disabled={busy || undefined}>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                multiple
                disabled={busy}
                className={styles.fileInput}
                onChange={(event) => void addPhotos(event.target.files)}
              />
              {photos.length ? `Add photos (${photos.length} of ${MAX_PHOTOS})` : "Add real photos"}
            </label>
          ) : null}
          {photos.length > 0 ? (
            <button type="button" className="btn btn--ghost" onClick={() => void suggest()} disabled={busy}>
              Suggest captions
            </button>
          ) : null}
          {dirty ? (
            <button type="button" className="btn btn--ink" onClick={() => void saveCaptions()} disabled={busy}>
              Save captions
            </button>
          ) : null}
          {!linkOpen ? (
            <button type="button" className="btn btn--ghost" onClick={() => setLinkOpen(true)} disabled={busy}>
              {album?.link ? "Change the album link" : "Paste an album link"}
            </button>
          ) : null}
        </div>
      ) : null}

      {linkOpen ? (
        <form
          className={styles.linkForm}
          onSubmit={(event) => {
            event.preventDefault();
            void saveLink(link.trim() || null);
          }}
        >
          <label className={styles.linkLabel} htmlFor={`album-link-${dayId}`}>
            Link to an album (Google Photos, iCloud, Drive or any https:// link)
          </label>
          <div className={styles.linkRow}>
            <input
              id={`album-link-${dayId}`}
              type="url"
              inputMode="url"
              placeholder="https://"
              pattern="https://.*"
              maxLength={2000}
              value={link}
              onChange={(event) => setLink(event.target.value)}
              autoComplete="off"
            />
            <button type="submit" className="btn btn--ink" disabled={busy}>
              Save link
            </button>
            {album?.link ? (
              <button type="button" className="btn btn--ghost" onClick={() => void saveLink(null)} disabled={busy}>
                Remove
              </button>
            ) : null}
            <button type="button" className="btn btn--ghost" onClick={() => setLinkOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {status ? (
        <p className={status.tone === "error" ? styles.error : styles.status} role={status.tone === "error" ? "alert" : "status"}>
          {status.text}
        </p>
      ) : null}

      {album ? (
        <footer className={styles.editorFoot}>
          <a className="link" href={`/album/${album.id}`}>
            Open the album
          </a>
          <button type="button" className={styles.textButton} onClick={() => void copy()}>
            {copied ? "Link copied" : "Copy link"}
          </button>
          {confirm === null ? (
            <>
              <button type="button" className={styles.textButton} onClick={() => setConfirm("relink")} disabled={busy}>
                Get a new link
              </button>
              <button type="button" className={`${styles.textButton} ${styles.danger}`} onClick={() => setConfirm("delete")} disabled={busy}>
                Delete album
              </button>
            </>
          ) : (
            <span className={styles.confirm} role="group" aria-label="Confirm">
              {confirm === "relink" ? "The old link and QR code will stop working." : "The photos, captions and link go for good."}
              <button type="button" className={`btn ${confirm === "delete" ? "btn--accent" : "btn--ink"}`} onClick={() => void (confirm === "relink" ? relink() : remove())}>
                {confirm === "relink" ? "Get a new link" : "Delete album"}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setConfirm(null)}>
                Keep it
              </button>
            </span>
          )}
        </footer>
      ) : null}
    </section>
  );
}
