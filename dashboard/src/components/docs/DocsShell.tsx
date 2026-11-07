import type { ReactNode } from "react";
import { MODULE_DOCS } from "@/content/modules";
import { Container } from "@/components/landing/kit";
import { DocsSidebar } from "./DocsSidebar";
import { DocsToc, type TocItem } from "./DocsToc";
import { HashFocus } from "./HashFocus";
import { ModulePicker } from "./ModulePicker";
import { ReadingProgress } from "./ReadingProgress";
import { PaletteProvider } from "./palette/PaletteProvider";
import { SearchButton } from "./palette/SearchButton";
import { buildSearchIndex } from "./palette/search-index";

const PAGES = [
  ...MODULE_DOCS.map((m) => ({ href: `/docs/${m.slug}`, label: m.title })),
  { href: "/commands", label: "All commands" },
];

/**
 * The chrome around a docs page: reading progress, the search palette, the
 * sidebar (from 760px), the "On this page" column (from 1000px) and, on
 * phones, a top bar with search and a page picker.
 * `current` is the open module's slug, or "commands".
 */
export function DocsShell({
  current,
  toc,
  tocTitle,
  children,
}: {
  current: string;
  toc: TocItem[];
  tocTitle?: string;
  children: ReactNode;
}) {
  const currentHref = current === "commands" ? "/commands" : `/docs/${current}`;
  return (
    <PaletteProvider items={buildSearchIndex()}>
      <ReadingProgress />
      <HashFocus />
      <div className="sticky top-[var(--docs-nav-h,64px)] z-30 flex gap-2 border-b-2 border-line bg-bg px-4 py-3 min-[760px]:hidden">
        <SearchButton variant="compact" />
        <ModulePicker options={PAGES} current={currentHref} />
      </div>
      <Container className="grid gap-8 pb-24 pt-8 min-[760px]:grid-cols-[230px_minmax(0,1fr)] min-[760px]:pt-12 min-[1000px]:grid-cols-[250px_minmax(0,1fr)_220px]">
        <div className="hidden min-[760px]:block">
          <DocsSidebar current={current} />
        </div>
        <div className="min-w-0">{children}</div>
        <div className="hidden min-[1000px]:block">
          <DocsToc items={toc} title={tocTitle} />
        </div>
      </Container>
    </PaletteProvider>
  );
}
