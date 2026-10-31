import type { SlotView } from "./pageView";
import page from "./page.module.css";

/** A panel's ink line on the phone and desktop pages (CSS shows the one in use). */
export function SlotOutline({ slot, className }: { slot: SlotView; className?: string }) {
  return (
    <svg className={`${page.outline} ${className ?? ""}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <polygon className={page.outlinePhone} points={slot.outline.phone} />
      <polygon className={page.outlineDesktop} points={slot.outline.desktop} />
    </svg>
  );
}
