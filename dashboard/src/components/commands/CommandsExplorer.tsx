"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Command, ModuleId } from "@/content/types";
import { MODULE_LABELS } from "@/content/commands";
import { Tag } from "@/components/ui/Tag";
import { CommandString } from "@/components/ui/CommandString";
import { cn } from "@/lib/utils";

const MODULE_COLORS: Record<ModuleId, "gold" | "felt" | "chip" | "blue"> = {
  general: "blue",
  economy: "felt",
  casino: "gold",
  life: "chip",
};

const FILTERS: ("all" | ModuleId)[] = [
  "all",
  "general",
  "economy",
  "casino",
  "life",
];

export function CommandsExplorer({ commands }: { commands: Command[] }) {
  const [query, setQuery] = useState("");
  const [module, setModule] = useState<"all" | ModuleId>("all");
  const [open, setOpen] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return commands.filter((c) => {
      if (module !== "all" && c.module !== module) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.short.toLowerCase().includes(q) ||
        c.aliases.some((a) => a.toLowerCase().includes(q))
      );
    });
  }, [commands, query, module]);

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search commands, aliases, anything…"
          aria-label="Search commands"
          className="w-full max-w-md rounded-xl border border-line bg-panel px-4 py-2.5 text-ink placeholder:text-muted focus:border-gold/50 focus:outline-none"
        />
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setModule(f)}
              className={cn(
                "flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors",
                module === f
                  ? "border-gold bg-gold text-bg"
                  : "border-line bg-panel text-muted hover:text-ink"
              )}
            >
              {f === "all" ? "All" : MODULE_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-4 font-mono text-sm text-muted">
        {filtered.length} command{filtered.length === 1 ? "" : "s"}
      </p>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-line bg-panel p-10 text-center text-muted">
          The deck&apos;s empty. Try another word.
        </p>
      ) : (
        <div className="divide-y divide-line rounded-2xl border border-line bg-panel">
          {filtered.map((c) => {
            const isOpen = open === c.id;
            return (
              <div key={c.id} id={c.id} className="scroll-mt-24">
                <button
                  onClick={() => setOpen(isOpen ? null : c.id)}
                  aria-expanded={isOpen}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4 text-left transition-colors hover:bg-panel-2"
                >
                  <span className="font-mono text-base font-bold text-ink">
                    {c.name}
                  </span>
                  {c.aliases.slice(0, 3).map((a) => (
                    <Tag key={a}>{a}</Tag>
                  ))}
                  <span className="hidden flex-1 truncate text-sm text-muted sm:block">
                    {c.short}
                  </span>
                  <Tag color={MODULE_COLORS[c.module]}>
                    {MODULE_LABELS[c.module]}
                  </Tag>
                  {c.interactive && <Tag color="blue">buttons</Tag>}
                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className={cn(
                      "text-muted transition-transform",
                      isOpen && "rotate-180"
                    )}
                  />
                </button>
                {isOpen && (
                  <div className="space-y-4 border-t border-line bg-panel-2 px-5 py-5">
                    <p className="text-ink sm:hidden">{c.short}</p>
                    <div>
                      <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">
                        Usage
                      </p>
                      <CommandString command={c.usage} />
                    </div>
                    {c.args && c.args.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">
                          Arguments
                        </p>
                        <ul className="space-y-1">
                          {c.args.map((a) => (
                            <li key={a.name} className="text-sm">
                              <span className="font-mono text-gold">
                                {a.name}
                              </span>{" "}
                              <span className="text-muted">— {a.desc}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div>
                      <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">
                        Examples
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {c.examples.map((e) => (
                          <CommandString key={e} command={e} />
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                      {c.cooldown && (
                        <p>
                          <span className="text-muted">Cooldown:</span>{" "}
                          <span className="font-medium text-ink">
                            {c.cooldown}
                          </span>
                        </p>
                      )}
                      {c.jailBlocked && (
                        <p className="font-medium text-chip">
                          Blocked while jailed
                        </p>
                      )}
                      {c.aliases.length > 0 && (
                        <p>
                          <span className="text-muted">Aliases:</span>{" "}
                          <span className="font-mono text-ink">
                            {c.aliases.join(", ")}
                          </span>
                        </p>
                      )}
                    </div>
                    {c.keyNumbers && c.keyNumbers.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {c.keyNumbers.map((k) => (
                          <span
                            key={k.label}
                            className="rounded-lg border border-line bg-panel px-3 py-1.5 text-sm"
                          >
                            <span className="text-muted">{k.label}: </span>
                            <span className="font-mono font-medium text-gold">
                              {k.value}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
