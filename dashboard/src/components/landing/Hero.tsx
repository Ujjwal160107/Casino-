import Image from "next/image";
import { FadeUp } from "@/components/ui/FadeUp";
import { INVITE_URL, SUPPORT_URL } from "@/lib/links";

export function Hero() {
  return (
    <section className="mx-auto grid min-h-[calc(100svh-4rem)] max-w-7xl items-center gap-12 px-6 py-16 lg:grid-cols-2">
      <div>
        <h1 className="font-display text-[2rem] font-extrabold leading-[1.08] tracking-tight text-ink sm:text-5xl">
          Study. Work. Marry.
          <br />
          <span className="text-gold">Go broke anyway.</span>
        </h1>
        <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted">
          Fortuna is a life simulator inside Discord. Earn degrees, climb
          careers, build credit, marry rich, hunt tigers, ride the stock
          market — and blow it all at the casino if you must. One life, every
          server.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href={INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl bg-gold px-7 py-3.5 text-center text-base font-bold text-bg transition-colors hover:bg-gold-deep"
          >
            Add to Discord
          </a>
          <a
            href={SUPPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-line bg-panel px-7 py-3.5 text-center text-base font-bold text-ink transition-colors hover:border-gold/40"
          >
            Play in our server
          </a>
        </div>
        <p className="mt-6 font-mono text-sm text-muted">
          A full economy, casino, and career sim — all in one bot.
        </p>
      </div>

      <FadeUp>
        <figure>
          <Image
            src="/fortuna_world.jpg"
            alt="The world of Fortuna — casino, stock exchange, social hub, and police station in one pixel-art city"
            width={1024}
            height={572}
            priority
            className="h-auto w-full rounded-2xl border border-line"
          />
          <figcaption className="mt-3 text-center text-sm text-muted">
            The world of Fortuna — every district is a module.
          </figcaption>
        </figure>
      </FadeUp>
    </section>
  );
}
