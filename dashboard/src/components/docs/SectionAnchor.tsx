"use client";

import { toast } from "sonner";

/** The "#" beside a section heading: jumps to the section and copies its link. */
export function SectionAnchor({ id, heading }: { id: string; heading: string }) {
  return (
    <a
      href={`#${id}`}
      aria-label={`Copy link to ${heading}`}
      onClick={async () => {
        const url = `${location.origin}${location.pathname}#${id}`;
        try {
          await navigator.clipboard.writeText(url);
          toast.success("Link copied");
        } catch {
          // clipboard blocked: the hash in the address bar is the link
        }
      }}
      className="inline-flex min-h-11 min-w-11 items-center justify-center font-mono text-2xl text-muted opacity-0 transition-opacity hover:text-gold focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-60"
    >
      #
    </a>
  );
}
