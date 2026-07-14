import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { db, marketListingsTable, userCardsTable, cardsTable, playersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { getOrCreatePlayer } from "../lib/economy";

const PAGE_SIZE = 8;

export const data = new SlashCommandBuilder()
  .setName("market")
  .setDescription("Compra y vende cartas con monedas")
  .addSubcommand((sub) =>
    sub
      .setName("sell")
      .setDescription("Pone una de tus cartas en venta")
      .addIntegerOption((opt) => opt.setName("carta").setDescription("ID de tu carta (ver /inventory)").setRequired(true))
      .addIntegerOption((opt) => opt.setName("precio").setDescription("Precio en monedas").setRequired(true).setMinValue(1)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("Muestra los anuncios activos del mercado"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("buy")
      .setDescription("Compra un anuncio del mercado")
      .addIntegerOption((opt) => opt.setName("anuncio").setDescription("ID del anuncio").setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("cancel")
      .setDescription("Cancela uno de tus anuncios")
      .addIntegerOption((opt) => opt.setName("anuncio").setDescription("ID del anuncio").setRequired(true)),
  );

async function describeListing(listingId: number) {
  const rows = await db
    .select({
      id: marketListingsTable.id,
      price: marketListingsTable.price,
      sellerId: marketListingsTable.sellerId,
      memberName: cardsTable.memberName,
      groupName: cardsTable.groupName,
      rarity: cardsTable.rarity,
    })
    .from(marketListingsTable)
    .innerJoin(userCardsTable, eq(marketListingsTable.userCardId, userCardsTable.id))
    .innerJoin(cardsTable, eq(userCardsTable.cardId, cardsTable.id))
    .where(eq(marketListingsTable.id, listingId));
  return rows[0];
}

function buildListEmbed(
  listings: { id: number; price: number; sellerId: string; memberName: string; groupName: string }[],
  page: number,
  totalPages: number,
) {
  const start = page * PAGE_SIZE;
  const pageListings = listings.slice(start, start + PAGE_SIZE);
  const embed = new EmbedBuilder()
    .setColor(0xf2c9dc)
    .setTitle("🛒 Mercado de cartas")
    .setFooter({ text: `Página ${page + 1} de ${Math.max(totalPages, 1)}` });

  if (pageListings.length === 0) {
    embed.setDescription("No hay anuncios activos.");
  } else {
    embed.setDescription(
      pageListings
        .map((l) => `\`#${l.id}\` **${l.memberName}** — ${l.groupName} · ${l.price} monedas (vende <@${l.sellerId}>)`)
        .join("\n"),
    );
  }
  return embed;
}

function buildRow(page: number, totalPages: number) {
  const row = new ActionRowBuilder<ButtonBuilder>();
  row.addComponents(
    new ButtonBuilder().setCustomId(`market:${page - 1}`).setLabel("◀ Anterior").setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId(`market:${page + 1}`).setLabel("Siguiente ▶").setStyle(ButtonStyle.Secondary).setDisabled(page + 1 >= totalPages),
  );
  return row;
}

async function loadActiveListings() {
  return db
    .select({
      id: marketListingsTable.id,
      price: marketListingsTable.price,
      sellerId: marketListingsTable.sellerId,
      memberName: cardsTable.memberName,
      groupName: cardsTable.groupName,
    })
    .from(marketListingsTable)
    .innerJoin(userCardsTable, eq(marketListingsTable.userCardId, userCardsTable.id))
    .innerJoin(cardsTable, eq(userCardsTable.cardId, cardsTable.id))
    .where(eq(marketListingsTable.status, "active"))
    .orderBy(marketListingsTable.createdAt);
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "sell") {
    const cardInstanceId = interaction.options.getInteger("carta", true);
    const price = interaction.options.getInteger("precio", true);

    const owned = await db.query.userCardsTable.findFirst({
      where: (uc, { eq: eqOp, and: andOp }) => andOp(eqOp(uc.id, cardInstanceId), eqOp(uc.ownerId, interaction.user.id)),
    });
    if (!owned) {
      await interaction.reply({ content: `No tienes ninguna carta con el ID ${cardInstanceId}.`, ephemeral: true });
      return;
    }

    const alreadyListed = await db.query.marketListingsTable.findFirst({
      where: (l, { eq: eqOp, and: andOp }) => andOp(eqOp(l.userCardId, cardInstanceId), eqOp(l.status, "active")),
    });
    if (alreadyListed) {
      await interaction.reply({ content: "Esa carta ya está en venta.", ephemeral: true });
      return;
    }

    const [listing] = await db
      .insert(marketListingsTable)
      .values({ sellerId: interaction.user.id, userCardId: cardInstanceId, price })
      .returning();

    await interaction.reply({ content: `Anuncio #${listing!.id} creado por **${price}** monedas.` });
    return;
  }

  if (sub === "list") {
    const listings = await loadActiveListings();
    const totalPages = Math.max(Math.ceil(listings.length / PAGE_SIZE), 1);
    await interaction.reply({
      embeds: [buildListEmbed(listings, 0, totalPages)],
      components: [buildRow(0, totalPages)],
    });
    return;
  }

  if (sub === "buy") {
    const listingId = interaction.options.getInteger("anuncio", true);
    const listing = await describeListing(listingId);

    if (!listing) {
      await interaction.reply({ content: "No se encontró ese anuncio.", ephemeral: true });
      return;
    }

    const listingRow = await db.query.marketListingsTable.findFirst({ where: eq(marketListingsTable.id, listingId) });
    if (!listingRow || listingRow.status !== "active") {
      await interaction.reply({ content: "Ese anuncio ya no está disponible.", ephemeral: true });
      return;
    }

    if (listing.sellerId === interaction.user.id) {
      await interaction.reply({ content: "No puedes comprar tu propio anuncio.", ephemeral: true });
      return;
    }

    const buyer = await getOrCreatePlayer(interaction.user.id, interaction.user.username);
    if (buyer.coins < listing.price) {
      await interaction.reply({ content: `Necesitas ${listing.price} monedas y tienes ${buyer.coins}.`, ephemeral: true });
      return;
    }
    await getOrCreatePlayer(listing.sellerId, listing.sellerId);

    await db
      .update(playersTable)
      .set({ coins: sql`${playersTable.coins} - ${listing.price}` })
      .where(eq(playersTable.discordId, interaction.user.id));
    await db
      .update(playersTable)
      .set({ coins: sql`${playersTable.coins} + ${listing.price}` })
      .where(eq(playersTable.discordId, listing.sellerId));

    await db
      .update(userCardsTable)
      .set({ ownerId: interaction.user.id })
      .where(eq(userCardsTable.id, listingRow.userCardId));

    await db
      .update(marketListingsTable)
      .set({ status: "sold", soldAt: new Date(), buyerId: interaction.user.id })
      .where(eq(marketListingsTable.id, listingId));

    await interaction.reply({ content: `Compraste **${listing.memberName}** (${listing.groupName}) por ${listing.price} monedas.` });
    return;
  }

  if (sub === "cancel") {
    const listingId = interaction.options.getInteger("anuncio", true);
    const listing = await db.query.marketListingsTable.findFirst({ where: eq(marketListingsTable.id, listingId) });

    if (!listing || listing.sellerId !== interaction.user.id || listing.status !== "active") {
      await interaction.reply({ content: "No se encontró un anuncio activo tuyo con ese ID.", ephemeral: true });
      return;
    }

    await db.update(marketListingsTable).set({ status: "cancelled" }).where(eq(marketListingsTable.id, listingId));
    await interaction.reply({ content: `Anuncio #${listingId} cancelado.`, ephemeral: true });
  }
}

export async function handleMarketPage(interaction: ButtonInteraction, page: number) {
  const listings = await loadActiveListings();
  const totalPages = Math.max(Math.ceil(listings.length / PAGE_SIZE), 1);
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);

  await interaction.update({
    embeds: [buildListEmbed(listings, safePage, totalPages)],
    components: [buildRow(safePage, totalPages)],
  });
}
