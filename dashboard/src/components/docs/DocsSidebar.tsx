"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ModuleDoc } from "@/content/types";
import { cn } from "@/lib/utils";

export function DocsSidebar({ modules }: { modules: ModuleDoc[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Docs navigation" className="space-y-1">
      {modules.map((m) => {
        const href = `/docs/${m.slug}`;
        const active = pathname === href;
        return (
          <Link
            key={m.slug}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-gold/15 text-gold"
                : "text-muted hover:bg-panel hover:text-ink"
            )}
          >
            {m.title}
          </Link>
        );
      })}
      <Link
        href="/commands"
        className="mt-3 block rounded-lg border border-line px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-ink"
      >
        All commands →
      </Link>
    </nav>
  );
}
