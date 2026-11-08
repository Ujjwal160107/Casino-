"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotionPref } from "@/components/landing/kit";
import { cn } from "@/lib/utils";
import { Tile } from "./Tile";

/** The six crew heist seats, in the bot's seat order. */
const ROLES = ["Mastermind", "Lookout", "Safecracker", "Driver", "Muscle", "Hacker"] as const;
const STEP_MS = 380;
const DONE = "Clean job · every seat paid";

function clearTimers(timers: { current: number[] }) {
  timers.current.forEach(clearTimeout);
  timers.current = [];
}

/** Every seat counts: the six seats lock in one by one when the tile arrives; tap or Enter reruns it. */
export function HeistCrewTile() {
  const reduced = useReducedMotionPref();
  const [lit, setLit] = useState(0);
  const [status, setStatus] = useState("Tap to run the job");
  const tileRef = useRef<HTMLElement>(null);
  const timers = useRef<number[]>([]);

  const run = useCallback(() => {
    clearTimers(timers);
    if (reduced) { setLit(ROLES.length); setStatus(DONE); return; }
    setLit(0);
    ROLES.forEach((role, i) => {
      timers.current.push(window.setTimeout(() => { setLit(i + 1); setStatus(`${role} locked in`); }, STEP_MS * (i + 1)));
    });
    timers.current.push(window.setTimeout(() => setStatus(DONE), STEP_MS * ROLES.length + 350));
  }, [reduced]);

  useEffect(() => {
    const el = tileRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { io.disconnect(); run(); }
    }, { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, [run]);

  useEffect(() => () => clearTimers(timers), []);

  const done = status === DONE;

  return (
    <Tile
      ref={tileRef}
      tone="bone"
      kicker="Crew Heist · !heist"
      title="Every seat counts."
      copy="Six seats, one question each. Your brief holds a crewmate's answer, so the job only works if the crew talks."
      onClick={run}
      className="cursor-pointer"
    >
      <ul className="grid grid-cols-3 gap-3">
        {ROLES.map((role, i) => {
          const on = i < lit;
          return (
            <li
              key={role}
              className={cn(
                "grid justify-items-center gap-1.5 rounded-[14px] border-2 px-1 py-3 text-center text-[12px] font-semibold sm:px-2 sm:text-[13px] transition-[background-color,border-color,color,translate] duration-200",
                on ? "-translate-y-[3px] border-gold bg-gold text-bg" : "border-bg/30 text-bg/70",
              )}
            >
              <Image
                src={`/cf/cf_role_${role.toLowerCase()}.png`}
                alt=""
                width={40}
                height={40}
                className={cn("size-10 [image-rendering:pixelated]", !on && "opacity-55 grayscale")}
              />
              {role}
            </li>
          );
        })}
      </ul>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className={cn("font-mono text-[13px] font-bold", done && "rounded-full bg-gold px-3 py-1 text-bg")}>
          {status}
        </p>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); run(); }}
          className="min-h-11 rounded-full border-2 border-bg px-4 font-body text-[13px] font-bold uppercase text-bg transition-colors hover:bg-bg hover:text-ink"
        >
          Run it again
        </button>
      </div>
    </Tile>
  );
}
