"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { INVITE_URL } from "@/lib/links";
import { cn } from "@/lib/utils";
import { btn } from "./landing/kit";

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

/** The site's main links, shared by the desktop navbar and this sidebar. */
export const NAV_LINKS: { href: string; label: string; isNew?: boolean }[] = [
  { href: "/commands", label: "Commands" },
  { href: "/docs/crime-families", label: "Crime Families", isNew: true },
  { href: "/docs", label: "Docs" },
  { href: "/changelog", label: "Changelog" },
];

/** Small gold NEW tag for a link. */
export function NewPill() {
  return <span className="rounded-full bg-gold px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none tracking-[.08em] text-bg">NEW</span>;
}

export function MobileSidebar({ isOpen, onClose }: MobileSidebarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Move focus into the dialog, remembering where it came from.
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeButtonRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      // Trap Tab / Shift+Tab inside the dialog.
      const container = containerRef.current;
      if (!container) return;
      const focusables = container.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled])"
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const inside = active instanceof HTMLElement && container.contains(active);

      if (e.shiftKey) {
        if (!inside || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      // Restore focus to the element that opened the dialog.
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Mobile navigation"
      className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain bg-bg pt-[env(safe-area-inset-top,0px)] lg:hidden"
    >
      <div className="flex min-h-[72px] items-center justify-between border-b-[3px] border-ink px-4 sm:px-6">
        <span className="font-display text-[30px] font-black uppercase leading-none text-ink">Fortuna</span>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-ink text-ink transition-colors hover:bg-ink hover:text-bg"
          aria-label="Close menu"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="flex flex-col px-4 py-6 sm:px-6">
        {NAV_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            onClick={onClose}
            className="flex min-h-14 items-center gap-3 border-b border-line font-display text-[34px] font-black uppercase leading-none text-ink transition-colors hover:text-gold"
          >
            {l.label}
            {l.isNew && <NewPill />}
          </Link>
        ))}
        <a
          href={INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(btn.base, btn.main, btn.lg, "mt-8")}
        >
          Add to Discord
        </a>
      </div>
    </div>
  );
}
