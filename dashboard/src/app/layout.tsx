import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Toaster } from "sonner";
import { CursorSpotlight } from "@/components/CursorSpotlight";
import { AmbientBackground } from "@/components/AmbientBackground";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: {
    default: "Fortuna — Get rich. Go broke. Repeat.",
    template: "%s · Fortuna",
  },
  description:
    "Fortuna is an economy and casino inside Discord — one wallet across every server. Work jobs, earn degrees, build credit, and bet it all on black.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${inter.variable} ${jetbrains.variable}`}
    >
      <body className="bg-bg font-body text-ink antialiased">
        <Providers>
          <AmbientBackground />
          <CursorSpotlight />
          {children}
          <Toaster position="top-right" theme="dark" richColors />
        </Providers>
      </body>
    </html>
  );
}
