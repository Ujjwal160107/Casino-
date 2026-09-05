import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ContainerBuilder,
  Message,
  MessageFlags,
  ModalBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { Mascot } from "../../config/branding";
import { nextStepHint } from "../../config/nextSteps";
import {
  ensureDeferredEphemeralReply,
  ensureDeferredUpdate,
  replyEphemeralAfterWork,
  safeEditReply,
  safeReply,
  safeUpdate,
} from "../../utils/interactionHelpers";
import {
  getListings,
  getUserListings,
  getUserInventoryForSale,
  listItem,
  buyListing,
  cancelListing,
  calculateFees,
} from "../../services/marketService";
import {
  buyHuntPartListing,
  cancelHuntPartListing,
  formatPartName,
  getHuntPartListings,
  getUserHuntPartListings,
} from "../../services/huntPartService";
import { notifyMarketSale } from "../../services/dmNoticeService";

const BM_ACCENT = 0x2C2F33;
const BM_SUCCESS = 0x2ECC71;
const BM_ERROR = 0xE74C3C;
const BM_WARN = 0xF39C12;
const BM_FLAGS = MessageFlags.IsComponentsV2 as const;

const E = Mascot.Emotes;

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

function separator() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

function softSeparator() {
  return new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small);
}

function bmContainer(title: string, body: string, accent = BM_ACCENT) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}`),
      new TextDisplayBuilder().setContent(body),
    );
}

export async function handleMarket(message: Message, args: string[]) {
  if (!message.guild) return;
  const ownerId = message.author.id;

  const { total } = await getListings(1, 1);

  const hubContainer = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${E.Market} Black Market`),
      new TextDisplayBuilder().setContent(
        `The underground marketplace.\n` +
        `Trade items with players across all servers.`,
      ),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${E.Scroll} **Active Listings:** ${total}\n` +
        `${E.Price} **Fees:** 5% buyer + 10% seller\n` +
        `${E.Cooldown} **Expiry:** 7 days\n` +
        `${E.Lock} **Max:** 5 listings per user\n` +
        `${E.Alert} **Wallet only** — no credit cards`,
      ),
    );

  const hubRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`bm_browse:1:${ownerId}`)
      .setLabel("Browse")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`bm_parts:1:${ownerId}`)
      .setLabel("Animal Parts")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`bm_sell:${ownerId}`)
      .setLabel("Sell Item")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`bm_my:${ownerId}`)
      .setLabel("My Listings")
      .setStyle(ButtonStyle.Secondary),
  );

  const reply = await message.reply({
    components: [hubContainer, hubRow],
    flags: BM_FLAGS,
  });

  const collector = reply.createMessageComponentCollector({ time: 300_000 });

  collector.on("collect", async (interaction) => {
    const customId = interaction.customId;
    const isOwner = interaction.user.id === ownerId;

    // --- BROWSE ---
    if (customId.startsWith("bm_browse:") && customId.endsWith(`:${ownerId}`)) {
      if (!isOwner) { await safeReply(interaction, { content: "Not yours.", flags: MessageFlags.Ephemeral }); return; }
      const page = parseInt(customId.split(":")[1], 10) || 1;
      await replyEphemeralAfterWork(interaction, BM_FLAGS | MessageFlags.Ephemeral, async () => {
        const { listings, total, totalPages } = await getListings(page, 5);

        if (listings.length === 0) {
          return {
            components: [bmContainer(`${E.Market} Black Market`, `${E.Confused} No active listings. Be the first to sell!`)],
          };
        }

        const container = new ContainerBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ${E.Market} Black Market`),
            new TextDisplayBuilder().setContent(`-# Page ${page}/${totalPages} ${E.Scroll} ${total} listings`),
          )
          .addSeparatorComponents(separator());

        for (const listing of listings) {
          const itemName = (listing.shopItem as any)?.name ?? "Unknown";
          const sellerName = (listing.seller as any)?.username ?? "Unknown";
          const fees = calculateFees(listing.totalPrice);
          const expiresUnix = Math.floor(listing.expiresAt.getTime() / 1000);

          container.addSectionComponents(
            new SectionBuilder()
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**${itemName}** x${listing.amount}`),
                new TextDisplayBuilder().setContent(
                  `${E.Price} **${fmt(fees.buyerTotal)}** ${E.Currency}\n` +
                  `-# Listed: ${fmt(listing.totalPrice)} + ${fmt(fees.buyerFee)} fee\n` +
                  `-# Seller: ${sellerName} ${E.Cooldown} <t:${expiresUnix}:R>`,
                ),
              )
              .setButtonAccessory(
                new ButtonBuilder()
                  .setCustomId(`bm_buy:${listing.id}:${ownerId}`)
                  .setLabel(`${fmt(fees.buyerTotal)}`)
                  .setStyle(ButtonStyle.Success),
              ),
          );
          container.addSeparatorComponents(softSeparator());
        }

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(nextStepHint("market")!));

        const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`bm_browse:${page - 1}:${ownerId}`)
            .setLabel("Previous")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 1),
          new ButtonBuilder()
            .setCustomId(`bm_browse:${page + 1}:${ownerId}`)
            .setLabel("Next")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages),
        );

        return { components: [container, navRow] };
      });
      return;
    }

    // --- ANIMAL PARTS BROWSE ---
    if (customId.startsWith("bm_parts:") && customId.endsWith(`:${ownerId}`)) {
      if (!isOwner) { await safeReply(interaction, { content: "Not yours.", flags: MessageFlags.Ephemeral }); return; }
      const page = parseInt(customId.split(":")[1], 10) || 1;
      await replyEphemeralAfterWork(interaction, BM_FLAGS | MessageFlags.Ephemeral, async () => {
        const { listings, total, totalPages } = await getHuntPartListings(page, 5);

        if (listings.length === 0) {
          return {
            components: [bmContainer(`${E.Market} Animal Parts`, `${E.Confused} No animal parts are listed right now.`)],
          };
        }

        const container = new ContainerBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ${E.Market} Animal Parts`),
            new TextDisplayBuilder().setContent(`-# Page ${page}/${totalPages} ${E.Scroll} ${total} part listings`),
          )
          .addSeparatorComponents(separator());

        for (const listing of listings) {
          const fees = calculateFees(listing.totalPrice);
          const expiresUnix = Math.floor(listing.expiresAt.getTime() / 1000);
          container.addSectionComponents(
            new SectionBuilder()
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**${listing.partName}** x${listing.amount}`),
                new TextDisplayBuilder().setContent(
                  `${E.Price} **${fmt(fees.buyerTotal)}** ${E.Currency}\n` +
                  `-# Listed: ${fmt(listing.totalPrice)} + ${fmt(fees.buyerFee)} fee\n` +
                  `-# Seller: <@${listing.sellerId}> ${E.Cooldown} <t:${expiresUnix}:R>`,
                ),
              )
              .setButtonAccessory(
                new ButtonBuilder()
                  .setCustomId(`bm_part_buy:${listing.id}:${ownerId}`)
                  .setLabel(`${fmt(fees.buyerTotal)}`)
                  .setStyle(ButtonStyle.Success),
              ),
          );
          container.addSeparatorComponents(softSeparator());
        }

        const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`bm_parts:${page - 1}:${ownerId}`)
            .setLabel("Previous")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 1),
          new ButtonBuilder()
            .setCustomId(`bm_parts:${page + 1}:${ownerId}`)
            .setLabel("Next")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages),
        );

        return { components: [container, navRow] };
      });
      return;
    }

    if (customId.startsWith("bm_part_buy:") && customId.endsWith(`:${ownerId}`)) {
      if (!isOwner) return;
      const listingId = customId.split(":")[1];

      try {
        const prisma = (await import("../../utils/prisma")).default;
        const listing = await prisma.huntPartListing.findUnique({ where: { id: listingId } });
        if (!listing) {
          await interaction.reply({ components: [bmContainer(`${E.Alert} Unavailable`, "This part listing is no longer available.", BM_ERROR)], flags: BM_FLAGS | MessageFlags.Ephemeral });
          return;
        }

        const fees = calculateFees(listing.totalPrice);
        const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`bm_part_buy_confirm:${listingId}:${ownerId}`)
            .setLabel("Confirm Purchase")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`bm_buy_cancel:${ownerId}`)
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Secondary),
        );

        await interaction.reply({
          components: [
            bmContainer(
              `${E.Alert} Confirm Part Purchase`,
              `**${formatPartName(listing.partKey)}** (x${listing.amount})\n\n` +
              `${E.Price} Listed Price: **${fmt(listing.totalPrice)}** ${E.Currency}\n` +
              `${E.Alert} Buyer Fee (5%): +**${fmt(fees.buyerFee)}**\n` +
              `${E.MoneyBag} **Total: ${fmt(fees.buyerTotal)}** ${E.Currency}`,
              BM_WARN,
            ),
            confirmRow,
          ],
          flags: BM_FLAGS | MessageFlags.Ephemeral,
        });
      } catch (err) {
        await interaction.reply({ components: [bmContainer(`${E.Decline} Error`, (err as Error).message, BM_ERROR)], flags: BM_FLAGS | MessageFlags.Ephemeral });
      }
      return;
    }

    if (customId.startsWith("bm_part_buy_confirm:") && customId.endsWith(`:${ownerId}`)) {
      if (!isOwner) return;
      const listingId = customId.split(":")[1];

      try {
        await interaction.deferUpdate();
        const result = await buyHuntPartListing(ownerId, listingId);
        void notifyMarketSale(interaction.client, { ...result, name: result.partName });
        await interaction.editReply({
          components: [bmContainer(
            `${E.Accept} Part Purchase Complete`,
            `${E.Inventory} **${result.partName}** (x${result.amount}) added to Hunt Materials.\n\n` +
            `${E.Currency} Paid: **${fmt(result.fees.buyerTotal)}**`,
            BM_SUCCESS,
          )],
          flags: BM_FLAGS,
        });
      } catch (err) {
        await interaction.editReply({
          components: [bmContainer(`${E.Decline} Purchase Failed`, (err as Error).message, BM_ERROR)],
          flags: BM_FLAGS,
        });
      }
      return;
    }

    // --- BUY CONFIRMATION ---
    if (customId.startsWith("bm_buy:") && customId.endsWith(`:${ownerId}`)) {
      if (!isOwner) return;
      const listingId = customId.split(":")[1];

      try {
        const prisma = (await import("../../utils/prisma")).default;
        const listing = await prisma.marketListing.findUnique({
          where: { id: listingId },
          include: { shopItem: true },
        });
        if (!listing) {
          await interaction.reply({ components: [bmContainer(`${E.Alert} Unavailable`, "This listing is no longer available.", BM_ERROR)], flags: BM_FLAGS | MessageFlags.Ephemeral });
          return;
        }

        const itemName = listing.shopItem?.name ?? "Unknown";
        const fees = calculateFees(listing.totalPrice);

        const confirmContainer = new ContainerBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ${E.Alert} Confirm Purchase`),
            new TextDisplayBuilder().setContent(
              `**${itemName}** (x${listing.amount})\n\n` +
              `${E.Price} Listed Price: **${fmt(listing.totalPrice)}** ${E.Currency}\n` +
              `${E.Alert} Buyer Fee (5%): +**${fmt(fees.buyerFee)}**\n` +
              `${E.MoneyBag} **Total: ${fmt(fees.buyerTotal)}** ${E.Currency}`,
            ),
          );

        const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`bm_buy_confirm:${listingId}:${ownerId}`)
            .setLabel("Confirm Purchase")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`bm_buy_cancel:${ownerId}`)
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Secondary),
        );

        await interaction.reply({ components: [confirmContainer, confirmRow], flags: BM_FLAGS | MessageFlags.Ephemeral });
      } catch (err) {
        await interaction.reply({ components: [bmContainer(`${E.Decline} Error`, (err as Error).message, BM_ERROR)], flags: BM_FLAGS | MessageFlags.Ephemeral });
      }
      return;
    }

    // --- BUY EXECUTE ---
    if (customId.startsWith("bm_buy_confirm:") && customId.endsWith(`:${ownerId}`)) {
      if (!isOwner) return;
      const listingId = customId.split(":")[1];

      try {
        await interaction.deferUpdate();
        const result = await buyListing(ownerId, listingId);
        void notifyMarketSale(interaction.client, { ...result, name: result.itemName });

        const successContainer = new ContainerBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ${E.Accept} Purchase Complete`),
            new TextDisplayBuilder().setContent(
              `${E.Inventory} **${result.itemName}** (x${result.amount}) added to inventory\n\n` +
              `${E.Currency} Paid: **${fmt(result.fees.buyerTotal)}**\n` +
              `-# ${fmt(result.fees.listedPrice)} + ${fmt(result.fees.buyerFee)} market fee`,
            ),
          );

        await interaction.editReply({ components: [successContainer], flags: BM_FLAGS });
      } catch (err) {
        await interaction.editReply({
          components: [bmContainer(`${E.Decline} Purchase Failed`, (err as Error).message, BM_ERROR)],
          flags: BM_FLAGS,
        });
      }
      return;
    }

    if (customId.startsWith("bm_buy_cancel:")) {
      await interaction.update({
        components: [bmContainer(`${E.Accept} Cancelled`, "Purchase cancelled. No coins deducted.")],
        flags: BM_FLAGS,
      });
      return;
    }

    // --- SELL FLOW ---
    if (customId === `bm_sell:${ownerId}`) {
      if (!isOwner) return;
      const items = await getUserInventoryForSale(ownerId);

      if (items.length === 0) {
        await interaction.reply({
          components: [bmContainer(`${E.Inventory} No Items`, "You have no sellable items.\n-# Unique items (chickens) cannot be listed.")],
          flags: BM_FLAGS | MessageFlags.Ephemeral,
        });
        return;
      }

      const options = items.slice(0, 25).map((item) => ({
        label: `${item.shopItem?.name ?? "Unknown"} (x${item.amount})`,
        value: item.shopItemId ?? item.id,
        description: `Own: ${item.amount}`,
      }));

      const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`bm_sell_select:${ownerId}`)
          .setPlaceholder("Select item to sell...")
          .addOptions(options),
      );

      await interaction.reply({
        components: [
          bmContainer(`${E.Trade} Sell Item`, `Select an item to list on the black market.\n\n-# ${E.Alert} Seller fee: 10% of listed price.`),
          selectRow,
        ],
        flags: BM_FLAGS | MessageFlags.Ephemeral,
      });
      return;
    }

    // --- SELL SELECT ---
    if (customId === `bm_sell_select:${ownerId}` && interaction.isStringSelectMenu()) {
      if (!isOwner) return;
      const shopItemId = interaction.values[0];

      const modal = new ModalBuilder()
        .setCustomId(`bm_sell_modal:${shopItemId}:${ownerId}`)
        .setTitle("List on Black Market");

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("quantity")
            .setLabel("Quantity")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("1")
            .setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("price")
            .setLabel("Total Price (buyers see this + 5% fee)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("100000")
            .setRequired(true),
        ),
      );

      await interaction.showModal(modal);

      try {
        const submit = await interaction.awaitModalSubmit({ time: 60_000 });
        const quantity = parseInt(submit.fields.getTextInputValue("quantity"), 10);
        const price = parseInt(submit.fields.getTextInputValue("price"), 10);

        if (isNaN(quantity) || quantity <= 0) {
          await submit.reply({ components: [bmContainer(`${E.Decline} Error`, "Invalid quantity.", BM_ERROR)], flags: BM_FLAGS | MessageFlags.Ephemeral });
          return;
        }
        if (isNaN(price) || price <= 0) {
          await submit.reply({ components: [bmContainer(`${E.Decline} Error`, "Invalid price.", BM_ERROR)], flags: BM_FLAGS | MessageFlags.Ephemeral });
          return;
        }

        const result = await listItem(ownerId, shopItemId, quantity, price);
        const fees = result.fees;

        const successContainer = new ContainerBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ${E.Accept} Listed Successfully`),
            new TextDisplayBuilder().setContent(
              `${E.Inventory} **${result.itemName}** (x${result.amount})\n\n` +
              `${E.Price} Listed at: **${fmt(result.totalPrice)}** ${E.Currency}\n` +
              `${E.MoneyBag} You'll receive: **${fmt(fees.sellerPayout)}** (after 10% fee)\n` +
              `${E.Currency} Buyer pays: **${fmt(fees.buyerTotal)}** (includes 5% fee)\n\n` +
              `-# ${E.Cooldown} Expires in 7 days. Cancel anytime from My Listings.`,
            ),
          );

        await submit.reply({ components: [successContainer], flags: BM_FLAGS | MessageFlags.Ephemeral });
      } catch (err: any) {
        if (err.code === "InteractionCollectorError") return;
      }
      return;
    }

    // --- MY LISTINGS ---
    if (customId === `bm_my:${ownerId}`) {
      if (!isOwner) return;
      const [listings, partListings] = await Promise.all([
        getUserListings(ownerId),
        getUserHuntPartListings(ownerId),
      ]);

      if (listings.length === 0 && partListings.length === 0) {
        await interaction.reply({
          components: [bmContainer(`${E.Inventory} My Listings`, `${E.Confused} You have no active listings.`)],
          flags: BM_FLAGS | MessageFlags.Ephemeral,
        });
        return;
      }

      const container = new ContainerBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${E.Inventory} My Listings (${listings.length + partListings.length}/5)`),
        )
        .addSeparatorComponents(separator());

      for (const listing of listings) {
        const itemName = listing.shopItem?.name ?? "Unknown";
        const expiresUnix = Math.floor(listing.expiresAt.getTime() / 1000);
        const fees = calculateFees(listing.totalPrice);

        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`**${itemName}** (x${listing.amount})`),
              new TextDisplayBuilder().setContent(
                `${E.Price} ${fmt(listing.totalPrice)} ${E.Currency} ${E.MoneyBag} You get: ${fmt(fees.sellerPayout)}\n` +
                `-# ${E.Cooldown} <t:${expiresUnix}:R>`,
              ),
            )
            .setButtonAccessory(
              new ButtonBuilder()
                .setCustomId(`bm_cancel:${listing.id}:${ownerId}`)
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Danger),
            ),
        );
        container.addSeparatorComponents(softSeparator());
      }

      for (const listing of partListings) {
        const expiresUnix = Math.floor(listing.expiresAt.getTime() / 1000);
        const fees = calculateFees(listing.totalPrice);

        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`**${listing.partName}** (x${listing.amount})`),
              new TextDisplayBuilder().setContent(
                `${E.Price} ${fmt(listing.totalPrice)} ${E.Currency} ${E.MoneyBag} You get: ${fmt(fees.sellerPayout)}\n` +
                `-# Animal Part ${E.Cooldown} <t:${expiresUnix}:R>`,
              ),
            )
            .setButtonAccessory(
              new ButtonBuilder()
                .setCustomId(`bm_part_cancel:${listing.id}:${ownerId}`)
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Danger),
            ),
        );
        container.addSeparatorComponents(softSeparator());
      }

      await interaction.reply({ components: [container], flags: BM_FLAGS | MessageFlags.Ephemeral });
      return;
    }

    if (customId.startsWith("bm_part_cancel:") && customId.endsWith(`:${ownerId}`)) {
      if (!isOwner) return;
      const listingId = customId.split(":")[1];

      try {
        const result = await cancelHuntPartListing(ownerId, listingId);
        await interaction.reply({
          components: [bmContainer(`${E.Accept} Cancelled`, `${E.Inventory} ${result.partName} x${result.amount} returned to Hunt Materials.`, BM_SUCCESS)],
          flags: BM_FLAGS | MessageFlags.Ephemeral,
        });
      } catch (err) {
        await interaction.reply({
          components: [bmContainer(`${E.Decline} Error`, (err as Error).message, BM_ERROR)],
          flags: BM_FLAGS | MessageFlags.Ephemeral,
        });
      }
      return;
    }

    // --- CANCEL LISTING ---
    if (customId.startsWith("bm_cancel:") && customId.endsWith(`:${ownerId}`)) {
      if (!isOwner) return;
      const listingId = customId.split(":")[1];

      try {
        await cancelListing(ownerId, listingId);
        await interaction.reply({
          components: [bmContainer(`${E.Accept} Cancelled`, `${E.Inventory} Item returned to your inventory.`, BM_SUCCESS)],
          flags: BM_FLAGS | MessageFlags.Ephemeral,
        });
      } catch (err) {
        await interaction.reply({
          components: [bmContainer(`${E.Decline} Error`, (err as Error).message, BM_ERROR)],
          flags: BM_FLAGS | MessageFlags.Ephemeral,
        });
      }
      return;
    }
  });
}
