import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { db, cardsTable, userCardsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getOrCreatePlayer } from "../lib/economy";
import { RARITY_LABELS } from "../lib/cards";

export const data = new SlashCommandBuilder()
  .setName("profile")
  .setDescription("Muestra el perfil de coleccionista de alguien")
  .addUserOption((opt) =>
    opt.setName("usuario").setDescription("Ver el perfil de otra persona").setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("usuario") ?? interaction.user;
  const player = await getOrCreatePlayer(target.id, target.username);

  const ownedCards = await db
    .select({
      cardId: cardsTable.id,
      memberName: cardsTable.memberName,
      groupName: cardsTable.groupName,
      rarity: cardsTable.rarity,
    })
    .from(userCardsTable)
    .innerJoin(cardsTable, eq(userCardsTable.cardId, cardsTable.id))
    .where(eq(userCardsTable.ownerId, target.id));

  const totalCopies = ownedCards.length;
  const distinctDesigns = new Set(ownedCards.map((c) => c.cardId)).size;
  const [totalCatalog] = await db.select({ count: sql<number>`count(*)` }).from(cardsTable);

  const rarityRank = { legendary: 3, epic: 2, rare: 1, common: 0 };
  const rarest = ownedCards.sort((a, b) => rarityRank[b.rarity] - rarityRank[a.rarity])[0];

  const embed = new EmbedBuilder()
    .setColor(0xf2c9dc)
    .setTitle(`🎴 Perfil de ${target.username}`)
    .addFields(
      { name: "Monedas", value: `${player.coins}`, inline: true },
      { name: "Copias totales", value: `${totalCopies}`, inline: true },
      { name: "Diseños distintos", value: `${distinctDesigns} / ${totalCatalog?.count ?? 0}`, inline: true },
      {
        name: "Carta más rara",
        value: rarest ? `${rarest.memberName} — ${rarest.groupName} (${RARITY_LABELS[rarest.rarity]})` : "Ninguna todavía",
      },
    );

  await interaction.reply({ embeds: [embed] });
}
