import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ButtonInteraction, User as DiscordUser } from "discord.js";
import prisma from "../../utils/prisma";
import { ensureUserAndWallet } from "../../services/walletService";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency } from "../../utils/format";
import { Mascot, getEmoteUrl } from "../../config/branding";
import { getJob, getJobPay } from "../../services/jobService";
import { getPortfolio } from "../../services/stockService";
import { PropertyService } from '../../services/propertyService';

export async function handleProfile(message: Message, args: string[]) {
  const targetUser = message.mentions.users.first() || message.author;
  const guildId = message.guildId!;

  try {
    // 1. Fetch Comprehensive Data
    const userDb = await prisma.user.findUnique({
      where: { discordId_guildId: { discordId: targetUser.id, guildId } },
      include: {
        wallet: true,
        bank: true,
        loans: true,
        degrees: { include: { degree: true } },
        inventory: { include: { shopItem: true } },
        workLogs: false // Don't need all logs
      }
    });

    if (!userDb) {
      await ensureUserAndWallet(targetUser.id, guildId, targetUser.username);
      return handleProfile(message, args); // Retry
    }

    const config = await getGuildConfig(guildId);
    const emoji = config.currencyEmoji;

    // 2. Financials
    const walletBal = userDb.wallet?.balance || 0;
    const bankBal = userDb.bank?.balance || 0;
    const loanDebt = userDb.loans.reduce((sum, loan) => sum + (loan.status === "ACTIVE" ? loan.totalRepayment : 0), 0);

    // Stock Portfolio
    const portfolio = await getPortfolio(guildId, targetUser.id);
    let stockValue = 0;
    if (portfolio) {
      stockValue = portfolio.holdings.reduce((sum, h) => sum + (h.stock.currentPrice * h.quantity), 0);
    }

    // Inventory Value
    const invValue = userDb.inventory.reduce((sum, item) => sum + (item.shopItem.price * item.amount), 0);

    // Net Worth
    const netWorth = walletBal + bankBal + stockValue + invValue - loanDebt;

    // 3. Career & Education
    let jobDisplay = "Unemployed";
    let salaryDisplay = "0";
    if (userDb.jobId) {
      const job = getJob(userDb.jobId);
      if (job) {
        const pay = await getJobPay(job, guildId);
        jobDisplay = `${job.emoji} ${job.title} (${job.sector})`;
        salaryDisplay = fmtCurrency(pay, emoji);
      }
    }

    const degrees = userDb.degrees.map(d => d.degree.name).join("\n") || "No Degrees";

    // 4. Chicken Stats
    const chickenItem = userDb.inventory.find(i => i.shopItem.name.toLowerCase() === "chicken");
    let chickenDisplay = "No Chicken";
    if (chickenItem) {
      const meta = (chickenItem.meta as any) || {};
      const level = meta.level || 0;
      const wins = meta.wins || 0;
      const name = meta.name || "Chicken";
      chickenDisplay = `${Mascot.Emotes.Chicken} ** ${name}** (Lvl ${level} | ${wins} Wins)`;
    }

    // 5. Construct Embed
    // 5. Property Stats
    const ownedProperties = await PropertyService.getOwnedProperties(targetUser.id, message.guildId!);
    const propertyCount = ownedProperties.length;
    const totalPropertyIncome = ownedProperties.reduce((sum, p) => sum + p.property.incomePerCycle, 0);

    // 6. Construct Embed
    const embed = new EmbedBuilder()
      .setColor(Mascot.Colors.Base as any)
      .setTitle(`${Mascot.Emotes.Success} User Profile: ${targetUser.username} `)
      .setThumbnail(targetUser.displayAvatarURL())
      .setDescription(`** Level ${userDb.level}** • ** ${userDb.xp} XP **\nCredit Score: ** ${userDb.creditScore}** `)

      .addFields(
        {
          name: `${Mascot.Emotes.MoneyBag} Wealth`,
          value: `
  ** Wallet:** ${fmtCurrency(walletBal, emoji)}
** Bank:** ${fmtCurrency(bankBal, emoji)}
** Stocks:** ${fmtCurrency(stockValue, emoji)}
** Net Worth:** ${fmtCurrency(netWorth, emoji)}
`,
          inline: true
        },
        {
          name: `${Mascot.Emotes.JobWorking} Career`,
          value: `
  ** Job:** ${jobDisplay}
** Salary:** ${salaryDisplay}/shift
  ** Shifts:** ${userDb.shiftsWorked}
** Stress:** ${userDb.jobStress}%
  `,
          inline: true
        },
        {
          name: `${Mascot.Emotes.Graduate} Education`,
          value: degrees,
          inline: false
        },
        {
          name: `${Mascot.Emotes.Graph} Assets & Liabilities`,
          value: `
  ** Inventory Value:** ${fmtCurrency(invValue, emoji)}
** Active Debt:** ${fmtCurrency(loanDebt, emoji)}
** Properties:** ${propertyCount} (Inc: ${fmtCurrency(totalPropertyIncome, emoji)})
** Chicken:** ${chickenDisplay}
`,
          inline: false
        }
      )
      .setFooter({ text: `${Mascot.Name} System • ID: ${targetUser.id} ` });


    // 6. Interactive Buttons (Optional drill-down)
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("prof_refresh").setLabel("Refresh").setStyle(ButtonStyle.Secondary).setEmoji("🔄")
    );

    const reply = await message.reply({ embeds: [embed], components: [row] });

    // Simple Refresh Collector
    const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });
    collector.on("collect", async (i) => {
      if (i.user.id !== message.author.id) return i.reply({ content: "Not your session.", ephemeral: true });
      if (i.customId === "prof_refresh") {
        await i.deferUpdate();
        handleProfile(message, args); // Recursive re-run (lazy refresh)
      }
    });

  } catch (e: any) {
    console.error("Profile Error:", e);
    message.reply({ embeds: [new EmbedBuilder().setColor("Red").setTitle("Error").setDescription("Failed to load profile.")] });
  }
}