"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const REDUCED = "(prefers-reduced-motion: reduce)";

/**
 * Brings the element named by a #hash into view and gives it focus. Command
 * cards (#cmd-…) are centred and flash gold once so the eye finds them.
 */
export function revealHash(hash: string) {
  const id = decodeURIComponent(hash.replace(/^#/, ""));
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;
  const reduced = matchMedia(REDUCED).matches;
  const isCommand = id.startsWith("cmd-");
  el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: isCommand ? "center" : "start" });
  el.focus({ preventScroll: true });
  if (isCommand && !reduced) {
    el.animate(
      [
        { boxShadow: "0 0 0 6px color-mix(in srgb, var(--color-gold) 40%, transparent)" },
        { boxShadow: "0 0 0 0 transparent" },
      ],
      { duration: 1200, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
  }
}

/** Reveals the current hash when a docs page opens and whenever the hash changes. */
export function HashFocus() {
  const pathname = usePathname();
  useEffect(() => {
    const raf = requestAnimationFrame(() => revealHash(location.hash));
    const onHash = () => revealHash(location.hash);
    window.addEventListener("hashchange", onHash);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("hashchange", onHash);
    };
  }, [pathname]);
  return null;
}
