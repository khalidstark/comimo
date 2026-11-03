// Frame sequences for the scroll film and the ink transition: numbered WebP frames in
// public/media/<dir>/, decoded nearest-first and drawn to a canvas with "cover" framing and a
// crossfade between neighbours, so 48 frames still glide at any scroll speed.

export interface Sequence {
  images: HTMLImageElement[];
  /** True once frame i is decoded and safe to draw. */
  ready(i: number): boolean;
  /** Load the frames nearest to i next (the reader jumped ahead). */
  focus(i: number): void;
  /** Stops loading; frames already decoded stay usable. */
  stop(): void;
}

export interface DrawView {
  /** 0 = cover the canvas (crop), 1 = contain (the whole frame, on `fill`). */
  fit?: number;
  /** Where the frame sits when it overflows or underfills, 0..1 like object-position. */
  x?: number;
  y?: number;
  /** "r g b" channels of the colour around a contained frame; its edges feather into it. */
  fill?: string;
}

/** `/media/<dir>/000.webp` ... for `count` frames. */
export function frameUrls(dir: string, count: number): string[] {
  const n = Math.max(0, Math.floor(count));
  return Array.from({ length: n }, (_, i) => `/media/${dir}/${String(i).padStart(3, "0")}.webp`);
}

/** The frame index for a progress 0..1 (clamped; NaN counts as 0). */
export function frameAt(progress: number, count: number): number {
  if (count <= 1) return 0;
  const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  return Math.round(p * (count - 1));
}

/** Frame indices ordered by distance from `start` (the nearer side first on ties, forward first). */
export function loadOrder(count: number, start = 0): number[] {
  const from = Math.min(Math.max(0, Math.round(start)), Math.max(0, count - 1));
  const order: number[] = [];
  for (let d = 0; order.length < count; d++) {
    if (from + d < count) order.push(from + d);
    if (d > 0 && from - d >= 0) order.push(from - d);
  }
  return order;
}

/**
 * Decodes the frames with img.decode(), nearest to `start` first, a few side by side.
 * Call stop() when the component unmounts.
 */
export function loadSequence(urls: string[], { start = 0, parallel = 4 } = {}): Sequence {
  const images: HTMLImageElement[] = [];
  const done = urls.map(() => false);
  let queue = loadOrder(urls.length, start);
  let running = 0;
  let stopped = false;

  const pump = () => {
    while (!stopped && running < parallel && queue.length) {
      const i = queue.shift()!;
      if (images[i]) continue;
      const img = new Image();
      img.decoding = "async";
      images[i] = img;
      running++;
      img.src = urls[i];
      img
        .decode()
        .then(() => {
          if (stopped) return;
          done[i] = true;
        })
        .catch(() => {
          // A frame that fails stays undrawn; its neighbours stand in for it.
        })
        .finally(() => {
          running--;
          pump();
        });
    }
  };
  pump();

  return {
    images,
    ready: (i) => done[i] === true,
    focus(i) {
      if (stopped) return;
      queue = loadOrder(urls.length, i).filter((k) => !images[k]);
      pump();
    },
    stop() {
      stopped = true;
      queue = [];
    },
  };
}

/** The nearest decoded frame to i, or -1. */
function nearestReady(seq: Sequence, i: number, count: number): number {
  for (let d = 0; d < count; d++) {
    if (i - d >= 0 && seq.ready(i - d)) return i - d;
    if (i + d < count && seq.ready(i + d)) return i + d;
  }
  return -1;
}

/**
 * Draws position `progress` (0..1) of the sequence into ctx, sized W x H, crossfading between
 * the two nearest decoded frames. `scale` zooms the frame. Returns false when no frame is
 * decoded yet, so the caller can keep its poster.
 */
export function drawSequence(
  ctx: CanvasRenderingContext2D,
  seq: Sequence,
  progress: number,
  W: number,
  H: number,
  scale = 1,
  view: DrawView = {},
): boolean {
  const count = seq.images.length;
  if (!count) return false;
  const pos = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0)) * (count - 1);
  const a = nearestReady(seq, Math.floor(pos), count);
  if (a < 0) return false;
  const b = nearestReady(seq, Math.ceil(pos), count);
  const mix = b > a ? (pos - a) / (b - a) : 0;

  const img = seq.images[a];
  const box = frameBox(img.naturalWidth, img.naturalHeight, W, H, scale, view);
  if (!box) return false;
  const fill = view.fill ?? "236 239 242";
  const inside = box.w < W - 0.5 || box.h < H - 0.5;
  if (inside) {
    ctx.fillStyle = `rgb(${fill})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.drawImage(img, box.x, box.y, box.w, box.h);
  if (b !== a && mix > 0.02) {
    ctx.globalAlpha = mix;
    ctx.drawImage(seq.images[b], box.x, box.y, box.w, box.h);
    ctx.globalAlpha = 1;
  }
  if (inside) feather(ctx, box, fill);
  return true;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where a frame lands: between cover and contain by `fit`, times `scale`, placed like object-position. */
export function frameBox(iw: number, ih: number, W: number, H: number, scale: number, { fit = 0, x = 0.5, y = 0.5 }: DrawView): Box | null {
  if (!iw || !ih) return null;
  const cover = Math.max(W / iw, H / ih);
  const contain = Math.min(W / iw, H / ih);
  const s = (cover + (contain - cover) * fit) * scale;
  const w = iw * s;
  const h = ih * s;
  return { x: (W - w) * x, y: (H - h) * y, w, h };
}

/** Melts a contained frame's edges into the fill around it. */
function feather(ctx: CanvasRenderingContext2D, box: Box, fill: string) {
  const band = Math.min(box.w, box.h) * 0.07;
  const solid = `rgb(${fill})`;
  const clear = `rgb(${fill} / 0)`;
  const edge = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, solid);
    g.addColorStop(1, clear);
    ctx.fillStyle = g;
    ctx.fillRect(rx, ry, rw, rh);
  };
  const { x, y, w, h } = box;
  edge(x, 0, x + band, 0, x - 1, y - 1, band + 1, h + 2);
  edge(x + w, 0, x + w - band, 0, x + w - band, y - 1, band + 1, h + 2);
  edge(0, y, 0, y + band, x - 1, y - 1, w + 2, band + 1);
  edge(0, y + h, 0, y + h - band, x - 1, y + h - band, w + 2, band + 1);
}
