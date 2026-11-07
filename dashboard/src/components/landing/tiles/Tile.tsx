import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** The frame every How-it-plays tile shares: border, radius, padding, hover lift, kicker, title and copy. */
export type TileTone = "panel" | "gold" | "bone";

const tones: Record<TileTone, { frame: string; copy: string }> = {
  panel: { frame: "border-ink bg-panel text-ink", copy: "text-ink-2" },
  gold: { frame: "border-gold bg-gold text-bg", copy: "text-bg/80" },
  bone: { frame: "border-ink bg-ink text-bg", copy: "text-bg/80" },
};

export function Tile({
  tone = "panel",
  kicker,
  title,
  copy,
  className,
  children,
  ...rest
}: { tone?: TileTone; kicker: string; title: string; copy?: string } & ComponentProps<"article">) {
  const t = tones[tone];
  return (
    <article
      {...rest}
      className={cn(
        "relative flex h-full min-w-0 flex-col gap-3 overflow-hidden rounded-[18px] border-[3px] p-8",
        "transition-[translate,box-shadow] duration-300 ease-out-expo hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[8px_8px_0_var(--color-ink)]",
        t.frame,
        className,
      )}
    >
      <span className="font-mono text-xs font-bold uppercase tracking-[.14em] opacity-75">{kicker}</span>
      <h3 className="font-display text-[clamp(38px,3.8vw,48px)] font-black uppercase leading-[.86]">{title}</h3>
      {copy && <p className={cn("max-w-[42ch]", t.copy)}>{copy}</p>}
      {children}
    </article>
  );
}
