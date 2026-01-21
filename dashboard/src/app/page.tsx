import { Hero } from "@/components/Hero";
import { LandingNavbar } from "@/components/LandingNavbar";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function Home() {
  const session = await getServerSession(authOptions);

  return (
    <main className="bg-background min-h-screen">
      <LandingNavbar user={session?.user} />
      <Hero />
    </main>
  );
}
