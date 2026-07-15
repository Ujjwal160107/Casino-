import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ContainerBuilder,
  Interaction,
  Message,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder
} from "discord.js";
import { getGuildSettings } from "../../services/guildSettingsService";
import { Mascot } from "../../config/branding";

interface CommandInfo {
  name: string;
  aliases: string[];
  description: string;
  /** Full usage syntax. Use {p} as the prefix placeholder. */
  usage?: string;
  /** Subcommands, each "name <args> — what it does". Use {p} for prefix. */
  subcommands?: string[];
  /** One concrete example. Use {p} for prefix. */
  example?: string;
}

interface CategoryData {
  id: string;
  label: string;
  description: string;
  commands: CommandInfo[];
}

// Every player-facing command + subcommand. Admin/developer commands are intentionally excluded.
// {p} is replaced with the server prefix at render time.
const CATEGORIES: CategoryData[] = [
  {
    id: "economy",
    label: "Economy",
    description: "Wallet, transfers, and core money commands",
    commands: [
      { name: "balance", aliases: ["bal", "b"], description: "Check your wallet, bank, and net worth.", example: "{p}balance" },
      { name: "deposit", aliases: ["dep"], description: "Move wallet money into the bank.", usage: "{p}deposit <amount|all>", example: "{p}deposit 5000" },
      { name: "withdraw", aliases: ["with", "wd"], description: "Move bank money into your wallet.", usage: "{p}withdraw <amount|all>", example: "{p}withdraw 5000" },
      { name: "transfer", aliases: ["give"], description: "Send money to another player.", usage: "{p}transfer <@user> <amount>", example: "{p}transfer @Bob 1000" },
      {
        name: "ask", aliases: ["ask-money"], description: "Ask another player for money (Accept / Decline / Block).",
        usage: "{p}ask <@user> <amount> [reason]",
        subcommands: ["unblock <@user> — let a blocked user ask you again"],
        example: "{p}ask @Bob 500 lunch"
      }
    ]
  },
  {
    id: "banking",
    label: "Banking & Cards",
    description: "Bank, investments, and Fortuna Credit Cards",
    commands: [
      {
        name: "bank", aliases: [], description: "Open the bank dashboard, investments, and cards hub.",
        usage: "{p}bank [subcommand]",
        subcommands: [
          "fd <amount> <days> — open a Fixed Deposit",
          "rd <amount> <days> — open a Recurring Deposit",
          "collect — collect matured investments",
          "investments (invest) — view your investments",
          "cards (card) — open the cards hub",
          "loan (loans, repay) — redirects to Cards"
        ],
        example: "{p}bank fd 100000 7"
      },
      {
        name: "card", aliases: ["creditcard"], description: "Manage your Fortuna Card (defaults to info).",
        usage: "{p}card [subcommand]",
        subcommands: [
          "issue — apply for a card",
          "pay <amount> — pay your balance",
          "withdraw <amount> — cash advance",
          "upgrade — upgrade your tier",
          "close — close your card"
        ],
        example: "{p}card pay 20000"
      },
      { name: "mycards", aliases: ["my-cards", "mycard"], description: "Full card dashboard: balance, due date, transactions, and pay buttons.", example: "{p}mycards" },
      { name: "credit", aliases: ["score"], description: "Credit score summary with a My Cards entry point.", example: "{p}credit" }
    ]
  },
  {
    id: "rewards",
    label: "Rewards",
    description: "Daily, weekly, monthly, and voting rewards",
    commands: [
      { name: "daily", aliases: [], description: "Claim your daily reward.", example: "{p}daily" },
      { name: "weekly", aliases: [], description: "Claim your weekly reward.", example: "{p}weekly" },
      { name: "monthly", aliases: [], description: "Claim your monthly reward.", example: "{p}monthly" },
      {
        name: "vote", aliases: [], description: "Earn rewards for voting for the bot.",
        subcommands: ["reminder (remind) — toggle vote reminders"],
        example: "{p}vote"
      }
    ]
  },
  {
    id: "hustle",
    label: "Hustle, Crime & Jail",
    description: "Crime, begging, robbing, and getting out of jail",
    commands: [
      { name: "crime", aliases: [], description: "Attempt a crime minigame for a cash payout (risk of jail).", example: "{p}crime" },
      { name: "beg", aliases: ["slut"], description: "Low-risk ways to earn small amounts of money.", example: "{p}beg" },
      { name: "rob", aliases: ["steal"], description: "Attempt to rob another player.", usage: "{p}rob <@user>", example: "{p}rob @Bob" },
      { name: "heat", aliases: ["laylow", "lay-low"], description: "Check criminal heat and use Lay Low or Call a Fixer.", example: "{p}heat" },
      { name: "jail", aliases: ["status"], description: "Check your jail status and sentence.", example: "{p}jail" },
      { name: "bail", aliases: ["release", "paybail"], description: "Pay bail to get out of jail early.", example: "{p}bail" }
    ]
  },
  {
    id: "games",
    label: "Casino Games",
    description: "Wallet-only casino games and the cockfight pit",
    commands: [
      { name: "coinflip", aliases: [], description: "Bet on heads or tails.", usage: "{p}coinflip <amount>", example: "{p}coinflip 10000" },
      { name: "slots", aliases: ["slot"], description: "Spin the slot machine.", usage: "{p}slots <amount>", example: "{p}slots 10000" },
      { name: "roll", aliases: [], description: "Roll your Loaded Dice of Ruin once per day.", example: "{p}roll" },
      { name: "blackjack", aliases: ["bj"], description: "Play a hand of blackjack against the dealer.", usage: "{p}blackjack <amount>", example: "{p}blackjack 25000" },
      {
        name: "bet", aliases: ["roulette", "roul"], description: "Place a roulette bet (number, color, or dozen).",
        usage: "{p}bet <amount> <space>",
        subcommands: ["roulette-guide — view all roulette betting options"],
        example: "{p}bet 5000 red"
      },
      {
        name: "rr", aliases: ["russianroulette"], description: "Multiplayer russian roulette.",
        usage: "{p}rr <amount>",
        subcommands: ["start (create) — open a lobby", "join — join an open lobby", "force — force-start the round"],
        example: "{p}rr 50000"
      },
      { name: "cockfight", aliases: ["cf"], description: "Bet on a single cockfight match.", usage: "{p}cockfight <amount>", example: "{p}cockfight 20000" },
      {
        name: "chicken", aliases: ["cock"], description: "Raise and manage your fighting chicken.",
        subcommands: ["name <name> — name your chicken", "train — train its stats", "top (leaderboard) — top chickens", "traits (info) — view traits"],
        example: "{p}chicken train"
      },
      { name: "feed", aliases: [], description: "Feed your chicken to keep it healthy.", example: "{p}feed" }
    ]
  },
  {
    id: "hunting",
    label: "Hunting & Zoo",
    description: "Hunt animals, craft gear, and build your zoo",
    commands: [
      {
        name: "hunt", aliases: [], description: "Go hunting for animals (needs a rifle from {p}shop hunt).",
        subcommands: ["craft — craft gear from your hunt loot"],
        example: "{p}hunt"
      },
      { name: "zoo", aliases: ["myzoo"], description: "View the animals you've captured.", example: "{p}zoo" }
    ]
  },
  {
    id: "shop",
    label: "Shop & Items",
    description: "Stores, inventory, and using or equipping items",
    commands: [
      {
        name: "shop", aliases: ["store"], description: "Browse and buy items (GENERAL store by default).",
        usage: "{p}shop [category|subcommand]",
        subcommands: [
          "buy <item> — buy with your wallet",
          "buy card <item> — buy on credit",
          "sell <item> — sell an item back",
          "inv (inventory) — view your items",
          "hunt / job / uni / cock / cosmetics — open a category store"
        ],
        example: "{p}shop buy rifle"
      },
      { name: "buy", aliases: [], description: "Quick shortcut for {p}shop buy.", usage: "{p}buy <item>", example: "{p}buy rifle" },
      { name: "cockstore", aliases: ["cs"], description: "Shortcut to the cockfight store ({p}shop cock).", example: "{p}cockstore" },
      { name: "inventory", aliases: ["inv", "bag", "items"], description: "View your items (ALL / HUNT / JOB / UNI / COCK).", usage: "{p}inventory [category]", example: "{p}inventory hunt" },
      { name: "use", aliases: [], description: "Use a consumable item.", usage: "{p}use <item>", example: "{p}use energy drink" },
      { name: "equip", aliases: [], description: "Equip an item, such as a rifle.", usage: "{p}equip <item>", example: "{p}equip hunting rifle" },
      { name: "iteminfo", aliases: ["item-info", "item"], description: "View details about any item.", usage: "{p}iteminfo <item>", example: "{p}iteminfo rifle" }
    ]
  },
  {
    id: "market",
    label: "Black Market",
    description: "Player-to-player marketplace for rare items",
    commands: [
      { name: "market", aliases: ["bm", "blackmarket"], description: "Browse, list, and buy items on the player black market.", example: "{p}market" }
    ]
  },
  {
    id: "stock",
    label: "Stock Market",
    description: "Trade shares on the global stock market",
    commands: [
      {
        name: "stock", aliases: ["stocks"], description: "Global stock market — live prices, forecasts, and news.",
        usage: "{p}stock [subcommand]",
        subcommands: [
          "buy <symbol> <qty> — buy shares",
          "sell <symbol> <qty> — sell shares",
          "portfolio (port) — your holdings & P/L",
          "news — market rumors & recent events"
        ],
        example: "{p}stock buy CHIP 5"
      },
      { name: "my-stocks", aliases: ["mystocks", "stock-portfolio"], description: "View your stock holdings and profit/loss.", example: "{p}my-stocks" }
    ]
  },
  {
    id: "realestate",
    label: "Real Estate",
    description: "Buy properties and collect rent",
    commands: [
      {
        name: "properties", aliases: ["realestate", "estate"], description: "Browse properties you can buy.",
        subcommands: ["collect — collect all your rent", "mine — your owned properties"],
        example: "{p}properties"
      },
      { name: "buy-property", aliases: ["buyprop"], description: "Buy a property.", usage: "{p}buy-property <key>", example: "{p}buy-property apartment" },
      { name: "sell-property", aliases: ["sellprop"], description: "Sell a property you own.", usage: "{p}sell-property <key>", example: "{p}sell-property apartment" },
      { name: "my-properties", aliases: ["myprops"], description: "View your owned properties.", example: "{p}my-properties" },
      { name: "collect-rent", aliases: ["rent"], description: "Collect income from all your properties.", example: "{p}collect-rent" }
    ]
  },
  {
    id: "jobs",
    label: "Jobs & Career",
    description: "Get a job, work shifts, and manage stress",
    commands: [
      { name: "jobs", aliases: ["careers"], description: "Browse available jobs.", example: "{p}jobs" },
      { name: "apply", aliases: [], description: "Apply to an available job.", usage: "{p}apply <job>", example: "{p}apply barista" },
      { name: "work", aliases: ["job"], description: "Work a shift at your current job.", example: "{p}work" },
      { name: "career", aliases: ["mycareer"], description: "View your career progression.", example: "{p}career" },
      { name: "relax", aliases: ["chill"], description: "Reduce job and study stress (Quick Break, Gym, Meditation, Weekend).", example: "{p}relax" }
    ]
  },
  {
    id: "education",
    label: "Education",
    description: "Enroll in degrees, study, and graduate",
    commands: [
      { name: "education", aliases: ["uni", "school", "edu"], description: "Open your education dashboard.", example: "{p}education" },
      { name: "enroll", aliases: [], description: "Enroll in a degree program.", usage: "{p}enroll <degree>", example: "{p}enroll computer science" },
      { name: "study", aliases: [], description: "Study your current program ({p}study classic for the minigame).", example: "{p}study" },
      { name: "exam", aliases: ["finals"], description: "Take the final exam for your degree.", example: "{p}exam" },
      { name: "dropout", aliases: [], description: "Drop out of your current program.", example: "{p}dropout" },
      { name: "degrees", aliases: ["mydegrees"], description: "View the degrees you've earned.", example: "{p}degrees" }
    ]
  },
  {
    id: "marriage",
    label: "Marriage & Family",
    description: "Propose, marry, and manage a joint vault",
    commands: [
      { name: "marry", aliases: ["propose"], description: "Propose marriage to another player.", usage: "{p}marry <@user>", example: "{p}marry @Alice" },
      { name: "divorce", aliases: [], description: "End your marriage.", example: "{p}divorce" },
      {
        name: "family", aliases: ["spouse", "marriage"], description: "View your marriage status and joint vault.",
        subcommands: [
          "bank (vault) — joint vault balance",
          "deposit <amount> / withdraw <amount> — joint vault",
          "hug / kiss / date / chaos / make love — couple actions"
        ],
        example: "{p}family"
      }
    ]
  },
  {
    id: "quests",
    label: "Quests",
    description: "Daily quests and missions",
    commands: [
      { name: "quests", aliases: ["quest", "missions"], description: "View and track your daily quests and missions.", example: "{p}quests" }
    ]
  },
  {
    id: "profile",
    label: "Profile & Leaderboards",
    description: "Your profile and the server rankings",
    commands: [
      { name: "profile", aliases: ["p", "me"], description: "Your full profile: Overview, Wealth, Career, Cosmetics, Education, Relationship.", example: "{p}profile" },
      {
        name: "leaderboard", aliases: ["lb", "top", "rich"], description: "Server leaderboard (net worth by default).",
        subcommands: ["cash — wallet leaderboard", "work — work / employee leaderboard"],
        example: "{p}leaderboard cash"
      },
      { name: "lb-wallet", aliases: ["cashlb"], description: "Wallet-only leaderboard.", example: "{p}lb-wallet" }
    ]
  },
  {
    id: "general",
    label: "General",
    description: "Guides, onboarding, and server setup",
    commands: [
      { name: "help", aliases: [], description: "Open this help menu.", example: "{p}help" },
      { name: "guide", aliases: ["tutorial"], description: "Read the quick-start guide.", example: "{p}guide" },
      { name: "casino", aliases: ["games", "casinoguide"], description: "A guide to all the casino games.", example: "{p}casino" },
      { name: "start", aliases: [], description: "Create your profile if you haven't started yet.", example: "{p}start" },
      { name: "ping", aliases: ["latency"], description: "Check the bot's latency.", example: "{p}ping" },
      { name: "set-prefix", aliases: ["setprefix"], description: "Change this server's command prefix.", usage: "{p}set-prefix <prefix>", example: "{p}set-prefix !" }
    ]
  }
];

