"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export function CommandString({
  command,
  className,
}: {
  command: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — do nothing
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy command"
      className={cn(
        "group inline-flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-1.5 font-mono text-sm text-ink transition-colors hover:border-gold/40",
        className
      )}
    >
      {command}
      {copied ? (
        <Check size={14} className="text-felt" />
      ) : (
        <Copy size={14} className="text-muted group-hover:text-gold" />
      )}
    </button>
  );
}
