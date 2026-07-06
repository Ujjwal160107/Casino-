import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Toaster } from "sonner";

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
    default: "Fortuna — The Discord life simulator",
    template: "%s · Fortuna",
  },
  description:
    "Fortuna is a life simulator inside Discord — careers, degrees, credit cards, marriage, stocks, hunting, and a casino. One wallet across every server.",
};

export const viewport: Viewport = {
  themeColor: "#0e0f13",
  colorScheme: "dark",
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
          {children}
          <Toaster position="top-right" theme="dark" richColors />
        </Providers>
      </body>
    </html>
  );
}
