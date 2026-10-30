import type { CSSProperties } from "react";
import { art, type IconKey } from "./manifest";

interface IconProps {
  name: IconKey;
  className?: string;
  /** Any CSS length. Defaults to 1.5em so icons scale with the label. */
  size?: string;
}

/**
 * A manifest icon painted with the current text colour (CSS mask), so it
 * follows the theme and hover states like text does. Always decorative:
 * pair it with a visible or visually hidden label.
 */
export function Icon({ name, className, size = "1.5em" }: IconProps) {
  const url = `url("${art.icons[name].src}")`;
  const style: CSSProperties = {
    display: "inline-block",
    flex: "none",
    inlineSize: size,
    blockSize: size,
    backgroundColor: "currentColor",
    maskImage: url,
    maskSize: "contain",
    maskRepeat: "no-repeat",
    maskPosition: "center",
    WebkitMaskImage: url,
    WebkitMaskSize: "contain",
    WebkitMaskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
  };
  return <span aria-hidden="true" className={className} style={style} />;
}
