"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface TocItem {
  id: string;
  label: string;
}

/**
 * "On this page" with scroll-spy: the first section inside the reading band
 * (just under the nav) is marked current, and the list keeps it in view.
 */
export function DocsToc({ items, title = "On this page" }: { items: TocItem[]; title?: string }) {
  const navRef = useRef<HTMLElement>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const idKey = items.map((i) => i.id).join(" ");

  useEffect(() => {
    const ids = idKey.split(" ");
    const visible = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        const first = ids.find((id) => visible.has(id));
        if (first) setCurrent(first);
      },
      { rootMargin: "-110px 0px -70% 0px" },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [idKey]);

  useEffect(() => {
    const nav = navRef.current;
    const link = nav?.querySelector<HTMLElement>("[aria-current]");
    if (!nav || !link) return;
    // the sticky nav is the link's offsetParent
    const top = link.offsetTop;
    if (top < nav.scrollTop || top + link.offsetHeight > nav.scrollTop + nav.clientHeight) {
      nav.scrollTop = top - nav.clientHeight / 2;
    }
  }, [current]);

  return (
    <nav
      ref={navRef}
      aria-label={title}
      className="sticky top-[calc(var(--docs-nav-h,64px)+32px)] grid max-h-[calc(100vh-var(--docs-nav-h,64px)-64px)] gap-0.5 overflow-y-auto pb-4 text-[13.5px]"
    >
      <p className="mb-1.5 font-mono text-[11px] font-bold uppercase tracking-[.16em] text-muted">{title}</p>
      {items.map((item) => {
        const on = item.id === current;
        return (
          <a
            key={item.id}
            href={`#${item.id}`}
            aria-current={on ? "location" : undefined}
            className={cn(
              "border-l-2 py-1.5 pl-3 leading-snug transition-colors",
              on ? "border-gold text-gold" : "border-line text-muted hover:text-ink",
            )}
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}
