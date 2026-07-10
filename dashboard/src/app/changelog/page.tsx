import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { LandingNavbar } from "@/components/LandingNavbar";
import { Footer } from "@/components/Footer";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import {
  Zap,
  Book,
  Layout,
  Globe,
  CreditCard,
  Swords,
  Dice5,
  Archive,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Changelog",
  description:
    "Track the evolution of Fortuna. We ship updates regularly to improve your experience.",
};

export default async function ChangelogPage() {
  const session = await getServerSession(authOptions);

  return (
    <main className="min-h-screen bg-bg">
      <LandingNavbar user={session?.user} />

      <div className="mx-auto max-w-3xl px-6 pb-24 pt-16">
        <p className="mb-2 font-mono text-sm font-medium uppercase tracking-widest text-gold">
          Latest Release
        </p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">
          Changelog
        </h1>
        <p className="mt-3 text-lg leading-relaxed text-muted">
          Track the evolution of Fortuna. We ship updates regularly to
          improve your experience.
        </p>

        <div className="mt-12 space-y-10">
          {/* v2.0 — Fortuna Global */}
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-sm text-gold">v2.0</span>
              <span className="font-mono text-sm text-muted">July 10, 2026</span>
              <Tag color="gold">GLOBAL RELEASE</Tag>
            </div>

            <Panel className="mt-4 p-6">
              <p className="leading-relaxed text-muted">
                Fortuna V2 is the biggest change since launch. The economy left
                the server and moved to <strong className="text-ink">you</strong>
                : one account, shared everywhere the bot runs. On top of that we
                added real banking and credit, two brand-new skill games, and
                rebuilt this entire website around what Fortuna actually is — a
                life simulator with a casino attached, not the other way round.
              </p>

              <div className="mt-8 space-y-8">
                {/* One account everywhere */}
                <div>
                  <div className="flex items-start gap-4">
                    <Globe className="mt-1 h-5 w-5 shrink-0 text-gold" />
                    <div>
                      <h3 className="font-display text-lg font-bold text-ink">
                        One account. Every server.
                      </h3>
                      <p className="mt-1 leading-relaxed text-muted">
                        The old per-server economy is gone. Your wallet, bank,
                        job, degrees, credit, chicken, and everything you own now
                        live on your Discord account and follow you into every
                        server Fortuna is in. Servers keep exactly one setting:
                        their command prefix.
                      </p>
                    </div>
                  </div>
                  <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <FeatureItem>
                      One global balance, inventory, and progression per player
                    </FeatureItem>
                    <FeatureItem>
                      Profile, career, and marriage travel between servers
                    </FeatureItem>
                    <FeatureItem>
                      Per-server config reduced to just the command prefix
                    </FeatureItem>
                    <FeatureItem>
                      Developer-only admin — no more per-guild economy managers
                    </FeatureItem>
                  </ul>
                </div>

                {/* Banking & credit */}
                <div className="border-t border-line pt-8">
                  <div className="flex items-start gap-4">
                    <CreditCard className="mt-1 h-5 w-5 shrink-0 text-gold" />
                    <div>
                      <h3 className="font-display text-lg font-bold text-ink">
                        Banking &amp; credit cards
                      </h3>
                      <p className="mt-1 leading-relaxed text-muted">
                        A full credit system sits on top of the bank. Apply for a
                        card, spend on credit, and settle a weekly statement — a
                        300–850 credit score remembers exactly how you behave.
                      </p>
                    </div>
                  </div>
                  <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <FeatureItem>
                      Four tiers —{" "}
                      <strong className="text-ink">
                        Starter, Gold, Platinum, Black
                      </strong>{" "}
                      (1.5M → 60M limits)
                    </FeatureItem>
                    <FeatureItem>
                      Weekly statements, minimum due, and a real credit score
                    </FeatureItem>
                    <FeatureItem>
                      Eligibility gated by both score and career tier
                    </FeatureItem>
                    <FeatureItem>
                      Miss payments and the house garnishes 25% of your income
                    </FeatureItem>
                    <FeatureItem>
                      Fixed &amp; recurring deposits at 10% / 8% APR
                    </FeatureItem>
                  </ul>
                </div>

                {/* New & deeper gameplay */}
                <div className="border-t border-line pt-8">
                  <div className="flex items-start gap-4">
                    <Swords className="mt-1 h-5 w-5 shrink-0 text-gold" />
                    <div>
                      <h3 className="font-display text-lg font-bold text-ink">
                        New systems &amp; deeper gameplay
                      </h3>
                      <p className="mt-1 leading-relaxed text-muted">
                        V2 adds two skill-based games and turns old one-command
                        grinds into systems with real depth.
                      </p>
                    </div>
                  </div>
                  <ul className="mt-4 space-y-2">
                    <FeatureItem>
                      <strong className="text-ink">Crime &amp; Heat</strong> — a
                      58-crime heist minigame. Gear up, beat the timer, split the
                      take, and stay ahead of the tax-and-heat scanner or eat a
                      raid.
                    </FeatureItem>
                    <FeatureItem>
                      <strong className="text-ink">
                        Chickens &amp; Cockfights
                      </strong>{" "}
                      — buy a bird, train Strength / Agility / Defense, arm it,
                      and fight other players for the whole pot.
                    </FeatureItem>
                    <FeatureItem>
                      <strong className="text-ink">Careers &amp; Education</strong>{" "}
                      — 8 degrees (150k → 10M) gating 20+ jobs across six sectors,
                      with a study minigame and a stress meter.
                    </FeatureItem>
                    <FeatureItem>
                      <strong className="text-ink">Hunting &amp; Animals</strong>{" "}
                      — rifles, rare catches, and a zoo that pays rent by rarity.
                    </FeatureItem>
                    <FeatureItem>
                      <strong className="text-ink">Investments</strong> — one
                      shared stock market that ticks every 30 minutes, plus
                      rentable real estate from a shack to a private island.
                    </FeatureItem>
                    <FeatureItem>
                      <strong className="text-ink">Life &amp; Social</strong> —
                      marriage with a joint vault, daily quests with streaks, and
                      a universal relax/stress system.
                    </FeatureItem>
                  </ul>
                </div>

                {/* Casino & fair play */}
                <div className="border-t border-line pt-8">
                  <div className="flex items-start gap-4">
                    <Dice5 className="mt-1 h-5 w-5 shrink-0 text-gold" />
                    <div>
                      <h3 className="font-display text-lg font-bold text-ink">
                        Casino &amp; fair play
                      </h3>
                      <p className="mt-1 leading-relaxed text-muted">
                        All six casino games were rebuilt for V2 under one firm
                        house rule: bets come from your wallet, and nowhere else.
                      </p>
                    </div>
                  </div>
                  <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <FeatureItem>
                      Blackjack, roulette, slots, coinflip, cockfight, Russian
                      roulette
                    </FeatureItem>
                    <FeatureItem>
                      Wallet-only betting — no bank or credit-card gambling
                    </FeatureItem>
                    <FeatureItem>
                      Published payout tables and shared per-game cooldowns
                    </FeatureItem>
                    <FeatureItem>
                      Double-settlement protection and button-ownership checks
                    </FeatureItem>
                  </ul>
                </div>

                {/* Retired legacy systems */}
                <div className="border-t border-line pt-8">
                  <div className="flex items-start gap-4">
                    <Archive className="mt-1 h-5 w-5 shrink-0 text-gold" />
                    <div>
                      <h3 className="font-display text-lg font-bold text-ink">
                        Retired legacy systems
                      </h3>
                      <p className="mt-1 leading-relaxed text-muted">
                        A pile of old per-server machinery was removed for good.
                        If you ran V1, these are gone.
                      </p>
                    </div>
                  </div>
                  <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <FeatureItem>
                      Per-guild economy config &amp; custom server currencies
                    </FeatureItem>
                    <FeatureItem>
                      Casino admins, casino bans, and channel restrictions
                    </FeatureItem>
                    <FeatureItem>
                      Role income, chat money, and casino drops
                    </FeatureItem>
                    <FeatureItem>
                      The setup wizard and separate job / university stores
                    </FeatureItem>
                  </ul>
                </div>

                {/* Rebuilt website & docs */}
                <div className="border-t border-line pt-8">
                  <div className="flex items-start gap-4">
                    <Layout className="mt-1 h-5 w-5 shrink-0 text-gold" />
                    <div>
                      <h3 className="font-display text-lg font-bold text-ink">
                        Rebuilt website &amp; docs
                      </h3>
                      <p className="mt-1 leading-relaxed text-muted">
                        This whole site is new — flat, no gimmicks, and
                        repositioned around the life sim instead of the casino.
                      </p>
                    </div>
                  </div>
                  <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <FeatureItem>
                      12 module guides with beginner walkthroughs and exact
                      numbers
                    </FeatureItem>
                    <FeatureItem>
                      A searchable command reference for every command
                    </FeatureItem>
                    <FeatureItem>
                      Privacy policy and terms rewritten for the global model
                    </FeatureItem>
                    <FeatureItem>Login paused while we rebuild on top of it</FeatureItem>
                  </ul>
                </div>
              </div>
            </Panel>
          </div>

          {/* v1.5 */}
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-sm text-gold">v1.5</span>
              <span className="font-mono text-sm text-muted">
                February 3, 2026
              </span>
              <Tag color="gold">MAJOR UPDATE</Tag>
            </div>

            <Panel className="mt-4 p-6">
              <div className="space-y-8">
                <div>
                  <div className="flex items-start gap-4">
                    <Zap className="mt-1 h-5 w-5 shrink-0 text-gold" />
                    <div>
                      <h3 className="font-display text-lg font-bold text-ink">
                        Total Dashboard Overhaul
                      </h3>
                      <p className="mt-1 leading-relaxed text-muted">
                        We&apos;ve completely redesigned the dashboard with a
                        modern, glassmorphic aesthetic. It&apos;s faster,
                        sleeker, and more intuitive than ever before.
                      </p>
                    </div>
                  </div>
                  <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <FeatureItem>New Glassmorphism UI Identity</FeatureItem>
                    <FeatureItem>Enhanced Mobile Responsiveness</FeatureItem>
                    <FeatureItem>Improved Navigation Sidebar</FeatureItem>
                    <FeatureItem>Smoother Animations</FeatureItem>
                  </ul>
                </div>

                <div className="border-t border-line pt-8">
                  <div className="flex items-start gap-4">
                    <Book className="mt-1 h-5 w-5 shrink-0 text-gold" />
                    <div>
                      <h3 className="font-display text-lg font-bold text-ink">
                        Documentation Revamp
                      </h3>
                      <p className="mt-1 leading-relaxed text-muted">
                        A brand new Documentation Hub with comprehensive
                        guides for players and detailed references for every
                        single command.
                      </p>
                    </div>
                  </div>
                  <ul className="mt-4 space-y-2">
                    <FeatureItem>
                      Added <strong className="text-ink">Player Guide</strong>{" "}
                      for getting started
                    </FeatureItem>
                    <FeatureItem>
                      Complete{" "}
                      <strong className="text-ink">Command Reference</strong>{" "}
                      list
                    </FeatureItem>
                    <FeatureItem>
                      Detailed{" "}
                      <strong className="text-ink">Dashboard Guide</strong>{" "}
                      for admins
                    </FeatureItem>
                    <FeatureItem>
                      New FAQ section for common questions
                    </FeatureItem>
                  </ul>
                </div>

                <div className="border-t border-line pt-8">
                  <div className="flex items-start gap-4">
                    <Layout className="mt-1 h-5 w-5 shrink-0 text-gold" />
                    <div>
                      <h3 className="font-display text-lg font-bold text-ink">
                        New Pages &amp; Polish
                      </h3>
                      <p className="mt-1 leading-relaxed text-muted">
                        We&apos;ve expanded the website with dedicated pages
                        for our team, legal information, and a global footer
                        for easier navigation.
                      </p>
                    </div>
                  </div>
                  <ul className="mt-4 space-y-2">
                    <FeatureItem>
                      New <strong className="text-ink">Team Page</strong> with
                      3D tilt effects
                    </FeatureItem>
                    <FeatureItem>
                      Formal{" "}
                      <strong className="text-ink">Terms of Service</strong> &
                      Privacy Policy
                    </FeatureItem>
                    <FeatureItem>
                      Consistent Global Footer across all public pages
                    </FeatureItem>
                    <FeatureItem>Refined landing page animations</FeatureItem>
                  </ul>
                </div>
              </div>
            </Panel>
          </div>

          {/* v1.0 */}
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-sm text-gold">v1.0</span>
              <span className="font-mono text-sm text-muted">
                January 1, 2026
              </span>
            </div>

            <Panel className="mt-4 p-6">
              <h3 className="font-display text-lg font-bold text-ink">
                Initial Launch
              </h3>
              <p className="mt-2 leading-relaxed text-muted">
                The first public release of Fortuna Bot. Included basic
                economy features, casino games (Blackjack, Roulette), and the
                initial shop system.
              </p>
            </Panel>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}

function FeatureItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm text-muted">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
      <span>{children}</span>
    </li>
  );
}
