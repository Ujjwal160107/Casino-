import type { Command, ModuleDoc } from "@/content/types";
import { faqAnswerText, type FaqItem } from "@/content/faq";
import { INVITE_URL, SUPPORT_URL } from "@/lib/links";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, TOPGG_URL, absoluteUrl } from "@/lib/site";
import { cmdAnchor } from "@/components/docs/anchors";
import { moduleDescription, moduleOgImage, modulePath } from "./docs";

/**
 * schema.org nodes for the JSON-LD graph. Every value here is something the
 * page shows (or the site's own identity): no ratings, reviews or dates the
 * visitor can't see.
 */

export type JsonLdNode = Record<string, unknown>;

const ORG_ID = `${SITE_URL}/#organization`;
const SITE_ID = `${SITE_URL}/#website`;
const APP_ID = `${SITE_URL}/#app`;

export function organizationNode(): JsonLdNode {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE_NAME,
    url: SITE_URL,
    logo: { "@type": "ImageObject", url: absoluteUrl("/fortuna_icon.png"), width: 336, height: 336 },
    sameAs: [SUPPORT_URL, TOPGG_URL],
  };
}

export function websiteNode(): JsonLdNode {
  return {
    "@type": "WebSite",
    "@id": SITE_ID,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    inLanguage: "en",
    publisher: { "@id": ORG_ID },
  };
}

/** The bot itself, as the landing page presents it. `features` are the docs module titles. */
export function softwareApplicationNode(features: string[]): JsonLdNode {
  return {
    "@type": "SoftwareApplication",
    "@id": APP_ID,
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    image: absoluteUrl("/bot_pfp.png"),
    applicationCategory: "GameApplication",
    applicationSubCategory: "Discord bot",
    operatingSystem: "Discord",
    installUrl: INVITE_URL,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    featureList: features,
    sameAs: [SUPPORT_URL, TOPGG_URL],
    publisher: { "@id": ORG_ID },
  };
}

export function faqPageNode(items: FaqItem[]): JsonLdNode {
  return {
    "@type": "FAQPage",
    "@id": `${SITE_URL}/#faq`,
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: faqAnswerText(f.a) },
    })),
  };
}

/** The visible "Docs / Page" trail of a docs page. */
export function breadcrumbNode(trail: { name: string; path: string }[]): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: absoluteUrl(t.path),
    })),
  };
}

export function techArticleNode(doc: ModuleDoc): JsonLdNode {
  const url = absoluteUrl(modulePath(doc));
  return {
    "@type": "TechArticle",
    "@id": `${url}#article`,
    headline: doc.title,
    description: moduleDescription(doc),
    abstract: doc.forBeginners.what,
    url,
    mainEntityOfPage: url,
    image: absoluteUrl(moduleOgImage(doc)),
    inLanguage: "en",
    articleSection: doc.sections.map((s) => s.heading),
    about: { "@id": APP_ID, "@type": "SoftwareApplication", name: SITE_NAME },
    author: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    isPartOf: { "@id": SITE_ID },
  };
}

/** Every bot command as a defined term, linked to its card on /commands. */
export function commandTermSetNode(commands: Command[]): JsonLdNode {
  const url = absoluteUrl("/commands");
  return {
    "@type": "DefinedTermSet",
    "@id": `${url}#commands`,
    name: "Fortuna bot commands",
    url,
    hasDefinedTerm: commands.map((c) => ({
      "@type": "DefinedTerm",
      name: c.name,
      description: c.short,
      termCode: c.usage,
      url: `${url}#${cmdAnchor(c.id)}`,
      ...(c.aliases.length ? { alternateName: c.aliases } : {}),
    })),
  };
}

/** The page's graph: the site's identity first, then the page's own nodes. */
export function jsonLdGraph(nodes: JsonLdNode[]) {
  return { "@context": "https://schema.org", "@graph": [organizationNode(), websiteNode(), ...nodes] };
}
