"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { btn, useReducedMotionPref } from "@/components/landing/kit";
import { cn } from "@/lib/utils";
import { formatInt } from "./format";
import { Tile } from "./Tile";

const TICK_MS = 400;
const DRAIN = 0.035; // a full bar empties in about 11 seconds of viewing
const DEMO_RENT = 1250; // demo amount per tick, labelled as a demo

/** Feed the zoo: the hunger bar drains while the tile is on screen; rent ticks only while fed. */
export function FeedZooTile() {
  const reduced = useReducedMotionPref();
  const [{ hunger, rent }, setPen] = useState({ hunger: 0.85, rent: 0 });
  const tileRef = useRef<HTMLElement>(null);
  const tigerRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const el = tileRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let visible = false;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(el);
    const id = setInterval(() => {
      if (!visible || document.hidden) return;
      setPen((p) => ({ hunger: Math.max(0, p.hunger - DRAIN), rent: p.hunger > 0.02 ? p.rent + DEMO_RENT : p.rent }));
    }, TICK_MS);
    return () => { io.disconnect(); clearInterval(id); };
  }, []);

  function feed() {
    setPen((p) => ({ ...p, hunger: 1 }));
    if (!reduced) tigerRef.current?.animate([{ transform: "none" }, { transform: "translateY(-14px) rotate(4deg)", offset: 0.4 }, { transform: "none" }], { duration: 500, easing: "cubic-bezier(.16,1,.3,1)" });
  }

  const hungry = hunger <= 0.02;
  const state = hunger > 0.3 ? "Fed · paying rent" : hungry ? "Hungry · no rent" : "Getting hungry";

  return (
    <Tile ref={tileRef} kicker="Zoo · !zoo" title="Feed the zoo." copy="Fed animals pay rent. Let the hunger bar run out and the rent stops.">
      <div className="mt-3 flex items-center gap-4">
        <Image
          ref={tigerRef}
          src="/art/white-tiger.webp"
          alt="A white tiger"
          width={96}
          height={96}
          className={cn("size-24 shrink-0 object-contain [image-rendering:pixelated] transition-[filter,rotate] duration-400", hungry && "-rotate-4 brightness-70 grayscale")}
        />
        <div className="grid min-w-0 flex-1 gap-2">
          <b className="font-display text-[30px] font-black uppercase leading-none">White tiger</b>
          <div
            role="meter"
            aria-label="Hunger bar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(hunger * 100)}
            className="h-3 overflow-hidden rounded-full bg-line"
          >
            <i className="block h-full origin-left bg-gold transition-transform duration-400 ease-linear" style={{ transform: `scaleX(${hunger})` }} />
          </div>
          <span className={cn("font-mono text-[13px] font-semibold", hungry ? "text-ink" : "text-muted")} aria-live="polite">{state}</span>
        </div>
      </div>
      <div className="mt-auto flex items-baseline justify-between gap-3 border-t-[1.5px] border-line pt-3">
        <span className="font-mono text-xs font-bold uppercase tracking-[.12em] text-muted">Rent collected · demo</span>
        <b className="font-display text-[34px] font-black leading-none tabular-nums text-gold">{formatInt(rent)}</b>
      </div>
      <button type="button" onClick={feed} className={cn(btn.base, btn.ghost, "self-start")}>Feed everyone</button>
    </Tile>
  );
}
