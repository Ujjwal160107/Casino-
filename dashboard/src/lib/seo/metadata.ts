import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";

/** Appended to every page title by the root layout's template. */
export const TITLE_SUFFIX = ` · ${SITE_NAME}`;

/** Social card size shared by every opengraph-image route. */
export const OG_SIZE = { width: 1200, height: 630 };

/** The default social card: app/opengraph-image.tsx. */
export const DEFAULT_OG_IMAGE = "/opengraph-image";

/**
 * A page's metadata: title, description, canonical URL and its Open Graph and
 * Twitter cards. Next replaces (not merges) openGraph and twitter per page, so
 * every page builds the full set here, image included.
 */
export function pageMetadata({
  title,
  description,
  path,
  image = DEFAULT_OG_IMAGE,
  imageAlt,
  type = "website",
}: {
  /** a string goes through the root layout's title template; `{ absolute }` skips it */
  title: string | { absolute: string };
  description: string;
  /** site path of the page, e.g. "/docs/casino" */
  path: string;
  image?: string;
  imageAlt?: string;
  type?: "website" | "article";
}): Metadata {
  const socialTitle = typeof title === "string" ? `${title}${TITLE_SUFFIX}` : title.absolute;
  const images = [{ url: image, ...OG_SIZE, alt: imageAlt ?? socialTitle }];
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type,
      siteName: SITE_NAME,
      locale: "en_US",
      url: path,
      title: socialTitle,
      description,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images,
    },
  };
}

/**
 * The first candidate that fits a search snippet (120–160 characters), or the
 * longest one cut at a word boundary. Lets descriptions be built from content
 * written for people, not for snippets.
 */
export function snippet(...candidates: string[]): string {
  const clean = candidates.map((c) => c.replace(/\s+/g, " ").trim()).filter(Boolean);
  const fit = clean.find((c) => c.length >= 120 && c.length <= 160);
  if (fit) return fit;
  return clip(clean.reduce((a, b) => (b.length > a.length ? b : a), ""), 160);
}

/**
 * `text` cut to at most `max` characters, ellipsis included: at the last
 * clause break (comma, semicolon, dash) if that keeps three quarters of it,
 * else at the last word.
 */
export function clip(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const clause = Math.max(cut.lastIndexOf(", "), cut.lastIndexOf("; "), cut.lastIndexOf(" — "));
  const end = clause >= max * 0.75 ? clause : cut.lastIndexOf(" ");
  return `${cut.slice(0, end).replace(/[\s,;:—–-]+$/, "")}…`;
}
