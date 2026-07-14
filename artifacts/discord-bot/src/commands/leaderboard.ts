import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { db, playersTable, userCardsTable } from "@workspace/db";
import { desc, sql } from "drizzle-orm";

export const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("Muestra a los mejores coleccionistas")
  .addStringOption((opt) =>
    opt
      .setName("por")
      .setDescription("Ordenar por monedas o por número de cartas")
      .addChoices({ name: "monedas", value: "coins" }, { name: "cartas", value: "cards" })
      .setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const by = interaction.options.getString("por") ?? "cards";

  if (by === "coins") {
    const top = await db
      .select({ discordId: playersTable.discordId, username: playersTable.username, coins: playersTable.coins })
      .from(playersTable)
      .orderBy(desc(playersTable.coins))
      .limit(10);

    const embed = new EmbedBuilder()
      .setColor(0xf2c9dc)
      .setTitle("🏆 Top coleccionistas — Monedas")
      .setDescription(
        top.length === 0
          ? "Todavía no hay jugadores."
          : top.map((p, i) => `**${i + 1}.** ${p.username} — ${p.coins} monedas`).join("\n"),
      );

    await interaction.reply({ embeds: [embed] });
    return;
  }

  const top = await db
    .select({ ownerId: userCardsTable.ownerId, total: sql<number>`count(*)` })
    .from(userCardsTable)
    .groupBy(userCardsTable.ownerId)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  const withNames = await Promise.all(
    top.map(async (row) => {
      const player = await db.query.playersTable.findFirst({ where: (p, { eq }) => eq(p.discordId, row.ownerId) });
      return { username: player?.username ?? row.ownerId, total: row.total };
    }),
  );

  const embed = new EmbedBuilder()
    .setColor(0xf2c9dc)
    .setTitle("🏆 Top coleccionistas — Cartas")
    .setDescription(
      withNames.length === 0
        ? "Todavía no hay cartas reclamadas."
        : withNames.map((p, i) => `**${i + 1}.** ${p.username} — ${p.total} cartas`).join("\n"),
    );

  await interaction.reply({ embeds: [embed] });
}
