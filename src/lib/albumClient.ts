"use client";

import { useEffect, useState } from "react";
import { getAlbumId, setAlbumId } from "./store";

/**
 * The browser side of /api/album/*, plus the album id each day shows on its
 * last page (kept in the store, so the QR code prints offline too).
 */

export interface AlbumPhotoView {
  id: string;
  width: number;
  height: number;
  caption: string;
}

export interface OwnedAlbumView {
  id: string;
  dayId: string;
  title: string;
  link: string | null;
  photos: AlbumPhotoView[];
}

export type AlbumAnswer<T> = { ok: true; value: T } | { ok: false; error: string; status: number };

async function call<T>(path: string, init: RequestInit = {}): Promise<AlbumAnswer<T>> {
  try {
    const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...init });
    const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!response.ok) return { ok: false, status: response.status, error: body?.error ?? "Something went wrong. Try again." };
    return { ok: true, value: body as T };
  } catch {
    return { ok: false, status: 0, error: "Comimo couldn't reach the server. Check your connection." };
  }
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const albumApi = {
  forDay: (dayId: string) => call<OwnedAlbumView>(`/api/album?day=${encodeURIComponent(dayId)}`),
  get: (id: string) => call<OwnedAlbumView>(`/api/album/${encodeURIComponent(id)}`),
  create: (dayId: string, title: string, link?: string) => call<OwnedAlbumView>("/api/album", json("POST", { dayId, title, link })),
  update: (id: string, change: { title?: string; link?: string | null; captions?: Record<string, string> }) =>
    call<OwnedAlbumView>(`/api/album/${encodeURIComponent(id)}`, json("PATCH", change)),
  remove: (id: string) => call<{ ok: true }>(`/api/album/${encodeURIComponent(id)}`, { method: "DELETE" }),
  addPhoto: (id: string, photo: Blob) =>
    call<AlbumPhotoView>(`/api/album/${encodeURIComponent(id)}/photos`, { method: "POST", headers: { "Content-Type": photo.type || "application/octet-stream" }, body: photo }),
  removePhoto: (id: string, photoId: string) => call<{ ok: true }>(`/api/album/${encodeURIComponent(id)}/photos/${encodeURIComponent(photoId)}`, { method: "DELETE" }),
  newLink: (id: string) => call<OwnedAlbumView>(`/api/album/${encodeURIComponent(id)}/link`, { method: "POST" }),
  suggestCaptions: (id: string) => call<{ captions: Record<string, string> }>(`/api/album/${encodeURIComponent(id)}/captions`, { method: "POST" }),
};

export function photoSrc(albumId: string, photoId: string): string {
  return `/api/album/${encodeURIComponent(albumId)}/photos/${encodeURIComponent(photoId)}`;
}

/** The album's public address: NEXT_PUBLIC_SITE_URL when set, else this page's origin. */
export function albumUrl(albumId: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  const origin = configured && /^https?:\/\//.test(configured) ? configured : typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/album/${albumId}`;
}

/* ---------- The album id a day shows ---------- */

const EVENT = "comimo:album";

/** Remember (or forget) a day's album id and tell every QR code on the page. */
export async function rememberAlbum(dayId: string, albumId: string | null): Promise<void> {
  await setAlbumId(dayId, albumId);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { dayId, albumId } }));
}

/** A day's album id, kept up to date when the album is made, relinked or deleted. */
export function useAlbumId(dayId: string | null): string | null {
  const [state, setState] = useState<{ dayId: string; albumId: string | null } | null>(null);
  useEffect(() => {
    if (!dayId) return;
    let cancelled = false;
    const load = () => void getAlbumId(dayId).then((albumId) => !cancelled && setState({ dayId, albumId }));
    load();
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ dayId: string; albumId: string | null }>).detail;
      if (detail?.dayId === dayId) setState({ dayId, albumId: detail.albumId });
    };
    window.addEventListener(EVENT, onChange);
    window.addEventListener("comimo:synced", load);
    return () => {
      cancelled = true;
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("comimo:synced", load);
    };
  }, [dayId]);
  return state && state.dayId === dayId ? state.albumId : null;
}

/* ---------- Getting a photo ready to send ---------- */

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const SIDE = 2048;

/**
 * A photo as it will be sent: shrunk to 2048 px as a JPEG in the browser when
 * the browser can open it (Safari opens iPhone HEIC photos too), else the
 * original. The server re-encodes it either way, which is what removes EXIF
 * and location; this step just keeps uploads small.
 */
export async function preparePhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
