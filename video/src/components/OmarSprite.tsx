import type { CSSProperties } from "react";
import { staticFile } from "remotion";

/** Omar's sprite strip: idle, blink, wave1, wave2 (500 x 600 frames, keyed out). */
export const OMAR_FRAME = { w: 500, h: 600 };
export type OmarPose = 0 | 1 | 2 | 3;

export function OmarSprite({ pose, width, style }: { pose: OmarPose; width: number; style?: CSSProperties }) {
  const height = (width * OMAR_FRAME.h) / OMAR_FRAME.w;
  return (
    <div
      style={{
        width,
        height,
        backgroundImage: `url(${staticFile("own/omar/sprite.webp")})`,
        backgroundSize: `${width * 4}px ${height}px`,
        backgroundPosition: `${-pose * width}px 0`,
        backgroundRepeat: "no-repeat",
        ...style,
      }}
    />
  );
}

/** A round head-and-shoulders crop of the idle frame for avatars. */
export function OmarAvatar({ size }: { size: number }) {
  const frameW = size * 3.2;
  const frameH = (frameW * OMAR_FRAME.h) / OMAR_FRAME.w;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        backgroundColor: "#d4efea",
        backgroundImage: `url(${staticFile("own/omar/sprite.webp")})`,
        backgroundSize: `${frameW * 4}px ${frameH}px`,
        backgroundPosition: `${-(frameW - size) / 2}px ${-frameH * 0.1}px`,
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}