const MODULE_PREFIX = "help:module:";
const NAV_PREFIX = "help:nav:";
const PAGE_SIZE = 6;

// One branding emote per module (left of each section).
const MODULE_EMOTES: Record<string, string> = {
  economy: Mascot.Emotes.MoneyBag,
  banking: Mascot.Emotes.Bank,
  rewards: Mascot.Emotes.Lootbox,
  hustle: Mascot.Emotes.Police,
  games: Mascot.Emotes.Casino,
  hunting: Mascot.Emotes.Gun,
  shop: Mascot.Emotes.Inventory,
  market: Mascot.Emotes.Trade,
  stock: Mascot.Emotes.GraphUp,
  realestate: Mascot.Emotes.Gem,
  jobs: Mascot.Emotes.JobWorking,
  education: Mascot.Emotes.Graduate,
  marriage: Mascot.Emotes.Love,
  quests: Mascot.Emotes.Scroll,
  profile: Mascot.Emotes.MedalGold,
  general: Mascot.Emotes.Settings
};

const applyPrefix = (text: string, prefix: string) => text.replace(/\{p\}/g, prefix);

function separator() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

function renderCommandBlock(command: CommandInfo, prefix: string): string {
  const aliases = command.aliases.length ? ` (${command.aliases.join(", ")})` : "";
  const lines = [
    `**\`${prefix}${command.name}\`**${aliases}`,
    applyPrefix(command.description, prefix)
  ];
  if (command.usage) lines.push(`**Usage:** \`${applyPrefix(command.usage, prefix)}\``);
  if (command.subcommands?.length) {
    lines.push("**Subcommands:**");
    for (const sub of command.subcommands) lines.push(`- ${applyPrefix(sub, prefix)}`);
  }
  if (command.example) lines.push(`**Example:** \`${applyPrefix(command.example, prefix)}\``);
  return lines.join("\n");
}

