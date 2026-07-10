"use client";

import { useEffect, useRef, useState } from "react";
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
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
        <Check size={14} aria-hidden="true" className="text-felt" />
      ) : (
        <Copy size={14} aria-hidden="true" className="text-muted group-hover:text-gold" />
      )}
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </button>
  );
}
