import { INVITE_URL } from "@/lib/links";

export function FinalCTA() {
  return (
    <section className="border-t border-line bg-panel/40">
      <div className="mx-auto max-w-7xl px-6 py-16 text-center">
        <h2 className="font-display text-4xl font-extrabold tracking-tight text-ink md:text-5xl">
          Stop scrolling. Start living.
        </h2>
        <p className="mx-auto mt-4 max-w-md text-lg text-muted">
          Your second life is one invite away. The dealer's already shuffling.
        </p>
        <a
          href={INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-block rounded-xl bg-gold px-8 py-4 text-lg font-bold text-bg transition-colors hover:bg-gold-deep"
        >
          Add Fortuna to Discord
        </a>
      </div>
    </section>
  );
}
