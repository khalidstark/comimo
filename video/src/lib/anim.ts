import { Easing, interpolate, spring } from "remotion";

/** The site's motion curves (globals.css --ease-cine, --ease-ink). */
export const cine = Easing.bezier(0.22, 1, 0.36, 1);
export const inkEase = Easing.bezier(0.7, 0, 0.2, 1);

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** 0 → 1 between `start` and `start + duration`, eased. */
export function progress(frame: number, start: number, duration: number, easing = cine): number {
  return interpolate(frame, [start, start + duration], [0, 1], { ...CLAMP, easing });
}

/** Linear map with clamping. */
export function map(frame: number, input: number[], output: number[], easing?: (t: number) => number): number {
  return interpolate(frame, input, output, { ...CLAMP, ...(easing ? { easing } : {}) });
}

/** A springy pop from 0 to 1 that starts at `start`. */
export function pop(frame: number, start: number, fps: number, stiffness = 180, damping = 13): number {
  return spring({ frame: frame - start, fps, config: { stiffness, damping, mass: 0.7 } });
}

/** A calmer spring for big objects. */
export function settle(frame: number, start: number, fps: number): number {
  return spring({ frame: frame - start, fps, config: { stiffness: 90, damping: 18, mass: 1 } });
}

/** How many characters of a typed string show at `frame`. */
export function typed(text: string, frame: number, start: number, charsPerFrame: number): string {
  const count = Math.max(0, Math.floor((frame - start) * charsPerFrame));
  return text.slice(0, count);
}

/** Keyframed position track: [{f, x, y}] interpolated with the cine ease per leg. */
export interface Key {
  f: number;
  x: number;
  y: number;
}
export function track(frame: number, keys: Key[]): { x: number; y: number } {
  if (frame <= keys[0].f) return { x: keys[0].x, y: keys[0].y };
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (frame <= b.f) {
      const t = interpolate(frame, [a.f, b.f], [0, 1], { ...CLAMP, easing: inkEase });
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }
  const last = keys[keys.length - 1];
  return { x: last.x, y: last.y };
}
