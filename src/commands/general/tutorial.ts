import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ContainerBuilder,
  Interaction,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  Message,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";
import * as path from "path";
import { Mascot } from "../../config/branding";
import { getGuildPrefix } from "../../utils/guildContext";

const BANNER_NAME = "guide_banner.png";
const BANNER_URL = `attachment://${BANNER_NAME}`;
const MODULE_PREFIX = "tut:module:";
const NAV_PREFIX = "tut:nav:";
const PAGE_SIZE = 6;

interface SystemLesson {
  id: string;
  label: string;
  emote: string;
  teaser: string;
  howItWorks: string;
  howToUse: string[];
  tip: string;
  next?: string;
}

// 16 lessons mirroring the help modules, in progression-friendly order.
// {p} is replaced with the guild prefix at render time.
const LESSONS: SystemLesson[] = [
  {
    id: "economy",
    label: "Economy",
    emote: Mascot.Emotes.MoneyBag,
    teaser: "The money basics.",
    howItWorks: "Your wallet holds spending and gambling cash; the bank is safe storage. Your balance is global — the same across every server.",
    howToUse: ["`{p}balance` — check wallet, bank, net worth", "`{p}deposit <amount>` / `{p}withdraw <amount>`", "`{p}transfer @user <amount>` — pay someone"],
    tip: "Keep gambling money in your wallet and savings in the bank — robbers can only take your wallet.",
    next: "Full command list: `{p}help`",
  },
  {
    id: "banking",
    label: "Banking & Cards",
    emote: Mascot.Emotes.Bank,
    teaser: "Grow savings and unlock credit.",
    howItWorks: "Fixed and Recurring deposits earn interest over days. A Fortuna Card lets you spend on credit and is settled weekly.",
    howToUse: ["`{p}bank fd <amount> <days>` — open a Fixed Deposit", "`{p}card issue` — apply for a card", "`{p}mycards` — see balance and due date", "`{p}card pay <amount>` — pay it down"],
    tip: "Pay your card before the weekly due date to avoid delinquency and protect your credit score.",
    next: "Score details: `{p}credit` · Full list: `{p}help`",
  },
  {
    id: "rewards",
    label: "Rewards",
    emote: Mascot.Emotes.Lootbox,
    teaser: "Free money on a timer.",
    howItWorks: "Daily, weekly, and monthly claims plus voting rewards give you steady free income.",
    howToUse: ["`{p}daily` · `{p}weekly` · `{p}monthly`", "`{p}vote` — rewards for voting"],
    tip: "Turn on `{p}vote reminder` so you never miss a claim.",
    next: "Full command list: `{p}help`",
  },
  {
    id: "hustle",
    label: "Hustle, Crime & Jail",
    emote: Mascot.Emotes.Police,
    teaser: "Fast, risky cash.",
    howItWorks: "Crime and robbing pay well but can land you in jail; begging is low-risk. While jailed, most actions are blocked until you post bail.",
    howToUse: ["`{p}crime` — risky minigame payout", "`{p}rob @user` — steal from a wallet", "`{p}beg` — small safe income", "`{p}jail` then `{p}bail` if caught"],
    tip: "Bank your winnings between attempts — getting robbed or jailed only costs you what's exposed.",
    next: "Full command list: `{p}help`",
  },
  {
    id: "games",
    label: "Casino Games",
    emote: Mascot.Emotes.Casino,
    teaser: "Bet your wallet, win big.",
    howItWorks: "Every game uses wallet funds only, within set bet limits. Outcomes are luck-based with a house edge.",
    howToUse: ["`{p}coinflip <amount>` · `{p}slots <amount>`", "`{p}blackjack <amount>`", "`{p}bet <amount> <space>` — roulette"],
    tip: "Set a budget and stick to it — the house wins over time.",
    next: "Full game rules & payouts: `{p}casino`",
  },
  {
    id: "hunting",
    label: "Hunting & Zoo",
    emote: Mascot.Emotes.Gun,
    teaser: "Hunt, craft, collect.",
    howItWorks: "Buy a rifle, then hunt animals on a cooldown. Loot can be crafted into gear, and captures fill your zoo.",
    howToUse: ["`{p}shop hunt` — buy a rifle first", "`{p}hunt` — go hunting", "`{p}hunt craft` — craft from loot", "`{p}zoo` — view your animals"],
    tip: "Craft consumables like bait and camouflage to catch rarer animals.",
    next: "Full command list: `{p}help`",
  },
  {
    id: "shop",
    label: "Shop & Items",
    emote: Mascot.Emotes.Inventory,
    teaser: "Spend cash on gear.",
    howItWorks: "Category stores (general, hunt, job, uni, cock, cosmetics) sell items that go to your inventory; some are consumable or equippable.",
    howToUse: ["`{p}shop` — browse the store", "`{p}shop buy <item>` — buy with your wallet", "`{p}inventory` — see what you own", "`{p}use <item>` / `{p}equip <item>`"],
    tip: "Only buy on credit (`{p}shop buy card <item>`) if you can pay the card back.",
    next: "Full command list: `{p}help`",
  },
  {
    id: "market",
    label: "Black Market",
    emote: Mascot.Emotes.Trade,
    teaser: "Trade with other players.",
    howItWorks: "A player-to-player marketplace where you list and buy rare items. Fees apply to trades.",
    howToUse: ["`{p}market` — browse, list, and buy"],
    tip: "Compare a listing's total (including fees) against the shop price before buying.",
    next: "Full command list: `{p}help`",
  },
  {
    id: "stock",
    label: "Stock Market",
    emote: Mascot.Emotes.GraphUp,
    teaser: "Trade shares on one global market.",
    howItWorks: "Prices move every 30 minutes on news and events. Big orders pay slippage, and most blind trades lose money.",
    howToUse: ["`{p}stock` — view the market", "`{p}stock news` — rumors & events", "`{p}stock buy <symbol> <qty>`", "`{p}stock portfolio` — your holdings"],
    tip: "Read `{p}stock news` for rumors and steer clear of stocks heading for delisting.",
    next: "Your holdings: `{p}my-stocks` · Full list: `{p}help`",
  },
  {
    id: "realestate",
    label: "Real Estate",
    emote: Mascot.Emotes.Gem,
    teaser: "Passive rent income.",
    howItWorks: "Buy properties that generate rent over time, which you collect for steady passive income.",
    howToUse: ["`{p}properties` — browse what's available", "`{p}buy-property <key>` — purchase one", "`{p}collect-rent` — collect income", "`{p}my-properties` — what you own"],
    tip: "Reinvest rent into more properties to compound your passive income.",
    next: "Full command list: `{p}help`",
  },
  {
    id: "jobs",
    label: "Jobs & Career",
    emote: Mascot.Emotes.JobWorking,
    teaser: "A steady paycheck.",
    howItWorks: "Apply to a job, work shifts for income, and climb the career ladder. Working builds stress that you must manage.",
    howToUse: ["`{p}jobs` — browse jobs", "`{p}apply <job>` — apply", "`{p}work` — work a shift", "`{p}career` · `{p}relax` (clear stress)"],
    tip: "Earn degrees to qualify for higher-paying jobs, and use `{p}relax` before stress piles up.",
    next: "Full command list: `{p}help`",
  },
  {
    id: "education",
    label: "Education",
    emote: Mascot.Emotes.Graduate,
    teaser: "Degrees unlock better jobs.",
    howItWorks: "Enroll in a degree, study to gain XP, then pass the final exam to graduate. Progression is XP-based.",
    howToUse: ["`{p}education` — open the dashboard", "`{p}enroll <degree>` — start a program", "`{p}study` — gain XP", "`{p}exam` — graduate · `{p}degrees`"],
    tip: "Study regularly to reach the XP needed for finals — degrees give permanent perks.",
    next: "Full command list: `{p}help`",
  },
  {
    id: "marriage",
    label: "Marriage & Family",
    emote: Mascot.Emotes.Love,
    teaser: "Partner up and share a vault.",
    howItWorks: "Propose to and marry another player to unlock a joint vault and couple actions.",
    howToUse: ["`{p}marry @user` — propose", "`{p}family` — status & joint vault", "`{p}family deposit <amount>`", "`{p}divorce` — end it"],
    tip: "Use the joint vault to pool savings with a partner you trust.",
    next: "Full command list: `{p}help`",
  },
  {
    id: "quests",
    label: "Quests",
    emote: Mascot.Emotes.Scroll,
    teaser: "Daily goals for rewards.",
    howItWorks: "Daily quests and missions track your actions and pay out when you complete them.",
    howToUse: ["`{p}quests` — view and track your goals"],
    tip: "Check `{p}quests` early and plan your day's activities around them.",
    next: "Full command list: `{p}help`",
  },
  {
    id: "profile",
    label: "Profile & Leaderboards",
    emote: Mascot.Emotes.MedalGold,
    teaser: "Track progress and rank up.",
    howItWorks: "Your profile shows wealth, career, education, and relationship pages. Leaderboards rank players by net worth or cash.",
    howToUse: ["`{p}profile` — your full profile", "`{p}leaderboard` — net worth ranks", "`{p}leaderboard cash` — wallet ranks"],
    tip: "Net worth counts bank + investments + property minus card debt — pay debt to climb.",
    next: "Full command list: `{p}help`",
  },
  {
    id: "general",
    label: "General",
    emote: Mascot.Emotes.Settings,
    teaser: "Setup and guides.",
    howItWorks: "Onboarding, guides, and server settings live here.",
    howToUse: ["`{p}start` — create your profile", "`{p}help` — full command reference", "`{p}casino` — game rules", "`{p}set-prefix <prefix>` — change prefix"],
    tip: "New here? Run `{p}start`, then follow the New Player Path above.",
    next: "Full command list: `{p}help`",
  },
];

