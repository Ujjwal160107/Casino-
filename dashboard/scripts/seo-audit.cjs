/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * SEO / GEO audit: replicates Lighthouse's SEO checks (plus headings,
 * landmarks, social cards and JSON-LD) against a running site, read-only.
 *
 *   node scripts/seo-audit.cjs                       # http://localhost:3000
 *   BASE=https://fortunabot.dev node scripts/seo-audit.cjs
 *
 * Canonicals and og:urls are expected on SITE (default https://fortunabot.dev),
 * whatever BASE is. Requests to /api/ are blocked so the audit never touches data.
 */
const path = require("node:path");

const BASE = (process.env.BASE || "http://localhost:3000").replace(/\/+$/, "");
const SITE = (process.env.SITE || "https://fortunabot.dev").replace(/\/+$/, "");
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const puppeteer = require(process.env.PUPPETEER || path.join(__dirname, "../../node_modules/puppeteer"));

const PAGES = ["/", "/docs", "/docs/crime-families", "/docs/getting-started", "/commands", "/changelog", "/terms", "/policy"];
const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-Web", "anthropic-ai", "PerplexityBot", "Google-Extended", "Applebot-Extended", "CCBot"];
// Lighthouse's link-text blocklist (en).
const GENERIC_LINK_TEXT = new Set(["click here", "click this", "go", "here", "information", "learn more", "more", "more info", "more information", "right here", "read more", "see more", "start", "this", "→", "»", ">", "link"]);

const REQUIRED = {
  Organization: ["name", "url", "logo"],
  WebSite: ["name", "url"],
  SoftwareApplication: ["name", "applicationCategory", "operatingSystem", "offers"],
  FAQPage: ["mainEntity"],
  BreadcrumbList: ["itemListElement"],
  TechArticle: ["headline", "url", "description"],
  DefinedTermSet: ["name", "hasDefinedTerm"],
};
const EXPECTED_TYPES = {
  "/": ["SoftwareApplication", "FAQPage"],
  "/docs/crime-families": ["BreadcrumbList", "TechArticle"],
  "/docs/getting-started": ["BreadcrumbList", "TechArticle"],
  "/commands": ["BreadcrumbList", "DefinedTermSet"],
};

const local = (url) => url.replace(SITE, BASE);

function checkJsonLd(blocks, pagePath, bodyText) {
  const errs = [];
  if (blocks.length !== 1) errs.push(`${blocks.length} JSON-LD blocks (want 1)`);
  for (const raw of blocks) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      errs.push(`JSON-LD parse error: ${e.message}`);
      continue;
    }
    if (data["@context"] !== "https://schema.org") errs.push("bad @context");
    const graph = data["@graph"] || [data];
    const types = graph.map((n) => n["@type"]);
    for (const t of ["Organization", "WebSite", ...(EXPECTED_TYPES[pagePath] || [])]) {
      if (!types.includes(t)) errs.push(`missing ${t}`);
    }
    if (raw.includes("aggregateRating") || raw.includes('"review"')) errs.push("has rating/review");
    for (const node of graph) {
      for (const f of REQUIRED[node["@type"]] || []) if (node[f] == null) errs.push(`${node["@type"]}.${f} missing`);
      if (node["@type"] === "SoftwareApplication" && node.offers?.price !== "0") errs.push("offers.price != 0");
      if (node["@type"] === "FAQPage") {
        for (const q of node.mainEntity) {
          if (!q.name || !q.acceptedAnswer?.text) errs.push("FAQ entry incomplete");
          if (!bodyText.includes(q.name)) errs.push(`FAQ question not visible: ${q.name}`);
          if (!bodyText.replace(/\s+/g, " ").includes(q.acceptedAnswer.text)) errs.push(`FAQ answer not visible: ${q.name}`);
        }
      }
      if (node["@type"] === "BreadcrumbList") {
        node.itemListElement.forEach((li, i) => {
          if (li.position !== i + 1 || !li.name || !String(li.item).startsWith(SITE)) errs.push("breadcrumb item invalid");
        });
      }
      if (node["@type"] === "TechArticle" && node.url !== `${SITE}${pagePath}`) errs.push("TechArticle.url mismatch");
      if (node["@type"] === "DefinedTermSet" && !node.hasDefinedTerm.every((t) => t.name && t.url)) errs.push("DefinedTerm incomplete");
    }
  }
  return errs;
}

