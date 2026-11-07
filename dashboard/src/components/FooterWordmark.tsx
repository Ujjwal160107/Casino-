"use client";

import { useArrival, useReducedMotionPref } from "./landing/kit";

/**
 * Big Shoulders Black advance widths for F-O-R-T-U-N-A (font units, 2000 per
 * em, cap height 1600), measured from the site's own font file. Each letter is
 * placed at its advance so the word's ink spans the viewBox edge to edge.
 */
const WORDMARK = [
  { ch: "F", adv: 868 },
  { ch: "O", adv: 1051, gold: true },
  { ch: "R", adv: 1010 },
  { ch: "T", adv: 872 },
  { ch: "U", adv: 1049 },
  { ch: "N", adv: 1229 },
  { ch: "A", adv: 1024 },
].map((l, i, all) => ({ ...l, x: all.slice(0, i).reduce((s, p) => s + p.adv, 0) }));
// Ink runs from F's left bearing (99) to A's right edge (7103 - 36); the bottom 15% of the caps (240 of 1600) is cropped.
const VIEWBOX = "99 -40 6968 1400";

/** Giant low-contrast FORTUNA across the footer's foot; letters rise from the crop line once, in a stagger. */
export function FooterWordmark() {
  const [ref, arrival] = useArrival<SVGSVGElement>("0px");
  const reduced = useReducedMotionPref();
  const hidden = arrival === "armed" && !reduced;
  return (
    <svg ref={ref} aria-hidden viewBox={VIEWBOX} className="block h-auto w-full font-display font-black" focusable="false">
      {WORDMARK.map((l, i) => (
        <text
          key={l.ch}
          x={l.x}
          y={1600}
          fontSize={2000}
          textLength={l.adv}
          lengthAdjust="spacingAndGlyphs"
          style={{
            // In style, not the fill attribute: presentation attributes don't reliably resolve var().
            fill: l.gold ? "color-mix(in srgb, var(--color-bg) 80%, var(--color-gold))" : "color-mix(in srgb, var(--color-bg) 89%, var(--color-ink))",
            transformBox: "fill-box",
            transform: hidden ? "translateY(110%)" : "none",
            transition: reduced ? undefined : `transform .9s var(--ease-out-expo) ${i * 60}ms`,
          }}
        >
          {l.ch}
        </text>
      ))}
    </svg>
  );
}
