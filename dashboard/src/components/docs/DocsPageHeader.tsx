import type { ReactNode } from "react";
import Link from "next/link";

/** Breadcrumb, giant title and tagline at the top of a docs page. */
export function DocsPageHeader({ title, tagline }: { title: string; tagline: ReactNode }) {
  return (
    <header>
      <nav aria-label="Breadcrumb" className="mb-4 font-mono text-[13px] font-semibold text-muted">
        <ol className="flex flex-wrap gap-2">
          <li>
            <Link href="/docs" className="hover:text-gold">
              Docs
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li aria-current="page" className="text-ink-2">
            {title}
          </li>
        </ol>
      </nav>
      <h1 className="font-display text-[clamp(56px,7vw,104px)] font-black uppercase leading-[.85] [overflow-wrap:anywhere]">
        {title}
      </h1>
      <p className="mt-5 max-w-[64ch] text-lg text-muted">{tagline}</p>
    </header>
  );
}
