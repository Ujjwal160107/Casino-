import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ContainerBuilder,
  Message,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";
import { Mascot } from "../../config/branding";
import {
  getOrCreateDailyQuest,
  claimQuestReward,
  rerollQuest,
  getStreakBonus,
  QuestTask,
} from "../../services/questService";

const QUEST_ACCENT = 0x9B59B6;
const E = Mascot.Emotes;

const DIFFICULTY_EMOJI: Record<string, string> = {
  EASY: E.Accept,
  MEDIUM: E.Alert,
  HARD: E.Decline,
};

const DIFFICULTY_LABEL: Record<string, string> = {
  EASY: "Easy",
  MEDIUM: "Medium",
  HARD: "Hard",
};

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

function progressBar(progress: number, target: number): string {
  const pct = Math.min(1, progress / target);
  const filled = Math.round(pct * 10);
  const empty = 10 - filled;
  return `${E.XpFull.repeat(filled)}${E.XpEmpty.repeat(empty)}`;
}

export async function handleDailyQuest(message: Message, args: string[]) {
  const discordId = message.author.id;
  const quest = await getOrCreateDailyQuest(discordId);
  const tasks = quest.tasks as unknown as QuestTask[];
  const prisma = (await import("../../utils/prisma")).default;
  const user = await prisma.user.findUnique({ where: { discordId } });
  const streak = user?.questStreak ?? 0;
  const bonusPct = getStreakBonus(streak);

  const expiresUnix = Math.floor(quest.expiresAt.getTime() / 1000);
  const totalAvailable = tasks.reduce((s, t) => s + t.reward, 0);
  const completedCount = tasks.filter(t => t.completed).length;
  const allDone = completedCount === tasks.length;
  const rerolls = (quest as any).rerollsUsed ?? 0;
  const freeRerollAvailable = rerolls === 0;

  const container = new ContainerBuilder()
    .setAccentColor(QUEST_ACCENT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${E.Scroll} Daily Quests`),
      new TextDisplayBuilder().setContent(
        `${E.Sparks} **Streak:** ${streak} day${streak !== 1 ? "s" : ""}${bonusPct > 0 ? ` (+${Math.round(bonusPct * 100)}% bonus)` : ""}\n` +
        `${E.Cooldown} Expires <t:${expiresUnix}:R>\n` +
        `-# ${completedCount}/${tasks.length} completed | ${E.Currency} ${fmt(totalAvailable)} available${bonusPct > 0 ? ` + ${Math.round(bonusPct * 100)}% streak` : ""}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const dEmoji = DIFFICULTY_EMOJI[task.difficulty] ?? E.Alert;
    const dLabel = DIFFICULTY_LABEL[task.difficulty] ?? "?";
    const status = task.completed ? E.Accept : E.Lock;
    const bar = progressBar(task.progress, task.target);

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${status} ${dEmoji} **${dLabel}** — ${task.description}\n` +
        `${bar} ${task.progress}/${task.target} | ${E.Currency} ${fmt(task.reward)}`,
      ),
    );
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small));
  }

  const buttons: ButtonBuilder[] = [];

  if (allDone && !quest.rewardClaimed) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`quest_claim:${discordId}`)
        .setLabel(`Claim ${fmt(totalAvailable + Math.floor(totalAvailable * bonusPct))}`)
        .setStyle(ButtonStyle.Success),
    );
  }

  if (!allDone && rerolls < 3) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`quest_reroll:${discordId}`)
        .setLabel(freeRerollAvailable ? "Reroll (Free)" : "Reroll (50k)")
        .setStyle(ButtonStyle.Secondary),
    );
  }

  if (quest.rewardClaimed) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`\n${E.Accept} **Reward claimed!** Next quest <t:${expiresUnix}:R>.`),
    );
  }

  const components: any[] = [container];
  if (buttons.length > 0) {
    components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons));
  }

  const reply = await message.reply({ components, flags: MessageFlags.IsComponentsV2 });

  if (buttons.length === 0) return;

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
    filter: (i) => i.user.id === discordId,
  });

  collector.on("collect", async (i) => {
    if (i.customId === `quest_claim:${discordId}`) {
      try {
        const result = await claimQuestReward(discordId);
        const msg = [
          `${E.Accept} **Reward Claimed!**`,
          `${E.Currency} **+${fmt(result.totalReward)}** coins`,
          result.streakBonus > 0 ? `${E.Sparks} Streak bonus: +${fmt(result.streakBonus)} (${Math.round(getStreakBonus(result.newStreak) * 100)}%)` : "",
          `${E.MedalGold} Streak: **${result.newStreak}** days`,
        ].filter(Boolean).join("\n");

        const claimContainer = new ContainerBuilder()
          .setAccentColor(0x2ECC71)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ${E.Scroll} Quest Complete`),
            new TextDisplayBuilder().setContent(msg),
          );

        await i.update({ components: [claimContainer], flags: MessageFlags.IsComponentsV2 });
      } catch (err) {
        await i.reply({ content: (err as Error).message, ephemeral: true });
      }
      collector.stop();
    }

    if (i.customId === `quest_reroll:${discordId}`) {
      const incomplete = tasks.findIndex(t => !t.completed);
      if (incomplete === -1) {
        await i.reply({ content: "All quests are complete!", ephemeral: true });
        return;
      }

      try {
        const newTask = await rerollQuest(discordId, incomplete);
        await i.reply({
          content: `${E.Refresh} Rerolled quest #${incomplete + 1} → **${newTask.description}** (${newTask.target}x, ${DIFFICULTY_LABEL[newTask.difficulty]})`,
          ephemeral: true,
        });
      } catch (err) {
        await i.reply({ content: (err as Error).message, ephemeral: true });
      }
    }
  });
}
