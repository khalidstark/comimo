import Image from "next/image";
import type { ArtAsset } from "./manifest";

interface ArtProps {
  asset: ArtAsset;
  className?: string;
  /** Override the manifest alt text (use "" when a caption already says it). */
  alt?: string;
  /** Responsive sizes hint for raster art that replaces the placeholders. */
  sizes?: string;
  /** Preload: for the one image that is the page's largest paint. */
  priority?: boolean;
  /** Lazy by default; "eager" for art that must be ready the moment it is revealed. */
  loading?: "lazy" | "eager";
}

/**
 * Renders one manifest slot. SVG placeholders are served as-is; raster art
 * dropped in later goes through the Next image optimiser automatically.
 */
export function Art({ asset, className, alt, sizes, priority, loading }: ArtProps) {
  return (
    <Image
      src={asset.src}
      alt={alt ?? asset.alt}
      width={asset.width}
      height={asset.height}
      className={className}
      sizes={sizes}
      preload={priority}
      loading={priority ? undefined : loading}
      unoptimized={asset.src.endsWith(".svg")}
      data-placeholder={asset.placeholder || undefined}
      draggable={false}
    />
  );
}
