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
import { eq } from "drizzle-orm";
import { RARITY_LABELS } from "../lib/cards";
import type { CardRarity } from "@workspace/db";

const PAGE_SIZE = 8;

export const data = new SlashCommandBuilder()
  .setName("inventory")
  .setDescription("Muestra tu colección de cartas")
  .addUserOption((opt) =>
    opt.setName("usuario").setDescription("Ver la colección de otra persona").setRequired(false),
  );

type GroupedEntry = {
  cardId: number;
  memberName: string;
  groupName: string;
  rarity: CardRarity;
  instanceIds: number[];
};

async function loadInventory(ownerId: string): Promise<GroupedEntry[]> {
  const rows = await db
    .select({
      instanceId: userCardsTable.id,
      cardId: cardsTable.id,
      memberName: cardsTable.memberName,
      groupName: cardsTable.groupName,
      rarity: cardsTable.rarity,
    })
    .from(userCardsTable)
    .innerJoin(cardsTable, eq(userCardsTable.cardId, cardsTable.id))
    .where(eq(userCardsTable.ownerId, ownerId));

  const grouped = new Map<number, GroupedEntry>();
  for (const row of rows) {
    const existing = grouped.get(row.cardId);
    if (existing) {
      existing.instanceIds.push(row.instanceId);
    } else {
      grouped.set(row.cardId, {
        cardId: row.cardId,
        memberName: row.memberName,
        groupName: row.groupName,
        rarity: row.rarity,
        instanceIds: [row.instanceId],
      });
    }
  }

  return Array.from(grouped.values()).sort((a, b) => a.groupName.localeCompare(b.groupName));
}

function buildEmbed(username: string, entries: GroupedEntry[], page: number, totalPages: number) {
  const start = page * PAGE_SIZE;
  const pageEntries = entries.slice(start, start + PAGE_SIZE);

  const embed = new EmbedBuilder()
    .setColor(0xf2c9dc)
    .setTitle(`📇 Colección de ${username}`)
    .setFooter({ text: `Página ${page + 1} de ${Math.max(totalPages, 1)} · ${entries.length} diseños distintos` });

  if (pageEntries.length === 0) {
    embed.setDescription("Todavía no tiene ninguna carta. ¡Usa /drop para conseguir una!");
  } else {
    embed.setDescription(
      pageEntries
        .map(
          (e) =>
            `**${e.memberName}** — ${e.groupName} (${RARITY_LABELS[e.rarity]}) x${e.instanceIds.length}\nIDs: ${e.instanceIds.join(", ")}`,
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
