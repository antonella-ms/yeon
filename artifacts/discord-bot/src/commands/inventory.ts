import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { db, cardsTable, userCardsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { RARITY_DIAMONDS } from "../lib/cards";
import type { CardRarity } from "@workspace/db";

const PAGE_SIZE = 5;

export const data = new SlashCommandBuilder()
  .setName("inventory")
  .setDescription("Muestra tu colección de cartas")
  .addUserOption((opt) =>
    opt.setName("usuario").setDescription("Ver la colección de otra persona").setRequired(false),
  );

type InventoryEntry = {
  instanceId: number;
  copyNumber: number;
  hash: string;
  memberName: string;
  groupName: string;
  era: string;
  code: string;
  rarity: CardRarity;
};

async function loadInventory(ownerId: string): Promise<InventoryEntry[]> {
  return db
    .select({
      instanceId: userCardsTable.id,
      copyNumber: userCardsTable.copyNumber,
      hash: userCardsTable.hash,
      memberName: cardsTable.memberName,
      groupName: cardsTable.groupName,
      era: cardsTable.era,
      code: cardsTable.code,
      rarity: cardsTable.rarity,
    })
    .from(userCardsTable)
    .innerJoin(cardsTable, eq(userCardsTable.cardId, cardsTable.id))
    .where(eq(userCardsTable.ownerId, ownerId))
    .orderBy(desc(userCardsTable.obtainedAt));
}

function buildEmbed(username: string, entries: InventoryEntry[], page: number, totalPages: number) {
  const start = page * PAGE_SIZE;
  const pageEntries = entries.slice(start, start + PAGE_SIZE);

  const embed = new EmbedBuilder()
    .setColor(0xf2c9dc)
    .setTitle(`📇 Colección de ${username}`)
    .setFooter({ text: `Página ${page + 1} de ${Math.max(totalPages, 1)} · ${entries.length} cartas` });

  if (pageEntries.length === 0) {
    embed.setDescription("Todavía no tiene ninguna carta. ¡Usa /drop para conseguir una!");
  } else {
    embed.setDescription(
      pageEntries
        .map(
          (e) =>
            `**${e.memberName}** ✨ ${e.copyNumber}\n` +
            `${RARITY_DIAMONDS[e.rarity]} ${e.groupName} ${e.era}\n` +
            `\`${e.code}.${e.hash}\``,
        )
        .join("\n\n"),
    );
  }

  return embed;
}

function buildRow(targetId: string, page: number, totalPages: number) {
  const row = new ActionRowBuilder<ButtonBuilder>();
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`inv:${targetId}:${page - 1}`)
      .setLabel("◀ Anterior")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`inv:${targetId}:${page + 1}`)
      .setLabel("Siguiente ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page + 1 >= totalPages),
  );
  return row;
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("usuario") ?? interaction.user;
  const entries = await loadInventory(target.id);
  const totalPages = Math.max(Math.ceil(entries.length / PAGE_SIZE), 1);

  await interaction.reply({
    embeds: [buildEmbed(target.username, entries, 0, totalPages)],
    components: [buildRow(target.id, 0, totalPages)],
  });
}

export async function handlePage(interaction: ButtonInteraction, targetId: string, page: number) {
  const target = await interaction.client.users.fetch(targetId);
  const entries = await loadInventory(targetId);
  const totalPages = Math.max(Math.ceil(entries.length / PAGE_SIZE), 1);
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);

  await interaction.update({
    embeds: [buildEmbed(target.username, entries, safePage, totalPages)],
    components: [buildRow(targetId, safePage, totalPages)],
  });
}