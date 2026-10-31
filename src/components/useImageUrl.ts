"use client";

import { useEffect, useState } from "react";
import { artAt } from "@/art/manifest";
import { getImage } from "@/lib/store";
import type { ImageRef } from "@/lib/types";

/** A URL for an ImageRef: manifest art directly, a stored Blob as an object URL (revoked when it changes). */
export function useImageUrl(ref: ImageRef | null): string | null {
  const [blobUrl, setBlobUrl] = useState<{ id: string; url: string } | null>(null);
  const blobId = ref?.kind === "blob" ? ref.id : null;

  useEffect(() => {
    if (!blobId) return;
    let url: string | null = null;
    let cancelled = false;
    void getImage(blobId).then((blob) => {
      if (cancelled || !blob) return;
      url = URL.createObjectURL(blob);
      setBlobUrl({ id: blobId, url });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [blobId]);

  if (!ref) return null;
  if (ref.kind === "art") return artAt(ref.path).src;
  return blobUrl?.id === ref.id ? blobUrl.url : null;
}
