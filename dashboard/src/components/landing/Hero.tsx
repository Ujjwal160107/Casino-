"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { INVITE_URL } from "@/lib/links";
import { cn } from "@/lib/utils";
import { useMagnetic } from "@/components/LandingNavbar";
import { Container, btn, useReducedMotionPref } from "./kit";
import { DemoChat } from "./DemoChat";

/**
 * Landing hero: the loop in a giant three-line headline, the pitch, two calls
 * to action, and the playable demo chat on the right. All motion is
 * decorative and stops under prefers-reduced-motion; at rest (and without JS)
 * everything is visible.
 */

// Masked line rise, the outlined line filling gold, and the seal's slow turn.
const HERO_CSS = `
.hero-ln { display: block; overflow: hidden; padding-bottom: .04em; }
.hero-ln > span { display: block; animation: hero-rise .9s var(--ease-out-expo) both; }
.hero-ln:nth-child(2) > span { animation-delay: .1s; }
.hero-ln:nth-child(3) > span { animation-delay: .2s; }
@keyframes hero-rise { from { transform: translateY(105%); } }
.hero-ol > span {
  color: transparent; -webkit-text-stroke: 2.5px var(--color-ink);
  background: linear-gradient(var(--color-gold), var(--color-gold)) left / 0% 100% no-repeat;
  -webkit-background-clip: text; background-clip: text;
  transition: background-size .6s var(--ease-out-expo);
}
.hero-ol:hover > span { background-size: 100% 100%; }
.hero-seal-text { animation: hero-spin 14s linear infinite; transform-origin: 50% 50%; }
@keyframes hero-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .hero-ln > span, .hero-seal-text { animation: none; }
  .hero-ol > span { transition: none; }
}
`;

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden border-b-[3px] border-ink">
      <style href="fortuna-hero" precedence="default">{HERO_CSS}</style>
      <Container className="grid items-center gap-16 pb-24 pt-16 min-[1100px]:grid-cols-[minmax(0,1.05fr)_minmax(0,560px)]">
        <HeroCopy />
        <HeroDemo />
      </Container>
    </section>
  );
}

function HeroCopy() {
  const addRef = useMagnetic<HTMLAnchorElement>();
  return (
    <div className="relative z-[2] min-w-0">
      <p className="inline-flex items-center gap-3 font-mono text-[13px] font-bold uppercase tracking-[.16em] text-ink">
        <span aria-hidden className="h-[3px] w-9 bg-ink" />
        A life sim inside Discord
      </p>
      <h1 aria-label="Work. Bet. Heist." className="mt-6 font-display text-[clamp(76px,12.2vw,196px)] font-black uppercase leading-[.8] tracking-[-.01em] text-ink">
        <span aria-hidden className="hero-ln"><span>Work.</span></span>
        <span aria-hidden className="hero-ln hero-ol"><span>Bet.</span></span>
        <span aria-hidden className="hero-ln text-gold"><span>Heist.</span></span>
      </h1>
      <p className="mt-8 max-w-[46ch] text-xl leading-normal text-ink-2">
        Jobs, degrees, credit cards, a casino, a zoo, and now{" "}
        <b className="font-bold text-ink [box-decoration-break:clone] [box-shadow:inset_0_-.4em_0_color-mix(in_srgb,var(--color-gold)_55%,transparent)]">crime families</b>{" "}
        you run with friends. One account that follows you to every server.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <a ref={addRef} href={INVITE_URL} target="_blank" rel="noopener noreferrer" className={cn(btn.base, btn.main, btn.lg)}>
          <Plus size={20} strokeWidth={3} aria-hidden />
          Add to Discord
        </a>
        <a href="#modules" className={cn(btn.base, btn.ghost, btn.lg)}>
          See it in action
        </a>
      </div>
    </div>
  );
}

/** The demo chat, tilted, with the Don leaning in and the NEW seal. */
function HeroDemo() {
  const hostRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const donRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotionPref();

  // Tilt toward the pointer (fine pointers only).
  useEffect(() => {
    const host = hostRef.current, tilt = tiltRef.current;
    if (reduced || !host || !tilt || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const move = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      tilt.style.setProperty("--rx", `${(-y * 10).toFixed(2)}deg`);
      tilt.style.setProperty("--ry", `${(x * 10).toFixed(2)}deg`);
    };
    const leave = () => { tilt.style.setProperty("--rx", "0deg"); tilt.style.setProperty("--ry", "0deg"); };
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    return () => { host.removeEventListener("pointermove", move); host.removeEventListener("pointerleave", leave); leave(); };
  }, [reduced]);

  // The Don drifts slightly against the scroll.
  useEffect(() => {
    const don = donRef.current;
    if (reduced || !don) return;
    let frame = 0;
    const paint = () => { frame = 0; don.style.translate = `0 ${(scrollY * -0.12).toFixed(1)}px`; };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(paint); };
    addEventListener("scroll", onScroll, { passive: true });
    return () => { removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); don.style.translate = ""; };
  }, [reduced]);

  return (
    <div ref={hostRef} className="relative z-[2] min-w-0">
      <div
        ref={donRef}
        aria-hidden
        className="pointer-events-none absolute z-[3] max-[599px]:hidden min-[600px]:-right-3.5 min-[600px]:-top-[116px] min-[600px]:w-40 min-[1100px]:-bottom-[30px] min-[1100px]:-left-[140px] min-[1100px]:right-auto min-[1100px]:top-auto min-[1100px]:w-[250px]"
      >
        <Image
          src="/cf/cf_fortuna_don.png"
          alt=""
          width={500}
          height={500}
          sizes="250px"
          className="h-auto w-full [image-rendering:pixelated] [filter:drop-shadow(8px_8px_0_color-mix(in_srgb,var(--color-ink)_85%,transparent))]"
        />
      </div>

      <div
        ref={tiltRef}
        className="relative z-[2] rounded-2xl border-[3px] border-ink shadow-[12px_12px_0_var(--color-ink)] transition-transform duration-500 ease-[var(--ease-out-expo)] [--rx:0deg] [--ry:0deg] [transform:perspective(1400px)_rotateX(var(--rx))_rotateY(var(--ry))_rotate(-2deg)]"
      >
        <DemoChat />
      </div>

      <Seal />
    </div>
  );
}

/** Gold seal with the "New · Crime Families" ring. Sits top-right; top-left on tablets so the Don has the right. */
function Seal() {
  return (
    <div
      aria-hidden
      className="absolute -top-[42px] z-[4] grid h-[132px] w-[132px] place-items-center rounded-full bg-gold text-bg shadow-[5px_5px_0_var(--color-ink)] max-[699px]:hidden min-[700px]:-left-3 min-[1100px]:-right-9 min-[1100px]:left-auto"
    >
      <svg viewBox="0 0 132 132" className="hero-seal-text absolute inset-0 h-full w-full">
        <defs>
          <path id="hero-seal-path" d="M66,66 m-50,0 a50,50 0 1,1 100,0 a50,50 0 1,1 -100,0" />
        </defs>
        <text className="fill-current font-mono text-[11.5px] font-bold uppercase tracking-[.22em]">
          <textPath href="#hero-seal-path">New · Crime Families · New · Crime Families ·</textPath>
        </text>
      </svg>
      <span className="font-display text-[34px] font-black uppercase leading-none">New</span>
    </div>
  );
}
