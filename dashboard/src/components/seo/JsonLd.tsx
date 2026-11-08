import { jsonLdGraph, type JsonLdNode } from "@/lib/seo/json-ld";

/**
 * The page's one JSON-LD block: Organization and WebSite, then `nodes`.
 * "<" is escaped so content can never close the script tag.
 */
export function JsonLd({ nodes = [] }: { nodes?: JsonLdNode[] }) {
  const json = JSON.stringify(jsonLdGraph(nodes)).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