const NEW_PLAYER_PATH = [
  "**1. Claim free rewards** — `{p}daily`, `{p}weekly`, `{p}monthly`.",
  "**2. Earn your first money** — `{p}work`, `{p}crime`, or the casino.",
  "**3. Bank it & get a card** — `{p}bank`, then `{p}card issue`.",
  "**4. Pick a money-maker** — a job (`{p}jobs`), hunting (`{p}hunt`), or a degree (`{p}education`).",
  "**5. Invest & grow** — `{p}stock` and `{p}properties`.",
  "**6. Build your legacy** — `{p}marry`, climb `{p}leaderboard`, check `{p}profile`.",
];

const applyPrefix = (text: string, prefix: string) => text.replace(/\{p\}/g, prefix);

function separator() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

/** Public home: New Player Path + paginated system sections + banner + bottom nav. */
function buildTutorialHome(prefix: string, page: number, authorId: string): ContainerBuilder {
  const totalPages = Math.max(1, Math.ceil(LESSONS.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageLessons = LESSONS.slice(start, start + PAGE_SIZE);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${Mascot.Name} — How to Play\n` +
        `New here? Follow the path, then open any system to learn how it works.\n` +
        `**Server Prefix:** \`${prefix}\``
      )
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### New Player Path\n` + NEW_PLAYER_PATH.map((step) => applyPrefix(step, prefix)).join("\n")
      )
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Learn a System`));

  pageLessons.forEach((lesson, index) => {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`### ${lesson.emote} ${lesson.label}\n${applyPrefix(lesson.teaser, prefix)}`)
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(`${MODULE_PREFIX}${lesson.id}`)
            .setLabel("View")
            .setStyle(ButtonStyle.Secondary)
        )
    );
    if (index < pageLessons.length - 1) container.addSeparatorComponents(separator());
  });

  container
    .addSeparatorComponents(separator())
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(BANNER_URL).setDescription(`${Mascot.Name} guide banner`)
      )
    );

  if (totalPages > 1) {
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${NAV_PREFIX}${safePage - 1}:${authorId}`)
          .setLabel("Previous")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(safePage <= 1),
        new ButtonBuilder()
          .setCustomId("tut:page")
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

/** Ephemeral lesson view for one system, with separators between sections. */
function buildLessonView(lesson: SystemLesson, prefix: string): ContainerBuilder {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${lesson.emote} ${lesson.label}`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**How it works**\n${applyPrefix(lesson.howItWorks, prefix)}`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**How to use**\n` + lesson.howToUse.map((s) => `- ${applyPrefix(s, prefix)}`).join("\n"))
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Tip:** ${applyPrefix(lesson.tip, prefix)}`));

  if (lesson.next) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Where next:** ${applyPrefix(lesson.next, prefix)}`));
  }

  return container;
}

