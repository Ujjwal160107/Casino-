import { renderOgCard } from "@/lib/seo/og-card";
import { OG_SIZE } from "@/lib/seo/metadata";

export const alt = "Fortuna: a free life sim and casino inside Discord";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOgCard({
    eyebrow: "A life sim inside Discord",
    title: "Fortuna",
    tagline: "Jobs, degrees, credit cards, a casino, a zoo and crime families. One account on every server.",
    pagePath: "/",
  });
}
