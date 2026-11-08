import type { Command, KeyTable, ModuleDoc } from "@/content/types";
import { COMMANDS, MODULE_LABELS, getCommand } from "@/content/commands";
import { MODULE_DOCS } from "@/content/modules";
import { FAQ, type FaqSegment } from "@/content/faq";
import { INVITE_URL, SUPPORT_URL } from "@/lib/links";
import { SITE_DESCRIPTION, SITE_NAME, TOPGG_URL, absoluteUrl } from "@/lib/site";
import { INLINE_COMMAND } from "@/components/docs/rich-text";
import { modulePath } from "./docs";

/**
 * The docs as markdown for answer engines (llmstxt.org): /llms.txt is the
 * index, /llms-full.txt the whole manual. Both are rendered from src/content,
 * the same data the docs pages render, so they stay in step with the site.
 */

/** Inline commands as code, the way the pages set them in gold mono. */
const md = (text: string) => text.replace(INLINE_COMMAND, (_, lead: string, cmd: string) => `${lead}\`${cmd}\``);

const cell = (text: string) => md(text).replace(/\|/g, "\\|").replace(/\n/g, " ");

function table(t: KeyTable) {
  return [
    ...(t.title ? [`**${t.title}**`, ""] : []),
    `| ${t.columns.map(cell).join(" | ")} |`,
    `| ${t.columns.map(() => "---").join(" | ")} |`,
    ...t.rows.map((r) => `| ${r.map(cell).join(" | ")} |`),
  ].join("\n");
}

function faqSegment(s: FaqSegment) {
  if (typeof s === "string") return s;
  return "cmd" in s ? `\`${s.cmd}\`` : `[${s.label}](${absoluteUrl(s.href)})`;
}

function command(c: Command) {
  const lines = [`#### \`${c.name}\``, "", md(c.short), "", `- Usage: \`${c.usage}\``];
  if (c.aliases.length) lines.push(`- Aliases: ${c.aliases.map((a) => `\`!${a}\``).join(", ")}`);
  if (c.cooldown) lines.push(`- Cooldown: ${c.cooldown}`);
  for (const a of c.args ?? []) lines.push(`- \`${a.name}\`: ${md(a.desc)}`);
  for (const k of c.keyNumbers ?? []) lines.push(`- ${k.label}: ${k.value}`);
  if (c.jailBlocked) lines.push("- Blocked while jailed");
  return lines.join("\n");
}

function moduleMarkdown(doc: ModuleDoc) {
  const out = [
    `## ${doc.title}`,
    "",
    `Source: ${absoluteUrl(modulePath(doc))}`,
    "",
    `> ${md(doc.tagline)}`,
    "",
    md(doc.forBeginners.what),
    "",
    `First commands: ${doc.forBeginners.firstCommands.map((c) => `\`${c}\``).join(", ")}`,
    "",
    `Tip: ${md(doc.forBeginners.tip)}`,
  ];
  for (const s of doc.sections) {
    out.push("", `### ${s.heading}`, "", ...s.body.flatMap((p) => [md(p), ""]));
    if (s.table) out.push(table(s.table), "");
    if (s.note) out.push(`> Note: ${md(s.note)}`, "");
  }
  if (doc.proTips.length) out.push("", "### Pro tips", "", ...doc.proTips.map((t) => `- ${md(t)}`));
  // Full command entries live once, in the command reference at the end.
  const cmds = doc.commandIds.map(getCommand).filter((c): c is Command => Boolean(c));
  if (cmds.length) out.push("", `Commands in this module: ${cmds.map((c) => `\`${c.name}\``).join(", ")}`);
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

const header = () =>
  [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    `${SITE_NAME} is a Discord bot. Every player has one global account tied to their Discord account, so the wallet, bank, job, degrees, credit card, zoo and crime family follow them to every server the bot is in. Commands use the \`!\` prefix by default (servers can change it). The docs publish every system's real numbers: the odds, the prices, the taxes and the cooldowns.`,
    "",
    `- Add to Discord: ${INVITE_URL}`,
    `- Support server: ${SUPPORT_URL}`,
    `- top.gg listing: ${TOPGG_URL}`,
  ].join("\n");

/** /llms.txt: what Fortuna is, and a one-line pointer to every docs page. */
export function llmsIndex() {
  return [
    header(),
    "",
    "## Docs",
    "",
    ...MODULE_DOCS.map((m) => `- [${m.title}](${absoluteUrl(modulePath(m))}): ${m.tagline}`),
    `- [All commands](${absoluteUrl("/commands")}): All ${COMMANDS.length} commands with usage, cooldowns and key numbers, grouped by module.`,
    "",
    "## Full text",
    "",
    `- [llms-full.txt](${absoluteUrl("/llms-full.txt")}): Every docs module and every command in one markdown file.`,
    "",
    "## Optional",
    "",
    `- [Changelog](${absoluteUrl("/changelog")}): Every release, newest first.`,
    `- [Terms of Service](${absoluteUrl("/terms")}): The user agreement for the bot and website.`,
    `- [Privacy Policy](${absoluteUrl("/policy")}): What data Fortuna stores and why.`,
    "",
  ].join("\n");
}

/** /llms-full.txt: the FAQ, every module in docs order, then the full command reference. */
export function llmsFull() {
  const byModule = (Object.keys(MODULE_LABELS) as (keyof typeof MODULE_LABELS)[]).map((m) => [
    `### ${MODULE_LABELS[m]}`,
    "",
    COMMANDS.filter((c) => c.module === m).map(command).join("\n\n"),
  ].join("\n"));
  return [
    header(),
    "",
    "## FAQ",
    "",
    ...FAQ.flatMap((f) => [`**${f.q}**`, "", f.a.map(faqSegment).join(""), ""]),
    ...MODULE_DOCS.flatMap((m) => [moduleMarkdown(m), ""]),
    "## Command reference",
    "",
    `Source: ${absoluteUrl("/commands")}`,
    "",
    "`<required>` must be filled in, `[optional]` can be left out.",
    "",
    byModule.join("\n\n"),
    "",
  ].join("\n");
}