/**
 * Main menu: each module is its own Section (description on the left, View button on the
 * right) separated by dividers, with page navigation in a row at the very bottom.
 * Paginated because section+button+separator per module exceeds the 40-component cap.
 */
function buildMainMenu(prefix: string, page: number, authorId: string): ContainerBuilder {
  const totalPages = Math.max(1, Math.ceil(CATEGORIES.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageModules = CATEGORIES.slice(start, start + PAGE_SIZE);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${Mascot.Name} Help\n` +
        `Select a module to open its commands in a private message — this menu stays here.\n` +
        `**Server Prefix:** \`${prefix}\``
      )
    )
    .addSeparatorComponents(separator());

  for (const category of pageModules) {
    const emote = MODULE_EMOTES[category.id] ?? "";
    container
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${emote} ${category.label}\n${category.description}`)
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setCustomId(`${MODULE_PREFIX}${category.id}`)
              .setLabel("View")
              .setStyle(ButtonStyle.Secondary)
          )
      )
      .addSeparatorComponents(separator());
  }

  if (totalPages > 1) {
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${NAV_PREFIX}${safePage - 1}:${authorId}`)
          .setLabel("Previous")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(safePage <= 1),
        new ButtonBuilder()
          .setCustomId("help:page")
          .setLabel(`Page ${safePage}/${totalPages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`${NAV_PREFIX}${safePage + 1}:${authorId}`)
          .setLabel("Next")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(safePage >= totalPages)
      )
    );
  }

  return container;
}

/** Ephemeral submenu for a single module, with separators between each command. */
function buildModuleView(category: CategoryData, prefix: string): ContainerBuilder {
  const emote = MODULE_EMOTES[category.id] ?? "";
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emote} ${category.label}\n${category.description}`)
    )
    .addSeparatorComponents(separator());

  category.commands.forEach((command, index) => {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(renderCommandBlock(command, prefix))
    );
    if (index < category.commands.length - 1) container.addSeparatorComponents(separator());
  });

  return container;
}

