"use client";

import type { ReactNode } from "react";
import { Copy } from "lucide-react";
import { copyCommand } from "@/components/landing/kit";
import { cn } from "@/lib/utils";

/** Copies a command and confirms with a toast. Labelled "Copy" unless given children. */
export function CopyButton({ text, className, children = "Copy" }: { text: string; className?: string; children?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => copyCommand(text)}
      aria-label={`Copy ${text}`}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-line-2 px-4 font-mono text-[13px] font-bold text-ink transition-colors hover:border-gold hover:text-gold",
        className,
      )}
    >
      <Copy size={14} aria-hidden />
      {children}
    </button>
  );
}
