"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { CommandPill } from "@/components/landing/kit";
import { cn } from "@/lib/utils";

/**
 * The modules rail. Above 900px: a row of tall columns where the open one
 * grows and shows its art and copy. At 900px and below: an accordion. One
 * item is always open; hover (fine pointers only), focus, click or tap opens
 * another, and the arrow keys move between the column buttons.
 */
export type RailModule = {
  slug: string;
  title: string;
  tagline: string;
  art: string;
  /** Photos fill the art area; pixel art is contained with padding. */
  photo?: boolean;
  cmds: string[];
  isNew?: boolean;
};

const HOVER_DESKTOP = "(hover: hover) and (pointer: fine) and (min-width: 901px)";

export function ModulesRailColumns({ modules }: { modules: RailModule[] }) {
  const id = useId();
  const [active, setActive] = useState(0);
  const heads = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent, i: number) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    heads.current[(i + step + modules.length) % modules.length]?.focus();
  }

  return (
    <ul className="@container flex flex-col gap-3 min-[901px]:h-[560px] min-[901px]:flex-row">
      {modules.map((m, i) => {
        const open = i === active;
        const bodyId = `${id}-body-${m.slug}`;
        return (
          <li
            key={m.slug}
            onPointerEnter={() => { if (matchMedia(HOVER_DESKTOP).matches) setActive(i); }}
            className={cn(
              "relative min-w-0 overflow-hidden rounded-[20px] border-[3px] border-ink transition-[flex-grow,background-color,color] duration-[600ms] ease-out-expo min-[901px]:grow min-[901px]:basis-0",
              open ? "bg-ink text-bg min-[901px]:grow-[5.5]" : "bg-panel text-ink hover:bg-panel-2",
            )}
          >
            <h3>
              <button
                ref={(el) => { heads.current[i] = el; }}
                type="button"
                aria-expanded={open}
                aria-controls={bodyId}
                onClick={() => setActive(i)}
                onFocus={() => setActive(i)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className={cn(
                  "relative z-10 flex min-h-16 w-full items-center gap-3 px-5 py-4 text-left min-[901px]:absolute",
                  open
                    ? "min-[901px]:left-0 min-[901px]:top-0 min-[901px]:w-auto min-[901px]:p-6"
                    : "min-[901px]:inset-0 min-[901px]:flex-col min-[901px]:justify-between min-[901px]:px-0 min-[901px]:py-6",
                )}
              >
                <span className={cn("flex items-center gap-2", !open && "min-[901px]:flex-col")}>
                  <span className="font-mono text-[13px] font-bold tracking-[.12em] opacity-75">{String(i + 1).padStart(2, "0")}</span>
                  {m.isNew && <span className="rounded-full bg-gold px-2 py-0.5 font-mono text-[11px] font-bold tracking-[.08em] text-bg">NEW</span>}
                </span>
                <span
                  className={cn(
                    "font-display text-[28px] font-black uppercase leading-none min-[901px]:rotate-180 min-[901px]:whitespace-nowrap min-[901px]:text-[30px] min-[901px]:[writing-mode:vertical-rl]",
                    open && "min-[901px]:sr-only",
                  )}
                >
                  {m.title}
                </span>
              </button>
            </h3>
            <div
              id={bodyId}
              className={cn(
                open ? "grid" : "hidden",
                // Laid out at the open column's width even while collapsed, so the art keeps a real size
                // and the copy never reflows as the column grows: (rail − 7 gaps − 8 borders) × 5.5 / 12.5.
                "min-[901px]:absolute min-[901px]:inset-y-0 min-[901px]:left-0 min-[901px]:grid min-[901px]:w-[calc((100cqw-132px)*0.44)] min-[901px]:grid-rows-[minmax(0,1fr)_auto]",
                open ? "min-[901px]:visible min-[901px]:opacity-100" : "min-[901px]:invisible min-[901px]:opacity-0",
              )}
              style={{ transition: open ? "opacity .45s .2s, visibility 0s" : "opacity .3s, visibility 0s .3s" }}
            >
              <div className="relative h-[220px] min-h-0 overflow-hidden min-[901px]:h-auto">
                <Image
                  src={m.art}
                  alt=""
                  fill
                  sizes="(min-width: 901px) 40vw, 100vw"
                  className={cn(
                    "transition-[scale] duration-[1200ms] ease-out-expo",
                    m.photo ? "object-cover" : "object-contain p-6 [image-rendering:pixelated] min-[901px]:px-12 min-[901px]:pb-3 min-[901px]:pt-16",
                    open ? "scale-100" : "scale-[1.08]",
                  )}
                />
              </div>
              <div className="grid gap-3 border-t-[3px] border-bg p-8">
                <p aria-hidden className="font-display text-[clamp(40px,4vw,56px)] font-black uppercase leading-[.85] max-[900px]:hidden">{m.title}</p>
                <p className="max-w-[52ch] text-bg/80">{m.tagline}</p>
                <div className="flex flex-wrap gap-2">
                  {m.cmds.map((c) => <CommandPill key={c} cmd={c} tone="inverted" />)}
                </div>
                <Link href={`/docs/${m.slug}`} className="inline-flex min-h-11 items-center justify-self-start font-body text-sm font-extrabold uppercase tracking-[.06em]">
                  <span className="border-b-[3px] border-gold pb-0.5">Read the guide →</span>
                </Link>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
