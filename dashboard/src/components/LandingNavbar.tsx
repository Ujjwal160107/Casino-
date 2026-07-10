"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu } from "lucide-react";
import { MobileSidebar } from "./MobileSidebar";
import { INVITE_URL } from "@/lib/links";

const LINKS = [
  { href: "/commands", label: "Commands" },
  { href: "/docs", label: "Docs" },
  { href: "/changelog", label: "Changelog" },
];

// `user`/`hideLogin` are accepted so existing pages keep compiling; login is
// intentionally disabled for now, so they go unused.
interface LandingNavbarProps {
  user?: { name?: string | null; image?: string | null };
  hideLogin?: boolean;
}

export function LandingNavbar(_props: LandingNavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg">
      <nav className="mx-auto flex h-16 max-w-[90rem] items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <img
            src="/fortuna_icon.png"
            alt=""
            className="h-8 w-8 rounded-lg border border-line"
          />
          <span className="font-display text-lg font-bold tracking-wide text-ink">
            FORTUNA
          </span>
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-muted transition-colors hover:text-ink"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <a
            href={INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden min-h-11 items-center rounded-lg bg-gold px-4 text-sm font-bold text-bg transition-colors hover:bg-gold-deep md:flex"
          >
            Add to Discord
          </a>

          <button
            onClick={() => setMobileOpen(true)}
            className="flex h-11 w-11 cursor-pointer items-center justify-center text-muted transition-colors hover:text-ink md:hidden"
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={mobileOpen}
          >
            <Menu size={22} aria-hidden="true" />
          </button>
        </div>
      </nav>

      <MobileSidebar isOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
    </header>
  );
}
