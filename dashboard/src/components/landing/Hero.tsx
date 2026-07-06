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
        <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-5xl md:text-6xl">
          Study. Work.
          <br />
          Marry.
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
          9 systems · 65 commands · 8 degrees · 20+ jobs · 4 credit cards · 6
          casino games
        </p>
      </div>

      <FadeUp>
        <DiscordMockup>
          <MockMessage author="riko">
            <p className="font-mono">!profile</p>
          </MockMessage>
          <MockMessage author="Lady Fortuna" isBot>
            <MockEmbed title="riko — Overview">
              <p>
                Career: <strong>Senior Engineer</strong> (Tier 3)
              </p>
              <p>
                Education: <strong>BS Computer Science</strong>
              </p>
              <p>
                Spouse: <strong>mara</strong>
              </p>
              <p>
                Net worth: <strong>48,220,540 Fortunes</strong>
              </p>
              <p>
                Job stress: <strong>34/100</strong>
              </p>
              <p className="mt-1 text-[#949ba4]">One account. Every server.</p>
            </MockEmbed>
            <MockButtons
              buttons={[
                { label: "Wealth", style: "primary" },
                { label: "Career", style: "secondary" },
                { label: "Relationship", style: "secondary" },
              ]}
            />
          </MockMessage>
        </DiscordMockup>
      </FadeUp>
    </section>
  );
}
