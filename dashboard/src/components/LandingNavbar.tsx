"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { LogOut, Menu } from "lucide-react";
import { MobileSidebar } from "./MobileSidebar";
import { INVITE_URL } from "@/lib/links";

const LINKS = [
  { href: "/commands", label: "Commands" },
  { href: "/docs", label: "Docs" },
  { href: "/changelog", label: "Changelog" },
];

interface LandingNavbarProps {
  user?: { name?: string | null; image?: string | null };
  hideLogin?: boolean;
}

export function LandingNavbar({ user, hideLogin }: LandingNavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
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
          {user ? (
            <div className="relative hidden md:block">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-panel px-2 py-1.5 transition-colors hover:border-gold/40"
              >
                {user.image ? (
                  <Image
                    src={user.image}
                    width={24}
                    height={24}
                    alt=""
                    className="rounded-full"
                  />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-panel-2 text-xs font-bold text-muted">
                    {user.name?.charAt(0) ?? "?"}
                  </span>
                )}
                <span className="max-w-[10rem] truncate text-sm font-medium text-ink">
                  {user.name}
                </span>
              </button>
              {menuOpen && (
                <>
                  <div className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-xl border border-line bg-panel">
                    <button
                      onClick={() => signOut({ callbackUrl: "/" })}
                      className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left text-sm text-chip transition-colors hover:bg-panel-2"
                    >
                      <LogOut size={15} aria-hidden="true" />
                      Cash out (sign out)
                    </button>
                  </div>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMenuOpen(false)}
                  />
                </>
              )}
            </div>
          ) : (
            !hideLogin && (
              <button
                onClick={() => signIn("discord", { callbackUrl: "/" })}
                className="hidden min-h-11 cursor-pointer items-center rounded-lg border border-line px-4 text-sm font-medium text-muted transition-colors hover:border-gold/40 hover:text-ink md:flex"
              >
                Log in
              </button>
            )
          )}

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

      <MobileSidebar
        isOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        user={user}
      />
    </header>
  );
}
