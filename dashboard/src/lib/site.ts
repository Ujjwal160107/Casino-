import { VOTE_URL } from "./links";

/**
 * Site identity for metadata, structured data, the sitemap and the llms files:
 * the one place that names the canonical origin and the brand's one-line pitch.
 */

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://fortunabot.dev").replace(/\/+$/, "");

export const SITE_NAME = "Fortuna";

/** The home page's full title, and the fallback for any page without one. */
export const SITE_TITLE = "Fortuna: Discord Economy & Life Sim Bot with a Casino";

/** The pitch, as the landing hero and footer state it. */
export const SITE_DESCRIPTION =
  "Fortuna is a free life sim inside Discord: jobs, degrees, credit cards, a casino, a zoo and crime families you run with friends. One account on every server.";

/** The bot's public top.gg listing, without the vote link's referral query. */
export const TOPGG_URL = (() => {
  const u = new URL(VOTE_URL);
  return `${u.origin}${u.pathname}`;
})();

/**
 * When the docs and commands content last changed: the latest release on
 * /changelog. Bump it with each release so the sitemap's lastModified moves.
 */
export const CONTENT_UPDATED = "2026-11-05";

/** The "Effective Date" printed on /terms and /policy. */
export const LEGAL_EFFECTIVE = "2026-07-06";

/** Absolute URL on the canonical origin for a site path ("/docs" → "https://fortunabot.dev/docs"). */
export function absoluteUrl(path = "/") {
  return path === "/" ? SITE_URL : `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
