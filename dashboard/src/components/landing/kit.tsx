"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Shared building blocks for the landing page sections, so every section has
 * the same container, head, spacing and motion. Maximal Mono: ink, bone, gold.
 */

/**
 * Scroll arrival for one element. Starts "idle" (visible: SSR and no-JS see
 * everything); an element that is below the fold at mount becomes "armed"
 * (hidden, offscreen) and then "shown" when it scrolls in.
 */
export type ArrivalState = "idle" | "armed" | "shown";
export function useArrival<T extends Element>(rootMargin = "0px 0px -15% 0px") {
  const ref = useRef<T>(null);
  const [state, setState] = useState<ArrivalState>("idle");
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setState("shown"); io.disconnect(); }
      else setState((s) => (s === "idle" ? "armed" : s));
    }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);
  return [ref, state] as const;
}

const reducedQuery = "(prefers-reduced-motion: reduce)";
function subscribeReduced(cb: () => void) {
  const mq = matchMedia(reducedQuery);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
/** prefers-reduced-motion, kept in sync (false on the server). */
export function useReducedMotionPref() {
  return useSyncExternalStore(subscribeReduced, () => matchMedia(reducedQuery).matches, () => false);
}

/** Page-width container with the site's side gutters. */
export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[86rem] px-4 sm:px-6 lg:px-9", className)}>{children}</div>;
}

/** A landing section: shared vertical rhythm and a thin rule above it. */
export function Section({ id, className, children, ruled = true }: { id?: string; className?: string; children: ReactNode; ruled?: boolean }) {
  return (
    <section id={id} className={cn("relative py-[var(--section-y)]", ruled && "border-t border-line", className)}>
      {children}
    </section>
  );
}

/**
 * Section head: a giant outlined number that fills with gold as the section
 * arrives, a heading (wrap the accent word in <em>), an optional sub, and the
 * standard 64px gap before the content. `tone="inverted"` for bone bands.
 */
export function SectionHead({ num, title, sub, tone = "default" }: { num: string; title: ReactNode; sub?: ReactNode; tone?: "default" | "inverted" }) {
  const [ref, arrival] = useArrival<HTMLDivElement>();
  const seen = arrival === "shown";
  const ink = tone === "inverted" ? "var(--color-bg)" : "var(--color-ink)";
  const fill = tone === "inverted" ? "var(--color-bg)" : "var(--color-gold)";
  return (
    <div ref={ref} className="mb-16 grid grid-cols-1 items-end gap-x-7 gap-y-3 border-b-[3px] pb-5 sm:grid-cols-[auto_1fr]" style={{ borderColor: ink }}>
      <span
        aria-hidden
        className="font-display text-[clamp(70px,9vw,150px)] font-black leading-[.75] text-transparent sm:row-span-2"
        style={{
          WebkitTextStroke: `2px ${ink}`,
          backgroundImage: `linear-gradient(${fill}, ${fill})`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "left bottom",
          backgroundSize: seen ? "100% 100%" : "100% 0%",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          transition: "background-size 1s var(--ease-out-expo) .15s",
        }}
      >
        {num}
      </span>
      <h2 className="font-display text-[clamp(46px,6.4vw,104px)] font-black uppercase leading-[.85] [&_em]:not-italic [&_em]:text-gold" style={tone === "inverted" ? { color: "var(--color-bg)" } : undefined}>
        {title}
      </h2>
      {sub && <p className={cn("max-w-[56ch] text-lg", tone === "inverted" ? "text-bg/80" : "text-ink-2")}>{sub}</p>}
    </div>
  );
}

/** Lifts children in once as they scroll into view. Visible at rest, with reduced motion, and without JS. */
export function Reveal({ children, className, delay = 0, as: Tag = "div" }: { children: ReactNode; className?: string; delay?: number; as?: "div" | "li" | "article" }) {
  const [ref, arrival] = useArrival<HTMLDivElement>("0px 0px -8% 0px");
  const reduced = useReducedMotionPref();
  const hidden = arrival === "armed" && !reduced;
  return (
    <Tag
      ref={ref as never}
      className={className}
      style={{ opacity: hidden ? 0 : 1, transform: hidden ? "translateY(28px)" : "none", transition: reduced ? undefined : `opacity .55s var(--ease-out-expo) ${delay}ms, transform .65s var(--ease-out-expo) ${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

/** Copies a command and confirms it with a toast. */
export async function copyCommand(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${text}`);
  } catch {
    toast(`Type ${text} in Discord`);
  }
}

/** A pill button that copies a command. `tone="inverted"` for ink-on-bone surfaces. */
export function CommandPill({ cmd, tone = "default" }: { cmd: string; tone?: "default" | "inverted" | "gold" }) {
  const styles = {
    default: "border-ink/40 text-ink hover:border-gold hover:text-gold",
    inverted: "border-bg text-bg hover:bg-bg hover:text-ink",
    gold: "border-bg text-bg hover:bg-bg hover:text-gold",
  }[tone];
  return (
    <button type="button" onClick={() => copyCommand(cmd)} className={cn("inline-flex min-h-9 items-center rounded-full border-2 px-3 font-mono text-[13px] font-bold transition-colors", styles)} aria-label={`Copy ${cmd}`}>
      {cmd}
    </button>
  );
}

/** Primary and secondary buttons in the Maximal Mono style. */
export const btn = {
  base: "inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full border-[3px] px-6 font-body text-[15px] font-extrabold uppercase tracking-[.05em] transition-[transform,box-shadow,background-color,color,translate] duration-150 active:translate-y-0.5",
  main: "border-gold bg-gold text-bg shadow-[4px_4px_0_var(--color-ink)] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_var(--color-ink)]",
  ghost: "border-ink bg-transparent text-ink hover:bg-ink hover:text-bg",
  lg: "min-h-14 px-8 text-[17px]",
};
