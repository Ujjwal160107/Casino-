import { Hero } from "@/components/Hero";

import { LandingNavbar } from "@/components/LandingNavbar";

export default function Home() {
  return (
    <main className="bg-background min-h-screen">
      <LandingNavbar />
      <Hero />
    </main>
  );
}
