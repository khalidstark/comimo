"use client";

import { useRef } from "react";
import { spriteSheets } from "@/art/sprites";
import { Sprite } from "./Sprite";

/** Mimo on the home page: waves hello on arrival, and again when tapped, hovered or focused. */
export function MascotSprite({ className }: { className?: string }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  return (
    <button ref={buttonRef} type="button" className={className} aria-label="Wave to Mimo, the Comimo mascot">
      <Sprite sheet={spriteSheets.mascot} label="" hostRef={buttonRef} greet />
    </button>
  );
}
