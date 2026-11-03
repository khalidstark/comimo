"use client";

import { useEffect, useRef } from "react";
import type { LoopMedia } from "@/art/manifest";

/**
 * A short seamless loop (muted, inline). Nothing downloads until it comes near the screen; it
 * plays while on screen and pauses off it. Reduced motion keeps the poster, the loop's own
 * first frame. Decorative: the words around it carry the meaning.
 */
export function LoopVideo({ loop, className }: { loop: LoopMedia; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    video.muted = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.preload = "auto";
          video.play().catch(() => {
            // Autoplay refused (data saver, low power): the poster stays.
          });
        } else {
          video.pause();
        }
      },
      { rootMargin: "240px 0px" },
    );
    io.observe(video);
    return () => {
      io.disconnect();
      video.pause();
    };
  }, []);

  return (
    <video
      ref={ref}
      className={className}
      src={loop.src}
      poster={loop.poster}
      width={loop.width}
      height={loop.height}
      muted
      loop
      playsInline
      preload="none"
      disablePictureInPicture
      disableRemotePlayback
      aria-hidden="true"
      tabIndex={-1}
    />
  );
}
