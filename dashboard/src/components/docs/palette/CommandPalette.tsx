"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SearchItem } from "./search-index";
import { highlightRuns, queryWords, searchItems } from "./search";

function Highlight({ text, words }: { text: string; words: string[] }) {
  return highlightRuns(text, words).map((run, i) =>
    run.hit ? (
      <mark key={i} className="rounded-sm bg-gold/30 text-ink">
        {run.text}
      </mark>
    ) : (
      <span key={i}>{run.text}</span>
    ),
  );
}

const Kbd = ({ children }: { children: string }) => (
  <kbd className="rounded border border-line-2 bg-panel-2 px-1.5 py-px font-mono text-[11px] font-bold text-ink-2">{children}</kbd>
);

/**
 * The search dialog: a combobox over commands and doc sections. Mounted only
 * while open, so every open starts from an empty query.
 */
export function CommandPalette({
  items,
  onClose,
  onPick,
}: {
  items: SearchItem[];
  onClose: () => void;
  onPick: (item: SearchItem) => void;
}) {
  const uid = useId();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const groups = searchItems(items, query);
  const flat = groups.flatMap((g) => g.items);
  const words = queryWords(query);
  const active = Math.min(selected, flat.length - 1);
  const optionId = (i: number) => `${uid}-opt-${i}`;
  const activeId = active >= 0 ? optionId(active) : undefined;
  const starts = groups.map((_, gi) => groups.slice(0, gi).reduce((n, g) => n + g.items.length, 0));

  useEffect(() => {
    inputRef.current?.focus();
    // lock page scroll; pad for the vanished scrollbar so nothing shifts
    const body = document.body.style;
    const { overflow, paddingRight } = body;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.overflow = "hidden";
    if (scrollbar > 0) body.paddingRight = `${scrollbar}px`;
    return () => {
      body.overflow = overflow;
      body.paddingRight = paddingRight;
    };
  }, []);

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  function onDialogKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Tab") {
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>("input, button");
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function onInputKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected(Math.min(flat.length - 1, active + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected(Math.max(0, active - 1));
    } else if (e.key === "Enter" && flat[active]) {
      e.preventDefault();
      onPick(flat[active]);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-bg/80 px-4 pt-[max(12vh,16px)] pb-4 transition-opacity duration-150 starting:opacity-0"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search docs and commands"
        onKeyDown={onDialogKey}
        className="w-full max-w-[640px] overflow-hidden rounded-2xl border-[3px] border-ink bg-panel shadow-[8px_8px_0_var(--color-ink)] transition-[opacity,translate] duration-200 ease-[var(--ease-out-expo)] starting:-translate-y-2 starting:opacity-0"
      >
        <div className="flex items-center gap-2 border-b-2 border-line p-2">
          {/* the field's focus shows as a ring on this wrapper, not the input's own outline */}
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-full px-3 focus-within:ring-2 focus-within:ring-gold">
            <Search size={18} aria-hidden className="shrink-0 text-muted" />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={`${uid}-list`}
              aria-autocomplete="list"
              aria-activedescendant={activeId}
              aria-label="Search docs and commands"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(0);
              }}
              onKeyDown={onInputKey}
              placeholder="Search commands and docs… try heist, vote, payday"
              className="min-h-12 min-w-0 flex-1 bg-transparent text-base text-ink outline-none! placeholder:text-muted"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted hover:text-ink"
          >
            <Kbd>Esc</Kbd>
          </button>
        </div>

        <div id={`${uid}-list`} role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-2 empty:hidden">
          {groups.map((group, gi) => {
            const start = starts[gi];
            const headId = `${uid}-${group.title}`;
            return (
              <div key={group.title} role="group" aria-labelledby={headId}>
                <div id={headId} className="px-2.5 pb-1 pt-2.5 font-mono text-[11px] font-bold uppercase tracking-[.14em] text-muted">
                  {group.title}
                </div>
                {group.items.map((item, j) => {
                  const i = start + j;
                  const on = i === active;
                  return (
                    <div
                      key={item.href + item.label}
                      id={optionId(i)}
                      role="option"
                      aria-selected={on}
                      onClick={() => onPick(item)}
                      onMouseMove={() => {
                        if (!on) setSelected(i);
                      }}
                      className={cn(
                        "grid min-h-12 cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-lg px-2.5 py-2 text-sm",
                        on && "bg-panel-2 shadow-[inset_3px_0_0_var(--color-gold)]",
                      )}
                    >
                      {item.kind === "command" ? (
                        <>
                          <code className="font-mono font-bold text-gold">
                            <Highlight text={item.label} words={words} />
                          </code>
                          <span className="truncate text-muted">
                            <Highlight text={item.context} words={words} />
                          </span>
                        </>
                      ) : (
                        <>
                          <code aria-hidden className="w-4 font-mono font-bold text-gold">
                            #
                          </code>
                          <span className="min-w-0">
                            <span className="block truncate text-ink-2">
                              <Highlight text={item.label} words={words} />
                            </span>
                            <span className="block truncate font-mono text-[11px] font-semibold uppercase tracking-[.08em] text-muted">
                              {item.context}
                            </span>
                          </span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {flat.length === 0 && (
          <p className="px-6 py-7 text-center text-muted">
            No match for “{query.trim()}”. Try a command like <code className="font-mono font-bold text-gold">!work</code>.
          </p>
        )}
        <p aria-live="polite" className="sr-only">
          {words.length ? `${flat.length} result${flat.length === 1 ? "" : "s"}` : ""}
        </p>

        <div className="hidden gap-4 border-t-2 border-line px-4 py-2.5 font-mono text-xs font-semibold text-muted sm:flex">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> move
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Enter</Kbd> open
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Esc</Kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
