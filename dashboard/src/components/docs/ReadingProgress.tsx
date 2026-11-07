"use client";

import { useEffect, useRef } from "react";

/**
 * A 2px gold line under the site nav that fills as you read. It also
 * publishes the nav's height as --docs-nav-h so the sticky docs chrome sits
 * right under the nav whatever its height.
 */
export function ReadingProgress() {
  const barRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const header = document.querySelector("header");
    let raf = 0;
    const draw = () => {
      raf = 0;
      const max = root.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      if (barRef.current) barRef.current.style.transform = `scaleX(${progress})`;
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    const measure = () => {
      if (header) root.style.setProperty("--docs-nav-h", `${header.getBoundingClientRect().height}px`);
      schedule();
    };

    measure();
    const ro = new ResizeObserver(measure);
    if (header) ro.observe(header);
    ro.observe(document.body);
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("scroll", schedule);
      root.style.removeProperty("--docs-nav-h");
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-[var(--docs-nav-h,64px)] z-40 h-0.5">
      <span ref={barRef} className="block h-full origin-left bg-gold" style={{ transform: "scaleX(0)" }} />
    </div>
  );
}
