import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { LandingNavbar } from "@/components/LandingNavbar";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/landing/Hero";
import { Marquees } from "@/components/landing/Marquees";
import { LaunchVideo } from "@/components/landing/LaunchVideo";
import { ModulesRail } from "@/components/landing/ModulesRail";
import { HowItPlays } from "@/components/landing/HowItPlays";
import { CrimeFamilies } from "@/components/landing/CrimeFamilies";
import { StartSteps } from "@/components/landing/StartSteps";
import { WhatsNew } from "@/components/landing/WhatsNew";
import { TopGGReviews } from "@/components/landing/TopGGReviews";
import { Faq } from "@/components/landing/Faq";
import { FinalCta } from "@/components/landing/FinalCta";
import { JsonLd } from "@/components/seo/JsonLd";
import { FAQ } from "@/content/faq";
import { MODULE_DOCS } from "@/content/modules";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/site";
import { pageMetadata } from "@/lib/seo/metadata";
import { faqPageNode, softwareApplicationNode } from "@/lib/seo/json-ld";

export const metadata: Metadata = pageMetadata({
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  path: "/",
  imageAlt: "Fortuna: a free life sim and casino inside Discord",
});

/** The bot's systems, as the docs name them (Getting Started is a guide, not a feature). */
const FEATURES = MODULE_DOCS.filter((m) => m.slug !== "getting-started").map((m) => m.title);

// Order: the pitch and a live demo, the launch trailer, the systems, how they play, the new
// Crime Families mode, then how to start, what changed, proof, questions, ask.
export default async function Home() {
  const session = await getServerSession(authOptions);

  return (
    <div className="min-h-screen bg-bg">
      <JsonLd nodes={[softwareApplicationNode(FEATURES), faqPageNode(FAQ)]} />
      <LandingNavbar user={session?.user} />
      <main id="main" className="scroll-mt-24">
        <Hero />
        <Marquees />
        <LaunchVideo />
        <ModulesRail />
        <HowItPlays />
        <CrimeFamilies />
        <StartSteps />
        <WhatsNew />
        <TopGGReviews />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
