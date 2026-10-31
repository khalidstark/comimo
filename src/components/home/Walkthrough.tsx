"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import styles from "./Walkthrough.module.css";

/** Rendered from /video (Remotion); see video/scripts/render-all.mjs. */
const VIDEO = {
  src: "/video/comimo-walkthrough.mp4",
  poster: "/video/comimo-walkthrough-poster.jpg",
  captions: "/video/comimo-walkthrough.en.vtt",
};
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function prefersReducedMotion() {
  return window.matchMedia(REDUCED_MOTION).matches;
}

/**
 * "See how it works": the walkthrough film. It loads only when the section
 * comes near the screen, plays muted while in view (paused when it leaves),
 * with English captions on. One tap turns the sound on. With reduced motion
 * it waits on its poster until someone presses play.
 */
export function Walkthrough() {
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const reduced = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);

  // Fetch the file only once the section is close.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  // Muted autoplay while at least half of it is on screen.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !near || reduced) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= 0.5) {
          video.play().catch(() => {
            // Autoplay refused (data saver, policy): the play button stays.
          });
        } else {
          video.pause();
        }
      },
      { threshold: [0, 0.5] },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [near, reduced]);

  // Captions on by default.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !near) return;
    const show = () => {
      for (const track of Array.from(video.textTracks)) track.mode = "showing";
    };
    show();
    video.textTracks.addEventListener("addtrack", show);
    return () => video.textTracks.removeEventListener("addtrack", show);
  }, [near]);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (video.ended) video.currentTime = 0;
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  }

  function toggleSound() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    if (!video.muted && video.paused) void video.play().catch(() => {});
  }

  return (
    <section className={`page section ${styles.section}`} aria-labelledby="walkthrough-title">
      <div className={styles.head}>
        <h2 id="walkthrough-title" className="section__title">
          See how it works
        </h2>
        <p className="section__lede">
          One evening, start to finish: the day typed in, new faces added, the page drawn and checked, and a month bound
          into a magazine. About a minute.
        </p>
      </div>

      <div ref={frameRef} className={styles.frame}>
        <video
          ref={videoRef}
          className={styles.video}
          poster={VIDEO.poster}
          muted
          playsInline
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onClick={togglePlay}
          aria-label="Comimo walkthrough video"
        >
          {near ? (
            <>
              <source src={VIDEO.src} type="video/mp4" />
              <track kind="captions" srcLang="en" label="English" src={VIDEO.captions} default />
            </>
          ) : null}
        </video>

        {!playing ? (
          <button type="button" className={styles.bigPlay} onClick={togglePlay} aria-label="Play the walkthrough">
            <span aria-hidden="true" className={styles.triangle} />
          </button>
        ) : null}

        <div className={styles.controls}>
          <button type="button" className={styles.control} onClick={togglePlay} aria-label={playing ? "Pause the walkthrough" : "Play the walkthrough"}>
            {playing ? "Pause" : "Play"}
          </button>
          <button type="button" className={`${styles.control} ${muted ? styles.soundOff : ""}`} onClick={toggleSound} aria-pressed={!muted}>
            {muted ? "Tap for sound" : "Sound on"}
          </button>
        </div>
      </div>
    </section>
  );
}
