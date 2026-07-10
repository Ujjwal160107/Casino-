import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { LandingNavbar } from "@/components/LandingNavbar";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/landing/Hero";
import { ModuleShowcase } from "@/components/landing/ModuleShowcase";
import { LandingFeatures } from "@/components/landing/LandingFeatures";
import { BeginnerPath } from "@/components/landing/BeginnerPath";
import { TopGGReviews } from "@/components/landing/TopGGReviews";
import { FinalCTA } from "@/components/landing/FinalCTA";

export default async function Home() {
  const session = await getServerSession(authOptions);

  return (
    <main className="min-h-screen bg-bg">
      <LandingNavbar user={session?.user} />
      <Hero />
      <ModuleShowcase />
      <LandingFeatures />
      <BeginnerPath />
      <TopGGReviews />
      <FinalCTA />
      <Footer />
    </main>
  );
}
