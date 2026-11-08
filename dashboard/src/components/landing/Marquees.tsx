"use client";

import { Fragment, useEffect, useRef } from "react";
import { useReducedMotionPref } from "./kit";

/**
 * Two decorative bands under the hero: the life loop in big type on bone, and
 * a command ticker on ink. They scroll at a fixed speed in opposite directions
 * and lean with scroll velocity; both are still under reduced motion.
 */

const WORDS = ["Work", "Study", "Marry", "Gamble", "Invest", "Hunt", "Heist", "Rule the turf"];
const CMDS = ["!work", "!daily", "!heist", "!crew", "!turf", "!slots", "!blackjack", "!bank", "!card", "!hunt", "!zoo", "!stock", "!buy-property", "!marry", "!study", "!shop"];

// The track holds the list four times and slides by half, so it stays seamless on wide screens.
const COPIES = [0, 1, 2, 3];

const MARQUEE_CSS = `
.mq-track { display: flex; width: max-content; animation: mq-slide 38s linear infinite; }
.mq-rev .mq-track { animation-direction: reverse; }
.mq-band:hover .mq-track { animation-play-state: paused; }
@keyframes mq-slide { to { transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) { .mq-track { animation: none; } }
`;

export function Marquees() {
  const bandsRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotionPref();

  // Skew the bands with scroll velocity; the rAF loop runs only while the page is moving.
  useEffect(() => {
    const root = bandsRef.current;
    if (reduced || !root) return;
    const bands = Array.from(root.querySelectorAll<HTMLElement>(".mq-band"));
    let lastY = scrollY, vel = 0, frame = 0;
    const tick = () => {
      const y = scrollY;
      vel += (y - lastY - vel) * 0.18;
      lastY = y;
      if (Math.abs(vel) > 0.05) {
        const skew = Math.max(-8, Math.min(8, vel * 0.25));
        bands.forEach((b) => { b.style.transform = `skewX(${(-skew).toFixed(2)}deg)`; });
        frame = requestAnimationFrame(tick);
      } else {
        frame = 0;
        vel = 0;
        bands.forEach((b) => { b.style.transform = ""; });
      }
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(tick); };
    addEventListener("scroll", onScroll, { passive: true });
    return () => {
      removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      bands.forEach((b) => { b.style.transform = ""; });
    };
  }, [reduced]);

  return (
    <div ref={bandsRef} aria-hidden className="relative z-[3] overflow-hidden">
      <style href="fortuna-marquees" precedence="default">{MARQUEE_CSS}</style>

      <div className="mq-band flex overflow-hidden border-b-[3px] border-ink bg-ink py-4 text-bg">
        <div className="mq-track">
          {COPIES.map((c) => (
            <Fragment key={c}>
              {WORDS.map((w) => (
                <span key={w} className="inline-flex flex-none items-center gap-[26px] px-[26px] font-display text-[40px] font-black uppercase leading-none">
                  {w}
                  <span className="h-3.5 w-3.5 rounded-full bg-gold" />
                </span>
              ))}
            </Fragment>
          ))}
        </div>
      </div>

      <div className="mq-band mq-rev flex overflow-hidden border-b-[3px] border-ink bg-bg py-3">
        <div className="mq-track">
          {COPIES.map((c) => (
            <Fragment key={c}>
              {CMDS.map((cmd, i) => (
                <span key={cmd} className={`flex-none px-[22px] font-mono text-[17px] font-bold ${i % 4 === 0 ? "text-gold" : "text-muted"}`}>
                  {cmd}
                </span>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
