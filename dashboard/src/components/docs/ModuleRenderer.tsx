import type { Command, ModuleDoc } from "@/content/types";
import { getCommand } from "@/content/commands";
import { ScreenshotSlot } from "@/components/ui/ScreenshotSlot";
import { COMMANDS_SECTION_ID, PRO_TIPS_SECTION_ID, sectionId } from "./anchors";
import { CommandCard, SyntaxLegend } from "./CommandCard";
import { CopyButton } from "./CopyButton";
import { DocSection, DocSectionFrame } from "./DocSection";
import { DocsPageHeader } from "./DocsPageHeader";
import type { TocItem } from "./DocsToc";
import { richText } from "./rich-text";

function moduleCommands(doc: ModuleDoc): Command[] {
  return doc.commandIds.map(getCommand).filter((c): c is Command => Boolean(c));
}

/** The "On this page" entries of a module page, in reading order. */
export function moduleToc(doc: ModuleDoc): TocItem[] {
  return [
    ...doc.sections.map((s) => ({ id: sectionId(s.heading), label: s.heading })),
    ...(doc.proTips.length ? [{ id: PRO_TIPS_SECTION_ID, label: "Pro tips" }] : []),
    ...(moduleCommands(doc).length ? [{ id: COMMANDS_SECTION_ID, label: "Commands" }] : []),
  ];
}

/** The page's plain-language summary: the first prose after the title and art, and what answer engines quote. */
function BeginnerBlock({ intro }: { intro: ModuleDoc["forBeginners"] }) {
  return (
    <section aria-label="New here?" className="mt-10 grid gap-4 rounded-2xl border-[3px] border-ink bg-panel p-6 sm:p-8">
      <p className="font-mono text-xs font-bold uppercase tracking-[.14em] text-gold">New here?</p>
      <p className="max-w-[70ch] leading-[1.7] text-ink">
        {richText(intro.what)}
      </p>
      <div className="flex flex-wrap gap-2">
        {intro.firstCommands.map((c) => (
          <CopyButton key={c} text={c} className="text-gold">
            {c}
          </CopyButton>
        ))}
      </div>
      <p className="max-w-[70ch] text-sm leading-relaxed text-muted">
        <b className="text-ink">Tip:</b> {richText(intro.tip)}
      </p>
    </section>
  );
}

/** A full module page body: header, art, the beginner block, every section, tips and commands. */
export function ModuleRenderer({ doc }: { doc: ModuleDoc }) {
  const commands = moduleCommands(doc);
  return (
    <article className="min-w-0">
      <DocsPageHeader title={doc.title} tagline={doc.tagline} />

      {doc.screenshot && (
        <ScreenshotSlot
          className="mt-10 [&_img]:[image-rendering:pixelated]"
          src={doc.screenshot.src}
          alt={doc.screenshot.alt}
          caption={doc.screenshot.caption}
          aspect={doc.screenshot.aspect}
          maxWidth={doc.screenshot.maxWidth}
          preload
        />
      )}

      <BeginnerBlock intro={doc.forBeginners} />

      {doc.sections.map((s) => (
        <DocSection key={s.heading} section={s} />
      ))}

      {doc.proTips.length > 0 && (
        <DocSectionFrame id={PRO_TIPS_SECTION_ID} heading="Pro tips">
          <ul className="mt-5 grid max-w-[70ch] gap-3">
            {doc.proTips.map((t, i) => (
              <li key={`${i}-${t}`} className="flex gap-3 leading-[1.7] text-ink-2">
                <span aria-hidden className="mt-[.6em] size-2 shrink-0 bg-gold" />
                <span>
                  {richText(t)}
                </span>
              </li>
            ))}
          </ul>
        </DocSectionFrame>
      )}

      {commands.length > 0 && (
        <DocSectionFrame id={COMMANDS_SECTION_ID} heading="Commands">
          <div className="mt-4">
            <SyntaxLegend />
          </div>
          <div className="mt-6 grid gap-4">
            {commands.map((c) => (
              <CommandCard key={c.id} command={c} />
            ))}
          </div>
        </DocSectionFrame>
      )}
    </article>
  );
}
