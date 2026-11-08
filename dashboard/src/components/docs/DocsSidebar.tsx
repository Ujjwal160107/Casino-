import type { ReactNode } from "react";
import Link from "next/link";
import { MODULE_DOCS } from "@/content/modules";
import { COMMANDS } from "@/content/commands";
import { cn } from "@/lib/utils";
import { SearchButton } from "./palette/SearchButton";

/** Slug of the module that wears the NEW pill. */
export const NEW_MODULE = "crime-families";

/** The gold NEW marker for a module. */
function NewPill() {
  return (
    <span className="rounded-full bg-gold px-2 py-0.5 font-mono text-[10px] font-bold tracking-[.1em] text-bg">NEW</span>
  );
}

function SideLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center justify-between gap-2.5 rounded-lg px-3 text-[14.5px] transition-colors",
        active ? "bg-ink font-semibold text-bg" : "text-muted hover:bg-panel hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}

const Group = ({ children }: { children: string }) => (
  <p className="mb-1 ml-3 mt-4 font-mono text-[11px] font-bold uppercase tracking-[.16em] text-muted">{children}</p>
);

/**
 * Docs navigation: search, Start here, Modules, Reference. Sticky with its own
 * scroll. `current` is the open module's slug, or "commands" for the full list.
 */
export function DocsSidebar({ current }: { current: string }) {
  const [starter, ...modules] = MODULE_DOCS;
  return (
    <div className="sticky top-[calc(var(--docs-nav-h,64px)+32px)] grid max-h-[calc(100vh-var(--docs-nav-h,64px)-64px)] grid-cols-[minmax(0,1fr)] gap-2 overflow-y-auto overflow-x-hidden pb-4 pr-1">
      <SearchButton />
      <nav aria-label="Docs" className="grid gap-0.5">
        <Group>Start here</Group>
        <SideLink href={`/docs/${starter.slug}`} active={current === starter.slug}>
          {starter.title}
        </SideLink>
        <Group>Modules</Group>
        {modules.map((m) => (
          <SideLink key={m.slug} href={`/docs/${m.slug}`} active={current === m.slug}>
            {m.title}
            {m.slug === NEW_MODULE && <NewPill />}
          </SideLink>
        ))}
        <Group>Reference</Group>
        <SideLink href="/commands" active={current === "commands"}>
          All commands ({COMMANDS.length})
        </SideLink>
      </nav>
    </div>
  );
}
