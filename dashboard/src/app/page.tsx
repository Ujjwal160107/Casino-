import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { LandingNavbar } from "@/components/LandingNavbar";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/landing/Hero";
import { Marquees } from "@/components/landing/Marquees";
import { ModulesRail } from "@/components/landing/ModulesRail";
import { HowItPlays } from "@/components/landing/HowItPlays";
import { CrimeFamilies } from "@/components/landing/CrimeFamilies";
import { StartSteps } from "@/components/landing/StartSteps";
import { WhatsNew } from "@/components/landing/WhatsNew";
import { TopGGReviews } from "@/components/landing/TopGGReviews";
import { Faq } from "@/components/landing/Faq";
import { FinalCta } from "@/components/landing/FinalCta";

// Order: the pitch and a live demo, the systems, how they play, the new
// Crime Families mode, then how to start, what changed, proof, questions, ask.
export default async function Home() {
  const session = await getServerSession(authOptions);

  return (
    <main className="min-h-screen bg-bg">
      <LandingNavbar user={session?.user} />
      <Hero />
      <Marquees />
      <ModulesRail />
      <HowItPlays />
      <CrimeFamilies />
      <StartSteps />
      <WhatsNew />
      <TopGGReviews />
      <Faq />
      <FinalCta />
      <Footer />
    </main>
  );
}
