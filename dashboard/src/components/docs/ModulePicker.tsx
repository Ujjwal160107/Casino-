"use client";

import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

export interface PickerOption {
  href: string;
  label: string;
}

/** Phone-sized docs navigation: a native select that opens the chosen page. */
export function ModulePicker({ options, current }: { options: PickerOption[]; current: string }) {
  const router = useRouter();
  return (
    <label className="relative flex min-w-0 flex-1">
      <span className="sr-only">Go to a docs page</span>
      <select
        value={current}
        onChange={(e) => router.push(e.target.value)}
        className="min-h-11 w-full min-w-0 appearance-none truncate rounded-full border-[3px] border-ink bg-panel py-0 pl-4 pr-10 text-sm font-semibold text-ink"
      >
        {options.map((o) => (
          <option key={o.href} value={o.href}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={16} aria-hidden className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted" />
    </label>
  );
}