/** Runs in the page: everything Lighthouse's SEO category looks at in the DOM. */
function inspectDom() {
  const q = (s) => [...document.querySelectorAll(s)];
  const meta = (sel) => document.querySelector(sel)?.getAttribute("content") ?? null;
  const name = (el) =>
    (el.getAttribute("aria-label") || el.textContent || "").trim() ||
    [...el.querySelectorAll("img[alt]")].map((i) => i.alt).join(" ").trim() ||
    (el.getAttribute("title") || "").trim();

  const anchors = q("a").map((a) => ({
    href: a.getAttribute("href"),
    nameAttr: a.getAttribute("name"),
    role: a.getAttribute("role"),
    text: (a.textContent || "").replace(/\s+/g, " ").trim(),
    accName: name(a),
    html: a.outerHTML.slice(0, 120),
  }));

  // Lighthouse font-size: share of visible text (by characters) at >= 12px.
  let total = 0, legible = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const t = walker.currentNode.textContent.trim();
    const el = walker.currentNode.parentElement;
    if (!t || !el || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    total += t.length;
    if (parseFloat(cs.fontSize) >= 12) legible += t.length;
  }

  const headings = q("h1,h2,h3,h4,h5,h6").map((h) => ({ level: +h.tagName[1], text: h.textContent.trim().slice(0, 50) }));
  const outsideSectioning = (el) => !el.parentElement.closest("main,article,aside,nav,section");

  return {
    lang: document.documentElement.getAttribute("lang"),
    title: document.title,
    titleCount: q("head title").length,
    description: meta('meta[name="description"]'),
    robots: q('meta[name="robots"],meta[name="googlebot"]').map((m) => m.content),
    viewport: meta('meta[name="viewport"]'),
    canonicals: q('link[rel="canonical"]').map((l) => l.getAttribute("href")),
    hreflangs: q('link[rel="alternate"][hreflang]').map((l) => ({ lang: l.hreflang, href: l.href })),
    og: {
      title: meta('meta[property="og:title"]'),
      description: meta('meta[property="og:description"]'),
      url: meta('meta[property="og:url"]'),
      image: meta('meta[property="og:image"]'),
      type: meta('meta[property="og:type"]'),
    },
    twitter: { card: meta('meta[name="twitter:card"]'), image: meta('meta[name="twitter:image"]'), title: meta('meta[name="twitter:title"]') },
    anchors,
    images: q("img").map((i) => ({ src: i.getAttribute("src"), alt: i.getAttribute("alt"), loading: i.loading, fetchPriority: i.fetchPriority })),
    headings,
    landmarks: {
      main: q("main").length,
      banner: q("header").filter(outsideSectioning).length,
      contentinfo: q("footer").filter(outsideSectioning).length,
      nav: q("nav").length,
    },
    font: { total, legible },
    jsonLd: q('script[type="application/ld+json"]').map((s) => s.textContent),
    // Text a crawler indexes: includes collapsed <details> answers, excludes scripts (so JSON-LD cannot match itself).
    bodyText: (() => { const c = document.body.cloneNode(true); c.querySelectorAll("script, style, noscript").forEach((n) => n.remove()); return c.textContent; })(),
  };
}

