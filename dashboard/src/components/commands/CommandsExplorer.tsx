"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import type { Command, ModuleId } from "@/content/types";
import { MODULE_LABELS } from "@/content/commands";
import { CommandCard, SyntaxLegend } from "@/components/docs/CommandCard";
import { DocSectionFrame } from "@/components/docs/DocSection";
import { commandGroupId } from "@/components/docs/anchors";
import { cn } from "@/lib/utils";

const MODULES = Object.keys(MODULE_LABELS) as ModuleId[];
const FILTERS: ("all" | ModuleId)[] = ["all", ...MODULES];

function matches(c: Command, words: string[]) {
  const hay = [c.name, ...c.aliases, c.short].join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** The full command list on /commands: a text filter, module chips, and the cards grouped by module. */
export function CommandsExplorer({ commands }: { commands: Command[] }) {
  const [query, setQuery] = useState("");
  const [module, setModule] = useState<"all" | ModuleId>("all");

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = commands.filter((c) => (module === "all" || c.module === module) && matches(c, words));
  const groups = MODULES.map((m) => ({ module: m, list: filtered.filter((c) => c.module === m) })).filter((g) => g.list.length);

  return (
    <div>
      <div className="mt-10 grid gap-4 rounded-2xl border-[3px] border-ink bg-panel p-6">
        <label className="flex min-h-12 items-center gap-3 rounded-full border-2 border-line-2 bg-bg px-4 focus-within:border-gold">
          <Search size={17} aria-hidden className="shrink-0 text-muted" />
          <span className="sr-only">Filter commands</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name, alias or description"
            className="min-h-11 min-w-0 flex-1 bg-transparent text-ink placeholder:text-muted focus:outline-none"
          />
        </label>
        <div role="group" aria-label="Module" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setModule(f)}
              aria-pressed={module === f}
              className={cn(
                "flex min-h-11 items-center rounded-full border-2 px-4 text-sm font-bold uppercase tracking-[.05em] transition-colors",
                module === f ? "border-gold bg-gold text-bg" : "border-line-2 text-ink-2 hover:border-ink hover:text-ink",
              )}
            >
              {f === "all" ? "All" : MODULE_LABELS[f]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SyntaxLegend />
          <p aria-live="polite" className="font-mono text-sm text-muted">
            {filtered.length} command{filtered.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="mt-12 rounded-2xl border-2 border-line-2 p-10 text-center text-muted">
          No command matches “{query.trim()}”. Try <code className="font-mono font-bold text-gold">work</code> or clear the
          filter.
        </p>
      ) : (
        groups.map((g) => (
          <DocSectionFrame key={g.module} id={commandGroupId(g.module)} heading={MODULE_LABELS[g.module]}>
            <div className="mt-6 grid gap-4">
              {g.list.map((c) => (
                <CommandCard key={c.id} command={c} />
              ))}
            </div>
          </DocSectionFrame>
        ))
      )}
    </div>
  );
}