export async function handleHelp(message: Message) {
  const settings = await getGuildSettings(message.guildId!);
  const prefix = settings.prefix || "!";

  return message.reply({
    components: [buildMainMenu(prefix, 1, message.author.id)],
    flags: MessageFlags.IsComponentsV2
  });
}

/** Routed from index.ts for any `help:*` button (module views + page navigation). */
export async function handleHelpInteraction(interaction: Interaction) {
  if (!interaction.isButton()) return;
  const button = interaction as ButtonInteraction;
  const id = button.customId;

  const settings = await getGuildSettings(button.guildId!);
  const prefix = settings.prefix || "!";

  // Module view → private ephemeral message; the shared main menu is untouched.
  if (id.startsWith(MODULE_PREFIX)) {
    const moduleId = id.slice(MODULE_PREFIX.length);
    const category = CATEGORIES.find((item) => item.id === moduleId);
    if (!category) {
      await button.reply({ content: "That module is no longer available.", flags: MessageFlags.Ephemeral });
      return;
    }
    await button.reply({
      components: [buildModuleView(category, prefix)],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
    });
    return;
  }

  // Page navigation → updates the menu in place. Only the person who opened it may page.
  if (id.startsWith(NAV_PREFIX)) {
    const [rawPage, authorId] = id.slice(NAV_PREFIX.length).split(":");
    if (button.user.id !== authorId) {
      await button.reply({
        content: `This menu belongs to someone else. Run \`${prefix}help\` to open your own.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    await button.update({
      components: [buildMainMenu(prefix, Number(rawPage) || 1, authorId)],
      flags: MessageFlags.IsComponentsV2
    });
    return;
  }
}
