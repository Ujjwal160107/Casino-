"use client";

import Link from "next/link";
import { signIn, signOut } from "next-auth/react";
import { X } from "lucide-react";
import { INVITE_URL } from "@/lib/links";

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  user?: { name?: string | null; image?: string | null };
}

const LINKS = [
  { href: "/commands", label: "Commands" },
  { href: "/docs", label: "Docs" },
  { href: "/changelog", label: "Changelog" },
];

export function MobileSidebar({ isOpen, onClose, user }: MobileSidebarProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-bg md:hidden">
      <div className="flex h-16 items-center justify-between border-b border-line px-6">
        <span className="font-display text-lg font-bold text-ink">FORTUNA</span>
        <button
          onClick={onClose}
          className="p-2 text-muted"
          aria-label="Close menu"
        >
          <X size={22} />
        </button>
      </div>
      <div className="flex flex-col gap-1 p-6">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            onClick={onClose}
            className="rounded-lg px-3 py-3 text-lg font-medium text-ink hover:bg-panel"
          >
            {l.label}
          </Link>
        ))}
        <a
          href={INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 rounded-lg bg-gold px-4 py-3 text-center font-bold text-bg"
        >
          Add to Discord
        </a>
        {user ? (
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="mt-2 rounded-lg border border-line px-4 py-3 text-sm font-medium text-chip"
          >
            Sign out
          </button>
        ) : (
          <button
            onClick={() => signIn("discord", { callbackUrl: "/" })}
            className="mt-2 rounded-lg border border-line px-4 py-3 text-sm font-medium text-muted"
          >
            Log in with Discord
          </button>
        )}
      </div>
    </div>
  );
}
