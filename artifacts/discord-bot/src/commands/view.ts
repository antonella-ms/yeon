import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { db, cardsTable, userCardsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { cardEmbed, RARITY_DIAMONDS } from "../lib/cards";

export const data = new SlashCommandBuilder()
  .setName("view")
  .setDescription("Muestra una carta específica por su código completo")
  .addStringOption((opt) =>
    opt
      .setName("codigo")
     .Los códigos que quieras visualizar")
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const input = interaction.options.getString("codigo", true).trim();

  const [rawCode, rawHash] = input.split(".");
  if (!rawCode || !rawHash) {
    await interaction.reply({
      content: "Formato inválido. Usá el código completo con el hash, ej: `T2J1.a7fe`.",
      ephemeral: true,
    });
    return;
  }

  const code = rawCode.toUpperCase();
  const hash = rawHash.toLowerCase();

  const rows = await db
    .select({
      copyNumber: userCardsTable.copyNumber,
      hash: userCardsTable.hash,
      ownerId: userCardsTable.ownerId,
      obtainedAt: userCardsTable.obtainedAt,
      card: cardsTable,
    })
    .from(userCardsTable)
    .innerJoin(cardsTable, eq(userCardsTable.cardId, cardsTable.id))
    .where(and(eq(cardsTable.code, code), eq(userCardsTable.hash, hash)))
    .limit(1);

  const result = rows[0];
  if (!result) {
    await interaction.reply({
      content: `No se encontró ninguna carta con el código \`${input}\`. Revisá que esté bien escrito, con el punto y el hash incluidos.`,
      ephemeral: true,
    });
    return;
  }

  const { card, copyNumber, hash: foundHash, ownerId } = result;

  await interaction.reply({
    content:
      `${RARITY_DIAMONDS[card.rarity]} ${card.groupName} ${card.memberName} · ${card.era}\n` +
      `\`${card.code}.${foundHash}\` · copia #${copyNumber} · dueño: <@${ownerId}>`,
    embeds: [cardEmbed(card)],
  });
}