export async function handleTutorial(message: Message) {
  const prefix = await getGuildPrefix(message.guildId!);
  const bannerPath = path.join(process.cwd(), "src", "assets", BANNER_NAME);
  const attachment = new AttachmentBuilder(bannerPath, { name: BANNER_NAME });

  try {
    return await message.reply({
      components: [buildTutorialHome(prefix, 1, message.author.id)],
      files: [attachment],
      flags: MessageFlags.IsComponentsV2,
    });
  } catch (err) {
    console.error("Failed to send tutorial panel:", err);
    return message.reply("The tutorial could not be rendered. Check the bot logs.");
  }
}

/** Routed from index.ts for any `tut:*` button (lesson views + page navigation). */
export async function handleTutorialInteraction(interaction: Interaction) {
  if (!interaction.isButton()) return;
  const button = interaction as ButtonInteraction;
  const id = button.customId;
  const prefix = await getGuildPrefix(button.guildId!);

  if (id.startsWith(MODULE_PREFIX)) {
    const lessonId = id.slice(MODULE_PREFIX.length);
    const lesson = LESSONS.find((item) => item.id === lessonId);
    if (!lesson) {
      await button.reply({ content: "That lesson is no longer available.", flags: MessageFlags.Ephemeral });
      return;
    }
    await button.reply({
      components: [buildLessonView(lesson, prefix)],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }

  if (id.startsWith(NAV_PREFIX)) {
    const [rawPage, authorId] = id.slice(NAV_PREFIX.length).split(":");
    if (button.user.id !== authorId) {
      await button.reply({
        content: `This menu belongs to someone else. Run \`${prefix}tutorial\` to open your own.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await button.update({
      components: [buildTutorialHome(prefix, Number(rawPage) || 1, authorId)],
      flags: MessageFlags.IsComponentsV2,
    });
    return;
  }
}
