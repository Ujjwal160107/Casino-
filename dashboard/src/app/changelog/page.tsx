import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { LandingNavbar } from "@/components/LandingNavbar";
import { Footer } from "@/components/Footer";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { Zap, Book, Layout } from "lucide-react";

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
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">
          Changelog
        </h1>
        <p className="mt-3 text-lg leading-relaxed text-muted">
          Track the evolution of Fortuna. We ship updates regularly to
          improve your experience.
        </p>

        <div className="mt-12 space-y-10">
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
