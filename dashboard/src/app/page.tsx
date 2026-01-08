import { Hero } from "@/components/Hero";
import { FeatureSection } from "@/components/FeatureSection";
import { LandingNavbar } from "@/components/LandingNavbar";

export default function Home() {
  return (
    <main className="bg-background min-h-screen">
      <LandingNavbar />
      <Hero />
      <FeatureSection />
    </main>
  );
}
