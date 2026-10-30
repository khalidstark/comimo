import {
  Baloo_Bhaijaan_2,
  IBM_Plex_Sans_Arabic,
  Playpen_Sans_Arabic,
} from "next/font/google";

/**
 * Three faces, each covering Arabic and Latin, so a mixed sentence never
 * falls back to a system font halfway through.
 *
 * - display: chunky, rounded headline face (titles, buttons, nav)
 * - body: calm reading face (paragraphs, form text)
 * - lettering: hand-drawn face for speech bubbles and captions
 */
export const display = Baloo_Bhaijaan_2({
  subsets: ["arabic", "latin"],
  weight: "variable",
  variable: "--font-display",
  display: "swap",
});

export const body = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

export const lettering = Playpen_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: "variable",
  variable: "--font-lettering",
  display: "swap",
  // No metric data exists for this face, so skip the generated fallback.
  adjustFontFallback: false,
});

export const fontVariables = [display.variable, body.variable, lettering.variable].join(" ");
