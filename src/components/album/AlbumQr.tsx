"use client";

import { create } from "qrcode";
import { useMemo } from "react";
import { albumUrl, useAlbumId } from "@/lib/albumClient";
import styles from "./album.module.css";

/**
 * A printed QR code: the matrix from the qrcode library, drawn here as one SVG
 * path (no HTML from the library goes into the page). Quiet zone of 2 modules.
 */
function QrSvg({ text, className }: { text: string; className?: string }) {
  const { size, path } = useMemo(() => {
    const qr = create(text, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    let d = "";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) if (qr.modules.get(y, x)) d += `M${x + 2} ${y + 2}h1v1h-1z`;
    }
    return { size: n + 4, path: d };
  }, [text]);
  return (
    <svg className={className} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" role="img" aria-label="QR code for the photo album">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#1b2148" />
    </svg>
  );
}

/**
 * The end of a comic: when the day has a photo album, a printed QR code that
 * opens it. Nothing at all for a day without one.
 */
export function AlbumQr({ dayId, size = "full" }: { dayId: string; size?: "full" | "small" }) {
  const albumId = useAlbumId(dayId);
  if (!albumId) return null;
  const url = albumUrl(albumId);
  return (
    <a className={styles.qr} data-size={size} href={url} data-album-qr={albumId} aria-label="Open this day's photo album">
      <QrSvg text={url} className={styles.qrCode} />
      <span className={styles.qrText}>
        <span className={styles.qrKicker}>The real day</span>
        <span className={styles.qrHint}>{size === "full" ? "Scan for the photos from this day." : "Scan for the photos."}</span>
      </span>
    </a>
  );
}
