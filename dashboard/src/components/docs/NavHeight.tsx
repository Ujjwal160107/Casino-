"use client";

import { useEffect } from "react";

/**
 * Publishes the site nav's height as --docs-nav-h, so the sticky docs chrome
 * (sidebar, TOC, phone bar) and the scroll margins sit right under the nav
 * whatever its height.
 */
export function NavHeight() {
  useEffect(() => {
    const root = document.documentElement;
    const header = document.querySelector("header");
    if (!header) return;
    const measure = () => root.style.setProperty("--docs-nav-h", `${header.getBoundingClientRect().height}px`);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(header);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--docs-nav-h");
    };
  }, []);
  return null;
}
