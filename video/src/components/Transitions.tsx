import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../theme";
import { inkEase, map, progress } from "../lib/anim";

export type TransitionKind = "turn" | "wipe" | "none";

/**
 * How a scene leaves during its last `overlap` frames, drawn over the next
 * scene (which is already playing underneath):
 *
 * - turn: the page is turned away from its left edge, shading as it lifts,
 *   and casts a shadow on the page below.
 * - wipe: a slanted panel gutter sweeps across like the next panel being
 *   inked in, with a navy gutter line riding the edge.
 */
export function TransitionOut({ kind, duration, overlap, children }: { kind: TransitionKind; duration: number; overlap: number; children: ReactNode }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const start = duration - overlap;
  if (kind === "none" || frame < start) return <AbsoluteFill>{children}</AbsoluteFill>;
  const t = progress(frame, start, overlap, inkEase);

  if (kind === "turn") {
    const angle = -t * 112;
    const lift = Math.sin(t * Math.PI);
    return (
      <AbsoluteFill style={{ perspective: width * 1.6, perspectiveOrigin: "0% 50%" }}>
        {/* The shadow the turning page throws on the next page. */}
        <AbsoluteFill style={{ background: `linear-gradient(90deg, rgba(12,16,41,${0.55 * (1 - t)}) 0%, rgba(12,16,41,${0.25 * (1 - t)}) ${30 + t * 60}%, transparent ${40 + t * 60}%)` }} />
        <AbsoluteFill
          style={{
            transformOrigin: "0% 50%",
            transform: `rotateY(${angle}deg) translateZ(${lift * 40}px)`,
            backfaceVisibility: "hidden",
            boxShadow: `${20 + lift * 40}px 0 ${60 * lift}px rgba(12,16,41,${0.5 * lift})`,
            overflow: "hidden",
          }}
        >
          {children}
          {/* The page bends into shade as it turns. */}
          <AbsoluteFill style={{ background: `linear-gradient(270deg, rgba(12,16,41,${0.55 * t}) 0%, rgba(255,255,255,${0.12 * lift}) 45%, transparent 80%)` }} />
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  // Slanted wipe: the old scene stays to the right of a moving gutter edge.
  const slant = height * 0.22;
  const edge = map(t, [0, 1], [-slant - 40, width + 40]);
  const top = edge + slant;
  const bottom = edge;
  const gutter = 26;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `polygon(${top}px 0, ${width}px 0, ${width}px ${height}px, ${bottom}px ${height}px)` }}>{children}</AbsoluteFill>
      <AbsoluteFill
        style={{
          clipPath: `polygon(${top - gutter}px 0, ${top}px 0, ${bottom}px ${height}px, ${bottom - gutter}px ${height}px)`,
          background: C.surface,
        }}
      />
      <AbsoluteFill
        style={{
          clipPath: `polygon(${top - gutter * 0.62}px 0, ${top - gutter * 0.38}px 0, ${bottom - gutter * 0.38}px ${height}px, ${bottom - gutter * 0.62}px ${height}px)`,
          background: C.ink,
        }}
      />
    </AbsoluteFill>
  );
}
