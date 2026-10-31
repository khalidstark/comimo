"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** How far (px) the pull reaches from the centre, and the most it moves. */
const REACH = 150;
const MAX_SHIFT = 12;

/**
 * A magnetic hover for the record stamp: within reach of a mouse pointer it
 * leans toward the cursor, then springs back. Touch, pen, keyboard and
 * reduced motion get the plain stamp.
 */
export function Magnetic({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || reduce.matches) return;

    let frame = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      frame = 0;
      el.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const box = el.getBoundingClientRect();
      const dx = event.clientX - (box.left + box.width / 2);
      const dy = event.clientY - (box.top + box.height / 2);
      const distance = Math.hypot(dx, dy);
      const pull = distance < REACH ? 1 - distance / REACH : 0;
      x = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, dx * 0.3 * pull));
      y = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, dy * 0.3 * pull));
      if (!frame) frame = requestAnimationFrame(apply);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
      el.style.translate = "";
    };
  }, []);

  return (
    <span ref={ref} className={className} data-magnetic="">
      {children}
    </span>
  );
}
