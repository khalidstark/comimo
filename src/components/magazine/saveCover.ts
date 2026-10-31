import type { PanelArt } from "@/components/comic/view";
import { monthLabel } from "@/lib/magazine/issue";
import { DEFAULT_TAGLINE, issueLine, type IssueContext } from "./IssuePages";

/**
 * "Save cover as image": the front cover drawn onto a canvas (the art, the
 * masthead, the issue line, the cover line and the stars) and downloaded as
 * a PNG. Everything drawn is same-origin (shipped art or an object URL), so
 * the canvas stays exportable.
 */

const W = 1200;
const H = Math.round(W / 0.7);
const INK = "#1b2148";
const PINK = "#f2397a";
const YELLOW = "#ffc738";

function srcOf(picture: PanelArt): string {
  return picture.kind === "art" ? picture.asset.src : picture.src;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image failed to load"));
    image.src = src;
  });
}

/** The page's own font families, resolved from the next/font variables. */
function family(variable: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value ? `${value}, ${fallback}` : fallback;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export async function saveCoverImage(ctx: IssueContext): Promise<void> {
  const { issue, stars } = ctx;
  await document.fonts?.ready;
  const display = family("--font-display", "system-ui, sans-serif");
  const lettering = family("--font-lettering", "cursive");

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");
  if (!g) return;

  // Art, cropped to fill like object-fit: cover.
  g.fillStyle = INK;
  g.fillRect(0, 0, W, H);
  try {
    const art = await loadImage(srcOf(issue.cover.art));
    const scale = Math.max(W / art.naturalWidth, H / art.naturalHeight);
    const w = art.naturalWidth * scale;
    const h = art.naturalHeight * scale;
    g.drawImage(art, (W - w) / 2, (H - h) * 0.4, w, h);
  } catch {
    // Keep the ink background.
  }

  // Washes for legibility, as on the page.
  const top = g.createLinearGradient(0, 0, 0, H * 0.27);
  top.addColorStop(0, "rgba(247,245,239,0.82)");
  top.addColorStop(0.63, "rgba(247,245,239,0.35)");
  top.addColorStop(1, "rgba(247,245,239,0)");
  g.fillStyle = top;
  g.fillRect(0, 0, W, H * 0.27);
  const bottom = g.createLinearGradient(0, H, 0, H * 0.54);
  bottom.addColorStop(0, "rgba(12,16,41,0.88)");
  bottom.addColorStop(0.52, "rgba(12,16,41,0.55)");
  bottom.addColorStop(1, "rgba(12,16,41,0)");
  g.fillStyle = bottom;
  g.fillRect(0, H * 0.54, W, H * 0.46);

  // Spine: the month's weather, day by day.
  const spineW = W * 0.034;
  const moodColour: Record<string, string> = { sunny: YELLOW, cloudy: "#a9b3c7", rainy: "#3d7fe0", stormy: "#3a4369", rainbow: PINK };
  issue.days.forEach((day, i) => {
    const y = (H / issue.days.length) * i;
    g.fillStyle = moodColour[day.mood] ?? "#a9b3c7";
    g.fillRect(0, y, spineW, H / issue.days.length);
    g.fillStyle = "rgba(27,33,72,0.45)";
    g.fillRect(0, y + H / issue.days.length - 1, spineW, 1);
  });
  g.fillStyle = INK;
  g.fillRect(spineW, 0, 3, H);

  // Masthead.
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.font = `800 ${Math.round(W * 0.26)}px ${display}`;
  g.fillStyle = PINK;
  g.fillText("comimo", W / 2 + W * 0.012, H * 0.2 + W * 0.012);
  g.fillStyle = INK;
  g.fillText("comimo", W / 2, H * 0.2);

  g.font = `700 ${Math.round(W * 0.03)}px ${display}`;
  const line = issueLine(issue).toUpperCase();
  const lineW = g.measureText(line).width + W * 0.05;
  const lineY = H * 0.225;
  g.fillStyle = "#ffffff";
  g.fillRect(W / 2 - lineW / 2, lineY, lineW, W * 0.05);
  g.strokeStyle = INK;
  g.lineWidth = 3;
  g.strokeRect(W / 2 - lineW / 2, lineY, lineW, W * 0.05);
  g.fillStyle = INK;
  g.fillText(line, W / 2, lineY + W * 0.037);

  // Cover line on a pink flash, then the stars.
  g.textAlign = "left";
  const left = W * 0.09;
  g.font = `800 ${Math.round(W * 0.07)}px ${display}`;
  const tagline = wrap(g, issue.cover.tagline ?? DEFAULT_TAGLINE, W * 0.78);
  const lineH = W * 0.075;
  const starsY = H * 0.9;
  let y = starsY - W * 0.1 - tagline.length * lineH;
  g.save();
  g.translate(left, y);
  g.rotate((-2 * Math.PI) / 180);
  tagline.forEach((text, i) => {
    const width = g.measureText(text).width + W * 0.05;
    g.fillStyle = INK;
    g.fillRect(W * 0.011, i * lineH + W * 0.011, width, lineH);
    g.fillStyle = PINK;
    g.fillRect(0, i * lineH, width, lineH);
    g.fillStyle = INK;
    g.fillText(text, W * 0.025, i * lineH + lineH * 0.78);
  });
  g.restore();

  y = starsY;
  g.font = `700 ${Math.round(W * 0.034)}px ${display}`;
  const label = "STARRING";
  const labelW = g.measureText(label).width + W * 0.028;
  g.fillStyle = YELLOW;
  g.fillRect(left, y - W * 0.035, labelW, W * 0.047);
  g.fillStyle = INK;
  g.fillText(label, left + W * 0.014, y);
  g.fillStyle = "#ffffff";
  g.fillText(stars.map((star) => star.name).join("  ·  "), left + labelW + W * 0.025, y);

  g.font = `400 ${Math.round(W * 0.026)}px ${lettering}`;
  g.fillStyle = "#c3c8e2";
  g.fillText(`${issue.days.length} ${issue.days.length === 1 ? "day" : "days"} · ${monthLabel(issue.month)}`, left, H * 0.955);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `comimo-${issue.sample ? "sample" : issue.month}-cover.png`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