async function auditPage(browser, p) {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (r) => (new URL(r.url()).pathname.startsWith("/api/") ? r.abort() : r.continue()));
  const res = await page.goto(BASE + p, { waitUntil: "networkidle2", timeout: 180000 });
  const d = await page.evaluate(inspectDom);
  await page.close();

  const fails = {};
  const check = (id, ok, detail) => { if (!ok) fails[id] = detail || "fail"; };
  const status = res.status();
  const xRobots = res.headers()["x-robots-tag"] || "";

  check("http-status", status >= 200 && status < 400, `status ${status}`);
  check("is-crawlable", !d.robots.some((r) => /noindex|none/i.test(r)) && !/noindex|none/i.test(xRobots), d.robots.join("; "));
  check("document-title", d.title && d.titleCount === 1 && d.title.length <= 60, `"${d.title}" (${d.title.length})`);
  check("meta-description", d.description && d.description.length >= 120 && d.description.length <= 160, `${d.description?.length} chars`);
  check("html-has-lang", !!d.lang);
  check("viewport", /width=device-width/.test(d.viewport || ""), d.viewport);
  const want = p === "/" ? SITE : SITE + p;
  // The origin root is the same URL with or without its trailing slash.
  const isWant = (u) => u === want || (p === "/" && u === `${SITE}/`);
  check("canonical", d.canonicals.length === 1 && isWant(d.canonicals[0]), `${d.canonicals.join(", ")} (want ${want})`);
  check("hreflang", d.hreflangs.every((h) => /^[a-z]{2}(-[A-Za-z]{2})?$|^x-default$/.test(h.lang) && /^https?:/.test(h.href)));

  const badText = d.anchors.filter((a) => a.href && !a.href.startsWith("#") && GENERIC_LINK_TEXT.has(a.text.toLowerCase()));
  const noName = d.anchors.filter((a) => !a.accName);
  check("link-text", badText.length === 0 && noName.length === 0, [...badText, ...noName].map((a) => a.html).join(" | "));
  const uncrawlable = d.anchors.filter((a) => {
    if (a.href === null) return !a.nameAttr && a.role !== "button";
    if (/^\s*javascript:/i.test(a.href) || a.href.startsWith("file:") || a.href.trim() === "") return true;
    try { new URL(a.href, BASE); return false; } catch { return true; }
  });
  check("crawlable-anchors", uncrawlable.length === 0, uncrawlable.map((a) => a.html).join(" | "));
  const noAlt = d.images.filter((i) => i.alt === null);
  check("image-alt", noAlt.length === 0, noAlt.map((i) => i.src).join(", "));
  const pct = d.font.total ? (100 * d.font.legible) / d.font.total : 100;
  check("font-size", pct >= 60, `${pct.toFixed(1)}% legible`);

  const h1s = d.headings.filter((h) => h.level === 1).length;
  let jump = null;
  d.headings.reduce((prev, h) => { if (h.level > prev + 1 && !jump) jump = `h${prev}→h${h.level} "${h.text}"`; return h.level; }, 0);
  check("one-h1", h1s === 1, `${h1s} h1`);
  check("heading-order", !jump, jump);
  const L = d.landmarks;
  check("landmarks", L.main === 1 && L.banner >= 1 && L.contentinfo >= 1 && L.nav >= 1, JSON.stringify(L));

  const og = d.og, tw = d.twitter;
  check("open-graph", og.title && og.description && isWant(og.url) && /^https:\/\//.test(og.image || "") && og.type, JSON.stringify(og));
  check("twitter-card", tw.card === "summary_large_image" && /^https:\/\//.test(tw.image || ""), JSON.stringify(tw));
  if (og.image) {
    const img = await fetch(local(og.image));
    check("og-image-200", img.ok && /image\/png/.test(img.headers.get("content-type") || ""), `${img.status} ${img.headers.get("content-type")}`);
  }

  const ldErrs = checkJsonLd(d.jsonLd, p, d.bodyText);
  check("json-ld", ldErrs.length === 0, ldErrs.join("; "));

  return { path: p, status, title: d.title, description: d.description, fails, preloaded: d.images.filter((i) => i.fetchPriority === "high").map((i) => i.src) };
}

async function auditFile(p, { type, test }) {
  const r = await fetch(BASE + p, { redirect: "manual" });
  const body = Buffer.from(await r.arrayBuffer());
  const ct = r.headers.get("content-type") || "";
  const fails = {};
  if (r.status !== 200) fails.status = r.status;
  if (!ct.includes(type)) fails["content-type"] = ct;
  const why = test ? test(body.toString("utf8")) : null;
  if (why) fails.content = why;
  return { path: p, status: r.status, ct, bytes: body.length, fails };
}

function robotsCheck(txt) {
  const lines = txt.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const bad = lines.filter((l) => !/^(user-agent|allow|disallow|sitemap|crawl-delay|host):/i.test(l));
  if (bad.length) return `invalid lines: ${bad.join(" | ")}`;
  if (/^disallow:\s*\/\s*$/im.test(txt)) return "disallows /";
  if (!/^disallow:\s*\/api\/\s*$/im.test(txt)) return "no Disallow: /api/";
  if (!txt.includes(`Sitemap: ${SITE}/sitemap.xml`)) return "no sitemap line";
  const missing = AI_BOTS.filter((b) => !new RegExp(`^User-Agent:\\s*${b}\\s*$`, "im").test(txt));
  return missing.length ? `missing AI bots: ${missing.join(", ")}` : null;
}

function sitemapCheck(xml) {
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const missing = [...PAGES.map((p) => (p === "/" ? SITE : SITE + p))].filter((u) => !urls.includes(u));
  if (missing.length) return `missing ${missing.join(", ")}`;
  if (urls.filter((u) => u.startsWith(`${SITE}/docs/`)).length < 13) return "fewer than 13 docs modules";
  if (!/<lastmod>/.test(xml)) return "no lastmod";
  return null;
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const pages = [];
  for (const p of PAGES) {
    try {
      pages.push(await auditPage(browser, p));
    } catch (e) {
      pages.push({ path: p, fails: { error: e.message } });
    }
  }
  await browser.close();

  const dupe = (k) => pages.filter((x, i) => x[k] && pages.findIndex((y) => y[k] === x[k]) !== i).map((x) => x.path);
  for (const k of ["title", "description"]) for (const p of dupe(k)) pages.find((x) => x.path === p).fails[`unique-${k}`] = "duplicate";

  const files = [
    await auditFile("/robots.txt", { type: "text/plain", test: robotsCheck }),
    await auditFile("/sitemap.xml", { type: "xml", test: sitemapCheck }),
    await auditFile("/llms.txt", { type: "text/plain", test: (t) => (/^# Fortuna\n\n> /.test(t) && /## Docs/.test(t) ? null : "not llms.txt format") }),
    await auditFile("/llms-full.txt", { type: "text/plain", test: (t) => (["## Getting Started", "## Crime Families", "## Command reference"].every((h) => t.includes(h)) ? null : "missing sections") }),
    await auditFile("/opengraph-image", { type: "image/png" }),
    await auditFile("/twitter-image", { type: "image/png" }),
    await auditFile("/docs/crime-families/opengraph-image", { type: "image/png" }),
  ];
  const nf = await fetch(`${BASE}/this-page-does-not-exist`);
  const nfHtml = await nf.text();
  files.push({ path: "/this-page-does-not-exist", status: nf.status, ct: nf.headers.get("content-type"), fails: nf.status === 404 && /name="robots" content="noindex"/.test(nfHtml) ? {} : { notfound: "want 404 + noindex" } });

  const CHECKS = ["http-status", "is-crawlable", "document-title", "meta-description", "canonical", "hreflang", "link-text", "crawlable-anchors", "image-alt", "html-has-lang", "viewport", "font-size", "one-h1", "heading-order", "landmarks", "open-graph", "twitter-card", "og-image-200", "json-ld"];
  console.log(`\nSEO audit of ${BASE} (canonical origin ${SITE})\n`);
  console.log(["page", ...CHECKS].join(" | "));
  for (const r of pages) console.log([r.path, ...CHECKS.map((c) => (r.fails[c] ? "FAIL" : "ok"))].join(" | "));
  console.log("\nTitles / descriptions:");
  for (const r of pages) console.log(`  ${r.path}  [${r.title?.length}] ${r.title}\n      [${r.description?.length}] ${r.description}${r.preloaded?.length ? `\n      preloaded: ${r.preloaded.join(", ")}` : ""}`);
  console.log("\nFiles:");
  for (const f of files) console.log(`  ${Object.keys(f.fails).length ? "FAIL" : "ok  "} ${f.path}  ${f.status} ${f.ct ?? ""} ${f.bytes ?? ""}`);
  const failures = [...pages, ...files].filter((r) => Object.keys(r.fails).length);
  if (failures.length) {
    console.log("\nFailures:");
    for (const r of failures) for (const [k, v] of Object.entries(r.fails)) console.log(`  ${r.path} ${k}: ${String(v).slice(0, 400)}`);
    process.exitCode = 1;
  } else console.log("\nAll checks pass.");
})();
