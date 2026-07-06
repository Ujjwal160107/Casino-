import { INVITE_URL } from "@/lib/links";

export function FinalCTA() {
  return (
    <section className="border-t border-line bg-panel/40">
      <div className="mx-auto max-w-6xl px-6 py-24 text-center">
        <h2 className="font-display text-4xl font-extrabold tracking-tight text-ink md:text-5xl">
          Stop scrolling. Start grinding.
        </h2>
        <p className="mx-auto mt-4 max-w-md text-lg text-muted">
          The table's open and the seat is free. What happens after that is on
          you.
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
