"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";
import { MobileSidebar, NAV_LINKS, NewPill } from "./MobileSidebar";
import { btn, useReducedMotionPref } from "./landing/kit";
import { INVITE_URL } from "@/lib/links";
import { cn } from "@/lib/utils";

/**
 * Magnetic pull for a primary button: it leans up to ~6px toward a fine
 * pointer. Uses `transform` so it never fights the buttons' `translate`
 * hover lift. Off for touch and under reduced motion.
 */
export function useMagnetic<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const reduced = useReducedMotionPref();
  useEffect(() => {
    const el = ref.current;
    if (reduced || !el || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width - 0.5) * 12;
      const y = ((e.clientY - r.top) / r.height - 0.5) * 10;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    };
    const leave = () => { el.style.transform = ""; };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); leave(); };
  }, [reduced]);
  return ref;
}

/** Gold line along the nav's bottom edge that tracks page scroll. Hidden under reduced motion. */
function ScrollProgress() {
  const barRef = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotionPref();
  useEffect(() => {
    const bar = barRef.current;
    if (reduced || !bar) return;
    let frame = 0;
    const paint = () => {
      frame = 0;
      const d = document.documentElement;
      bar.style.transform = `scaleX(${Math.min(1, d.scrollTop / Math.max(1, d.scrollHeight - d.clientHeight))})`;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(paint); };
    paint();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => { removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); cancelAnimationFrame(frame); };
  }, [reduced]);
  if (reduced) return null;
  return (
    <span aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-[3px] h-[3px] overflow-hidden">
      <span ref={barRef} className="block h-full origin-left bg-gold [transform:scaleX(0)]" />
    </span>
  );
}

// `user`/`hideLogin` are accepted so existing pages keep compiling; login is
// intentionally disabled for now, so they go unused.
interface LandingNavbarProps {
  user?: { name?: string | null; image?: string | null };
  hideLogin?: boolean;
}

export function LandingNavbar(props: LandingNavbarProps) {
  void props;
  const [mobileOpen, setMobileOpen] = useState(false);
  const addRef = useMagnetic<HTMLAnchorElement>();

  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-50 border-b-[3px] border-ink bg-bg">
      <nav aria-label="Main" className="mx-auto flex min-h-[72px] w-full max-w-[86rem] items-center gap-3 px-4 sm:gap-6 sm:px-6 lg:px-9">
        <Link href="/" className="flex min-h-11 items-center gap-2.5 text-ink">
          <Image src="/fortuna_icon.png" alt="" width={38} height={38} className="h-[38px] w-[38px] rounded-full border-2 border-ink" />
          <span className="font-display text-[30px] font-black uppercase leading-none tracking-[.01em]">Fortuna</span>
        </Link>

        <div className="hidden items-center gap-1.5 lg:flex">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[14px] font-bold uppercase tracking-[.06em] text-ink transition-colors hover:bg-ink hover:text-bg"
            >
              {l.label}
              {l.isNew && <NewPill />}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2.5">
          <a
            ref={addRef}
            href={INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(btn.base, btn.main, "hidden sm:inline-flex")}
          >
            Add to Discord
          </a>

          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-ink text-ink transition-colors hover:bg-ink hover:text-bg lg:hidden"
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={mobileOpen}
          >
            <Menu size={20} aria-hidden="true" />
          </button>
        </div>
      </nav>

      <ScrollProgress />
      <MobileSidebar isOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
    </header>
  );
}
