"use client";

// Every in-app link leaves through ink. A plain click on a same-site link is taken over in the
// capture phase (preventDefault, so next/link skips its own navigation): the generated splash
// bursts from the click point while a navy flood of the same splash grows behind it until the
// page is covered (~380 ms), the route changes under the ink, and on the new page the ink
// recoils into the splash and lifts (~420 ms). Modified clicks, new tabs, downloads, same-page
// links, back/forward and reduced motion navigate as usual. A 1.5 s safety clear means the
// page is never left covered.

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { media } from "@/art/manifest";
import { frameUrls, loadSequence, type Sequence } from "@/lib/motion/sequence";

const IN_MS = 380;
const OUT_MS = 420;
const SAFETY_MS = 1500;
/** The splash's body ink, measured by the design pipeline (design/, process.py inkcut). */
const INK = "#01236f";
/** The splash centre in its frame, and each frame's solid-core radius (fraction of frame width). */
const CENTRE = [0.507, 0.491] as const;
const CORE = [0.025, 0.075, 0.098, 0.1, 0.12, 0.133, 0.14, 0.15, 0.15, 0.163, 0.163];
/** The flood behind the splash is the same splash, turned, so its edge is always ink, never a circle. */
const FLOOD_TURN = 0.62;

type Phase = "idle" | "in" | "hold" | "out";

interface InkState {
  phase: Phase;
  t0: number;
  /** Click point, CSS px. */
  x: number;
  y: number;
  from: string;
  hashed: boolean;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeIn = (v: number) => v * v * v;
const easeOut = (v: number) => 1 - Math.pow(1 - v, 3);
const easeInOut = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2);

