import { Message, EmbedBuilder } from "discord.js";
import { getGuildConfig } from "../../services/guildConfigService";
import { infoEmbed, errorEmbed } from "../../utils/embed";
import { canExecuteAdminCommand } from "../../utils/permissionUtils";
import { Mascot } from "../../config/branding";
import { formatDuration } from "../../utils/duration";
import prisma from "../../utils/prisma";

export async function handleAdminViewConfig(message: Message, args: string[]) {
  try {
    if (!message.member || !(await canExecuteAdminCommand(message, message.member))) {
      return message.reply({ embeds: [errorEmbed(message.author, "No Permission", "Admins or Bot Commanders only.")] });
    }

    const cfg = await getGuildConfig(message.guildId!);

    // Formatting Helpers
    const formatPct = (val: number | undefined | null) => `${val ?? 0}%`;
    const formatLimit = (val: number | undefined | null) => val ? val.toLocaleString('en-US') : "Unlimited";
    const formatMoney = (val: number) => `${cfg.currencyEmoji} ${val.toLocaleString('en-US')}`;

    // Job Formatters
    const sectors = cfg.jobSectorBasePay as Record<string, number> || {};
    const levels = cfg.jobLevelMultipliers as Record<string, number> || {};

    const sectorText = Object.keys(sectors).length > 0
      ? Object.entries(sectors).map(([k, v]) => `• **${k.charAt(0).toUpperCase() + k.slice(1)}**: ${formatMoney(v)}`).join("\n")
      : "Using Defaults";

    const levelText = Object.keys(levels).length > 0
      ? Object.entries(levels).map(([k, v]) => `• **${k}**: ${v}x`).join("\n")
      : "Using Defaults";

    // Cooldowns
    const gameCds = cfg.gameCooldowns as Record<string, number> || {};
    const globalGameCd = gameCds["global"] || 0;
    const specificGameCds = Object.entries(gameCds)
      .filter(([k]) => k !== "global")
      .map(([k, v]) => `• **${k.charAt(0).toUpperCase() + k.slice(1)}**: ${formatDuration(v)}`)
      .join("\n");

    // Income Configs
    const incomeCfgs = await prisma.incomeConfig.findMany({ where: { guildId: message.guildId! } });
    const incomeMap = new Map(incomeCfgs.map(i => [i.commandKey, i]));
    const formatIncome = (cmd: string) => {
      const c = incomeMap.get(cmd);
      if (!c) return `Default`;
      return `${formatDuration(c.cooldown)} | ${cfg.currencyEmoji}${c.minPay}-${c.maxPay}`;
    };

    const embed = new EmbedBuilder()
      .setTitle(`${Mascot.Emotes.Think} Server Configuration`)
      .setDescription(`Current settings for **${message.guild!.name}**`)
      .addFields(
        {
          name: `${Mascot.Emotes.MoneyBag} Economy`,
          value: `**Currency:** ${cfg.currencyEmoji} ${cfg.currencyName}
**Start Money:** ${formatMoney(cfg.startMoney)}
**Tax (Transfer/Income):** ${formatPct(cfg.transferTax)} / ${formatPct(cfg.incomeTax)}
**Market Tax:** ${formatPct(cfg.marketTax)}
**Bank Limit:** ${formatLimit(cfg.bankLimit)}
**Wallet Limit:** ${formatLimit(cfg.walletLimit)}
**Interest (Loan/FD/RD):** ${formatPct(cfg.loanInterestRate)} / ${formatPct(cfg.fdInterestRate)} / ${formatPct(cfg.rdInterestRate)}`,
          inline: true
        },


        {
          name: `${Mascot.Emotes.Alert} Crime`,
          value: `**Rob Success:** ${formatPct(cfg.robSuccessPct)}
**Rob Fine:** ${formatPct(cfg.robFinePct)}
**Rob Cooldown:** ${formatDuration(cfg.robCooldown)}`,
          inline: true
        },
        {
          name: `${Mascot.Emotes.MoneyBag} Income Settings`,
          value: `**Work:** ${formatIncome("work")}
**Crime:** ${formatIncome("crime")}
**Beg:** ${formatIncome("beg")}
**Slut:** ${formatIncome("slut")}`,
          inline: true
        },
        {
          name: `${Mascot.Emotes.Money} Gambling`,
          value: `**Min Bet:** ${formatMoney(cfg.minBet)}
**Max Bet:** ${formatLimit(cfg.maxBet)}
**Global Cooldown:** ${formatDuration(globalGameCd)}
${specificGameCds}`,
          inline: true
        },
        {
          name: `${Mascot.Emotes.JobWorking} Jobs`,
          value: `**Base Salaries:**
${sectorText}

**Level Multipliers:**
${levelText}`,
          inline: false
        },
        {
          name: `${Mascot.Emotes.Teacher} Education`,
          value: `**Study Cooldown:** ${formatDuration(cfg.studyCooldown)}`,
          inline: true
        },
        {
          name: `${Mascot.Emotes.Graph} Credit System`,
          value: `**Max Score:** ${cfg.maxCreditScore}
**Score Reward:** +${cfg.creditScoreReward}
**Score Penalty:** -${cfg.creditScorePenalty}
**Max Active Loans:** ${cfg.maxActiveLoans}`,
          inline: false
        }
      )
      .setColor(Mascot.Colors.Base as any)
      .setFooter({ text: "Use !setup to change these settings" });

    return message.reply({ embeds: [embed] });

  } catch (err) {
    console.error("handleAdminViewConfig error:", err);
    return message.reply({ embeds: [errorEmbed(message.author, "Internal Error", "Failed to fetch config.")] });
  }
}