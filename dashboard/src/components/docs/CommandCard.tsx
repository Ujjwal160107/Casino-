import type { Command } from "@/content/types";
import { cmdAnchor } from "./anchors";
import { CopyButton } from "./CopyButton";
import { richText } from "./rich-text";

const Label = ({ children }: { children: string }) => (
  <dt className="font-mono text-[11px] font-bold uppercase tracking-[.12em] text-muted">{children}</dt>
);

/**
 * One command, the same everywhere it is listed (module pages and /commands).
 * Its id is the #cmd-… target the search palette jumps to.
 */
export function CommandCard({ command: c }: { command: Command }) {
  return (
    <article
      id={cmdAnchor(c.id)}
      tabIndex={-1}
      className="grid scroll-mt-[calc(var(--docs-nav-h,64px)+96px)] gap-3 rounded-2xl border-2 border-line-2 bg-panel p-6 transition-colors focus:border-gold"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="font-mono text-base font-bold text-gold">{c.name}</h3>
        {c.aliases.length > 0 && (
          <span className="font-mono text-xs text-muted">also {c.aliases.map((a) => `!${a}`).join(", ")}</span>
        )}
        <CopyButton text={c.usage} className="ml-auto" />
      </div>

      <p className="max-w-[70ch] text-[15px] leading-relaxed text-ink-2">
        {richText(c.short)}
      </p>

      <dl className="grid grid-cols-1 gap-x-5 gap-y-1.5 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
        <Label>Usage</Label>
        <dd className="break-words font-mono text-ink">{c.usage}</dd>
        {c.cooldown && (
          <>
            <Label>Cooldown</Label>
            <dd className="text-ink-2">{c.cooldown}</dd>
          </>
        )}
        {c.args?.map((a) => (
          <div key={a.name} className="contents">
            <dt className="font-mono text-gold">{a.name}</dt>
            <dd className="text-ink-2">{a.desc}</dd>
          </div>
        ))}
        {c.keyNumbers?.map((k) => (
          <div key={k.label} className="contents">
            <dt className="text-muted">{k.label}</dt>
            <dd className="font-semibold text-ink tabular-nums">{k.value}</dd>
          </div>
        ))}
      </dl>

      {c.jailBlocked && (
        <p className="w-fit rounded-full border border-line-2 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[.1em] text-muted">
          Blocked while jailed
        </p>
      )}
    </article>
  );
}

/** How to read a usage line. Shown once above a list of command cards. */
export function SyntaxLegend() {
  return (
    <p className="text-sm text-muted">
      <code className="font-mono text-ink">&lt;required&gt;</code> must be filled in ·{" "}
      <code className="font-mono text-ink">[optional]</code> can be left out
    </p>
  );
}
