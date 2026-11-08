"use client";

import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { revealHash } from "../HashFocus";
import { CommandPalette } from "./CommandPalette";
import type { SearchItem } from "./search-index";

type OpenPalette = (opener?: HTMLElement | null) => void;
const PaletteContext = createContext<OpenPalette | null>(null);

/** Opens the docs search palette; pass the clicked button so focus returns to it. */
export function usePalette() {
  const open = use(PaletteContext);
  if (!open) throw new Error("usePalette must be used inside <PaletteProvider>");
  return open;
}

function isTextField(el: Element | null) {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

/**
 * Owns the one search palette on a docs or commands page: opening it (buttons,
 * Ctrl/Cmd+K, "/"), closing it, returning focus, and going to a picked result.
 */
export function PaletteProvider({ items, children }: { items: SearchItem[]; children: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLElement | null>(null);

  const openPalette = useCallback<OpenPalette>((opener) => {
    openerRef.current = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    const opener = openerRef.current;
    if (opener?.isConnected) opener.focus();
  }, []);

  const pick = useCallback(
    (item: SearchItem) => {
      setOpen(false);
      const url = new URL(item.href, location.href);
      if (url.pathname === location.pathname) {
        history.pushState(null, "", url.hash);
        revealHash(url.hash);
      } else {
        // HashFocus on the next page scrolls to and focuses the target.
        router.push(item.href, { scroll: false });
      }
    },
    [router],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (open) close();
        else openPalette();
      } else if (e.key === "/" && !open && !e.ctrlKey && !e.metaKey && !e.altKey && !isTextField(document.activeElement)) {
        e.preventDefault();
        openPalette();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, openPalette]);

  return (
    <PaletteContext value={openPalette}>
      {children}
      {open && <CommandPalette items={items} onClose={close} onPick={pick} />}
    </PaletteContext>
  );
}
