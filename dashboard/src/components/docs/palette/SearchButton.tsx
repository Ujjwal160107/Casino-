"use client";

import { useSyncExternalStore } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePalette } from "./PaletteProvider";

const noSubscribe = () => () => {};
const isMac = () => /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

/** "⌘K" on Apple devices, "Ctrl K" elsewhere (and on the server). */
function useShortcutLabel() {
  return useSyncExternalStore(noSubscribe, () => (isMac() ? "⌘K" : "Ctrl K"), () => "Ctrl K");
}

const LABELS = { side: "Search docs", field: "Search docs and commands", compact: "Search" };

const VARIANTS = {
  /** sidebar: full-width pill */
  side: "min-h-11 w-full gap-2.5 px-4 text-sm",
  /** docs index: the big search field */
  field: "min-h-16 w-full gap-3.5 px-6 text-lg shadow-[6px_6px_0_var(--color-gold)] hover:shadow-[8px_8px_0_var(--color-gold)] hover:-translate-x-0.5 hover:-translate-y-0.5",
  /** phone top bar */
  compact: "min-h-11 shrink-0 gap-2 px-4 text-sm",
};

/** A button that looks like a search field and opens the docs palette. */
export function SearchButton({ variant = "side", className }: { variant?: keyof typeof VARIANTS; className?: string }) {
  const openPalette = usePalette();
  const shortcut = useShortcutLabel();
  return (
    <button
      type="button"
      onClick={(e) => openPalette(e.currentTarget)}
      aria-label="Search docs and commands"
      aria-haspopup="dialog"
      aria-keyshortcuts="Control+K Meta+K /"
      className={cn(
        "flex min-w-0 items-center rounded-full border-[3px] border-ink bg-panel text-left text-muted transition-[border-color,box-shadow,translate] duration-150 hover:border-gold hover:text-ink",
        VARIANTS[variant],
        className,
      )}
    >
      <Search size={variant === "field" ? 22 : 17} aria-hidden className="shrink-0" />
      <span className="min-w-0 truncate">{LABELS[variant]}</span>
      {variant !== "compact" && (
        <kbd className="ml-auto hidden shrink-0 rounded-md border border-line-2 bg-panel-2 px-1.5 py-0.5 font-mono text-[11px] font-bold text-ink-2 sm:inline">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}