export function InkTransition() {
  const router = useRouter();
  const pathname = usePathname();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const seqRef = useRef<Sequence | null>(null);
  const state = useRef<InkState>({ phase: "idle", t0: 0, x: 0, y: 0, from: "", hashed: false });
  const beginOut = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const root = document.documentElement;
    const s = state.current;
    const urls = frameUrls(media.ink.dir, media.ink.count);
    const load = () => (seqRef.current ??= loadSequence(urls, { parallel: 3 }));

    // A navy silhouette of a frame, for the flood; cached per frame index.
    const tint = document.createElement("canvas");
    const tintCtx = tint.getContext("2d");
    let tinted = -1;

    let raf = 0;
    let pushTimer = 0;
    let safety = 0;

    const finish = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      window.clearTimeout(pushTimer);
      window.clearTimeout(safety);
      s.phase = "idle";
      canvas.style.display = "none";
      canvas.removeAttribute("data-blocking");
      root.classList.remove("inking");
    };

    const out = () => {
      if (s.phase !== "hold" && s.phase !== "in") return;
      window.clearTimeout(safety);
      s.phase = "out";
      s.t0 = performance.now();
      canvas.removeAttribute("data-blocking");
    };
    beginOut.current = out;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const W = Math.round(window.innerWidth * dpr);
      const H = Math.round(window.innerHeight * dpr);
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
        tinted = -1;
      }
      ctx.clearRect(0, 0, W, H);

      let k: number; // how far the ink has come: 0 nothing, 1 the page is covered
      if (s.phase === "in") k = clamp01((now - s.t0) / IN_MS);
      else if (s.phase === "out") {
        const u = clamp01((now - s.t0) / OUT_MS);
        if (u >= 1) {
          finish();
          return;
        }
        k = 1 - u;
      } else k = 1;

      const x = s.x * dpr;
      const y = s.y * dpr;
      const reach = Math.max(Math.hypot(x, y), Math.hypot(W - x, y), Math.hypot(x, H - y), Math.hypot(W - x, H - y));
      // Leaving, the ink holds for a beat, then thins as it recoils.
      ctx.globalAlpha = s.phase === "out" ? clamp01(k * 1.7) : 1;

      const seq = seqRef.current;
      const fi = Math.round(easeOut(k) * (urls.length - 1));
      const img = seq?.images[fi];
      if (!seq || !img || !seq.ready(fi) || !tintCtx) {
        // No frames yet: a plain ink blot from the click point.
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1, reach * 1.02 * easeIn(k) ** 0.6), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        return;
      }

      if (tinted !== fi) {
        tint.width = img.naturalWidth;
        tint.height = img.naturalHeight;
        tintCtx.globalCompositeOperation = "source-over";
        tintCtx.drawImage(img, 0, 0);
        tintCtx.globalCompositeOperation = "source-in";
        tintCtx.fillStyle = INK;
        tintCtx.fillRect(0, 0, tint.width, tint.height);
        tinted = fi;
      }

      const base = Math.max(W, H) * 0.55;
      const front = base * (0.45 + 1.15 * easeInOut(k));
      const fullFlood = (reach / CORE[CORE.length - 1]) * 1.08;
      const flood = front + (fullFlood - front) * easeIn(k);
      const core = CORE[fi] ?? CORE[CORE.length - 1];

      if (k >= 1) {
        ctx.fillStyle = INK;
        ctx.fillRect(0, 0, W, H);
      } else {
        // Solid ink under the flood's core, so the cover is whole once the flood is big enough.
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(x, y, core * flood * 0.94, 0, Math.PI * 2);
        ctx.fill();
        stamp(ctx, tint, x, y, flood, FLOOD_TURN);
      }
      stamp(ctx, img, x, y, front, 0);
      ctx.globalAlpha = 1;
    };

    const start = (href: string, x: number, y: number) => {
      load();
      Object.assign(s, { phase: "in", t0: performance.now(), x, y, from: window.location.pathname, hashed: href.includes("#") });
      root.classList.add("inking");
      canvas.style.display = "block";
      canvas.setAttribute("data-blocking", "");
      if (!raf) raf = requestAnimationFrame(draw);
      router.prefetch(href);
      pushTimer = window.setTimeout(() => {
        if (s.phase !== "in") return;
        s.phase = "hold";
        router.push(href);
        // The new page never arrived (a slow server, a redirect back here): clear anyway.
        safety = window.setTimeout(out, SAFETY_MS);
      }, IN_MS);
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (reduce.matches) return;
      const link = (event.target as Element | null)?.closest?.("a");
      if (!(link instanceof HTMLAnchorElement)) return;
      if ((link.target && link.target !== "_self") || link.hasAttribute("download") || "noInk" in link.dataset) return;
      const raw = link.getAttribute("href") ?? "";
      if (!raw.startsWith("/") || raw.startsWith("//")) return;
      const url = new URL(link.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === window.location.pathname) return; // same page: a query or hash change
      event.preventDefault();
      if (s.phase === "in" || s.phase === "hold") return; // already on its way
      if (s.phase === "out") finish(); // a new link while the last ink lifts: start over
      let x = event.clientX;
      let y = event.clientY;
      if (event.detail === 0) {
        // Keyboard (Enter on a focused link): the ink starts from the link itself.
        const box = link.getBoundingClientRect();
        x = box.left + box.width / 2;
        y = box.top + box.height / 2;
      }
      start(url.pathname + url.search + url.hash, x, y);
    };
    document.addEventListener("click", onClick, { capture: true });

    // Load the splash once the page is idle.
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(() => {
          if (!reduce.matches) load();
        }, { timeout: 2500 })
      : window.setTimeout(() => {
          if (!reduce.matches) load();
        }, 2000);

    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      finish();
      beginOut.current = () => {};
    };
  }, [router]);

  // The new page is in: back to its top (unless the link named a spot), then the ink lifts.
  useEffect(() => {
    const s = state.current;
    if (s.phase !== "hold" && s.phase !== "in") return;
    if (pathname === s.from) return;
    if (!s.hashed) window.scrollTo({ top: 0, behavior: "instant" });
    const id = requestAnimationFrame(() => {
      if (s.phase === "hold") beginOut.current();
    });
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  return <canvas ref={canvasRef} className="ink-transition" aria-hidden="true" style={{ display: "none" }} />;
}

/** Draws a splash frame (or its silhouette) with its splash centre on (x, y), `width` wide, turned. */
function stamp(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, width: number, turn: number) {
  const iw = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
  const ih = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
  if (!iw || !ih) return;
  const height = (width * ih) / iw;
  ctx.save();
  ctx.translate(x, y);
  if (turn) ctx.rotate(turn);
  ctx.drawImage(img, -CENTRE[0] * width, -CENTRE[1] * height, width, height);
  ctx.restore();
}
