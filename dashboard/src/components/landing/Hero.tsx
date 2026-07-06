import {
  DiscordMockup,
  MockButtons,
  MockEmbed,
  MockMessage,
} from "@/components/ui/DiscordMockup";
import { FadeUp } from "@/components/ui/FadeUp";
import { INVITE_URL, SUPPORT_URL } from "@/lib/links";

export function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-14 px-6 pb-24 pt-20 lg:grid-cols-2">
      <div>
        <h1 className="font-display text-5xl font-extrabold leading-[1.02] tracking-tight text-ink md:text-7xl">
          Get rich.
          <br />
          <span className="text-gold">Go broke.</span>
          <br />
          Repeat.
        </h1>
        <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted">
          Fortuna is an economy and casino inside Discord — one wallet across
          every server. Work jobs, earn degrees, build credit, and bet it all
          on black.
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
          6 casino games · 8 degrees · 4 credit cards · 1 wallet everywhere
        </p>
      </div>

      <FadeUp>
        <DiscordMockup>
          <MockMessage author="riko">
            <p className="font-mono">!blackjack 250000</p>
          </MockMessage>
          <MockMessage author="Lady Fortuna" isBot>
            <MockEmbed title="Blackjack — 250,000 on the line">
              <p>
                Dealer shows <strong>K♠</strong>
              </p>
              <p>
                Your hand: <strong>A♥ 9♣</strong> — 20
              </p>
              <p className="mt-1 text-[#949ba4]">
                Blackjack pays 2.5x. Dealer hits to 17.
              </p>
            </MockEmbed>
            <MockButtons
              buttons={[
                { label: "Hit", style: "primary" },
                { label: "Stand", style: "success" },
              ]}
            />
          </MockMessage>
        </DiscordMockup>
      </FadeUp>
    </section>
  );
}
