// Frame sequences for the scroll film and the ink transition: numbered WebP frames in
// public/media/<dir>/, decoded nearest-first and drawn to a canvas with "cover" framing and a
// crossfade between neighbours, so 48 frames still glide at any scroll speed.

export interface Sequence {
  images: HTMLImageElement[];
  /** True once frame i is decoded and safe to draw. */
  ready(i: number): boolean;
  /** Load the frames nearest to i next (the reader jumped ahead). */
  focus(i: number): void;
  /** The frame's edge colour (its paper or night), sampled once it decoded, for letterboxing. */
  edge(i: number): string | undefined;
  /** Stops loading; frames already decoded stay usable. */
  stop(): void;
}

export interface DrawView {
  /** 0 = cover the canvas (crop), 1 = contain (whole frame, edges filled with its edge colour). */
  fit?: number;
  /** Focal point (0..1 of the frame) kept in view when cover crops. */
  x?: number;
  y?: number;
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
  const edges: (string | undefined)[] = urls.map(() => undefined);
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
          edges[i] = sampleEdge(img);
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
    edge: (i) => edges[i],
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
 * the two nearest decoded frames. `scale` zooms around the focal point. Returns false when no
 * frame is decoded yet, so the caller can keep its poster.
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

  const fit = view.fit ?? 0;
  if (fit > 0) {
    ctx.fillStyle = seq.edge(mix > 0.5 ? b : a) ?? seq.edge(a) ?? "#eceff2";
    ctx.fillRect(0, 0, W, H);
  }
  place(ctx, seq.images[a], W, H, scale, view, 1);
  if (b !== a && mix > 0.02) place(ctx, seq.images[b], W, H, scale, view, mix);
  return true;
}

function place(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  W: number,
  H: number,
  scale: number,
  { fit = 0, x = 0.5, y = 0.5 }: DrawView,
  alpha: number,
) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (!iw || !ih) return;
  const cover = Math.max(W / iw, H / ih);
  const contain = Math.min(W / iw, H / ih);
  const s = (cover + (contain - cover) * fit) * scale;
  const dw = iw * s;
  const dh = ih * s;
  // Keep the focal point as near the centre as the frame allows (no empty edge while covering).
  const dx = clampOffset(W / 2 - x * dw, W, dw);
  const dy = clampOffset(H / 2 - y * dh, H, dh);
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.globalAlpha = 1;
}

function clampOffset(offset: number, box: number, drawn: number): number {
  if (drawn <= box) return (box - drawn) / 2;
  return Math.min(0, Math.max(box - drawn, offset));
}

/** Average colour of the frame's top and bottom rows, as rgb(). */
function sampleEdge(img: HTMLImageElement): string | undefined {
  try {
    const c = document.createElement("canvas");
    c.width = 8;
    c.height = 2;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return undefined;
    const ih = img.naturalHeight;
    const band = Math.max(1, Math.round(ih * 0.03));
    g.drawImage(img, 0, 0, img.naturalWidth, band, 0, 0, 8, 1);
    g.drawImage(img, 0, ih - band, img.naturalWidth, band, 0, 1, 8, 1);
    const d = g.getImageData(0, 0, 8, 2).data;
    let r = 0;
    let gr = 0;
    let b = 0;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i];
      gr += d[i + 1];
      b += d[i + 2];
    }
    const n = d.length / 4;
    return `rgb(${Math.round(r / n)} ${Math.round(gr / n)} ${Math.round(b / n)})`;
  } catch {
    return undefined;
  }
}
