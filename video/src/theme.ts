import { loadFont as loadBaloo } from "@remotion/google-fonts/BalooBhaijaan2";
import { loadFont as loadPlex } from "@remotion/google-fonts/IBMPlexSansArabic";
import { loadFont as loadPlaypen } from "@remotion/google-fonts/PlaypenSansArabic";

/**
 * The site's own design tokens (src/app/globals.css, light theme and the
 * night-print hero band) and its three faces, so the video looks like Comimo
 * and not like a generic trailer.
 */
export const C = {
  paper: "#eceff2",
  paperDeep: "#dde2e8",
  surface: "#fafbfc",
  ink: "#1b2148",
  inkSoft: "#4b5277",
  dot: "rgba(27, 33, 72, 0.16)",
  accent: "#f2397a",
  accentText: "#c2134f",
  highlight: "#ffc738",
  calm: "#0f9e8e",
  calmText: "#0a6b61",
  calmWash: "#d4efea",
  night: "#141938",
  nightDeep: "#0c1029",
  onNight: "#f4f5fa",
  onNightSoft: "#c3c8e2",
  white: "#ffffff",
} as const;

const display = loadBaloo("normal", { weights: ["500", "600", "700", "800"], subsets: ["latin"] });
const body = loadPlex("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });
const lettering = loadPlaypen("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });

export const F = {
  display: `${display.fontFamily}, system-ui, sans-serif`,
  body: `${body.fontFamily}, system-ui, sans-serif`,
  lettering: `${lettering.fontFamily}, "Comic Sans MS", cursive`,
} as const;

/** Hand-cut panel corners and the hard offset shadow the site uses. */
export const RADIUS_PANEL = "4px 7px 5px 6px";
export const shadow = (x = 5, color: string = C.ink) => `${x}px ${x}px 0 ${color}`;

/** The site's halftone paper: navy dots on cool newsprint. */
export const dots = (size = 14, color: string = C.dot) => ({
  backgroundColor: C.paper,
  backgroundImage: `radial-gradient(${color} 1.3px, transparent 1.6px)`,
  backgroundSize: `${size}px ${size}px`,
});

export const FPS = 30;
