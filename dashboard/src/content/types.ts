export type ModuleId = "general" | "economy" | "casino" | "life";

export interface Command {
  /** anchor slug used as the row id and #hash target, e.g. "work" */
  id: string;
  /** primary trigger including prefix, e.g. "!work" */
  name: string;
  /** alias triggers WITHOUT prefix, e.g. ["job", "myjob"] */
  aliases: string[];
  module: ModuleId;
  /** one-line description, in-voice */
  short: string;
  /** usage syntax, e.g. "!blackjack <bet>" */
  usage: string;
  args?: { name: string; desc: string }[];
  examples: string[];
  /** human-readable, e.g. "30 min (casino cooldown, per game)" */
  cooldown?: string;
  keyNumbers?: { label: string; value: string }[];
  /** true when the command opens buttons/menus/modals */
  interactive?: boolean;
  /** true when the command is blocked while jailed */
  jailBlocked?: boolean;
}

export interface KeyTable {
  title?: string;
  columns: string[];
  rows: string[][];
}

export interface DocSection {
  heading: string;
  /** paragraphs of body copy */
  body: string[];
  table?: KeyTable;
  /** optional emphasized warning/note line */
  note?: string;
}

export interface ModuleDoc {
  slug: string;
  title: string;
  tagline: string;
  /** lucide-react icon name rendered by the docs UI, e.g. "Coins" */
  icon: string;
  forBeginners: {
    what: string;
    firstCommands: string[];
    tip: string;
  };
  /**
   * Module artwork rendered by ScreenshotSlot. Shows the image if the file
   * exists under public/, otherwise renders nothing (no placeholder).
   * `aspect` is a tailwind aspect class matching the image's native ratio so
   * it is never cropped; `maxWidth` centers and caps portrait/square art.
   */
  screenshot?: {
    src: string;
    alt: string;
    caption?: string;
    aspect?: string;
    maxWidth?: string;
  };
  sections: DocSection[];
  /** Command ids (from commands.ts) listed on this page */
  commandIds: string[];
  proTips: string[];
}
