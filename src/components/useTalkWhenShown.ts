"use client";

import { useEffect, useState, type RefObject } from "react";

/** Roughly how long a line takes to read aloud, kept short so a card never chatters on. */
function talkTime(text: string): number {
  return Math.min(4000, Math.max(1400, 900 + text.length * 60));
}

/**
 * True while a speech bubble has just come on screen: the speaker talks for
 * about as long as the line takes to say, then goes quiet until the bubble
 * leaves and comes back.
 */
export function useTalkWhenShown(bubbleRef: RefObject<HTMLElement | null>, text: string): boolean {
  const [talking, setTalking] = useState(false);

  useEffect(() => {
    const bubble = bubbleRef.current;
    if (!bubble || !text || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      setTalking(false);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          stop();
          return;
        }
        if (timer) return;
        setTalking(true);
        timer = setTimeout(() => {
          timer = null;
          setTalking(false);
        }, talkTime(text));
      },
      { threshold: 0.6 },
    );
    observer.observe(bubble);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [bubbleRef, text]);

  return talking;
}
