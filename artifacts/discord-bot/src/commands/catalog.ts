import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { db, cardsTable, type Card } from "@workspace/db";
import { RARITY_LABELS } from "../lib/cards";

const PAGE_SIZE = 10;

export const data = new SlashCommandBuilder()
  .setName("cards")
  .setDescription("Explora el catálogo completo de cartas")
  .addStringOption((opt) =>
    opt.setName("grupo").setDescription("Filtra por grupo de kpop").setRequired(false),
  );

async function loadCatalog(group?: string): Promise<Card[]> {
  const all = await db.query.cardsTable.findMany({
    orderBy: (c, { asc }) => [asc(c.groupName), asc(c.memberName)],
  });
  if (!group) return all;
  const normalized = group.toLowerCase();
  return all.filter((c) => c.groupName.toLowerCase().includes(normalized));
}

function buildEmbed(cards: Card[], page: number, totalPages: number, group?: string) {
  const start = page * PAGE_SIZE;
  const pageCards = cards.slice(start, start + PAGE_SIZE);

  const embed = new EmbedBuilder()
    .setColor(0xf2c9dc)
    .setTitle(group ? `📖 Catálogo — ${group}` : "📖 Catálogo de cartas")
    .setFooter({ text: `Página ${page + 1} de ${Math.max(totalPages, 1)} · ${cards.length} cartas` });

  if (pageCards.length === 0) {
    embed.setDescription("No hay cartas que coincidan.");
  } else {
    embed.setDescription(
      pageCards
        .map(
          (c) =>
            `\`${c.code}\` **${c.memberName}** — ${c.groupName} · ${c.era} (${RARITY_LABELS[c.rarity]})`,
        )
        .join("\n"),
    );
  }

  return embed;
}

function buildRow(page: number, totalPages: number, group?: string) {
  const suffix = group ? `:${encodeURIComponent(group)}` : "";
  const row = new ActionRowBuilder<ButtonBuilder>();
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`catalog:${page - 1}${suffix}`)
      .setLabel("◀ Anterior")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`catalog:${page + 1}${suffix}`)
      .setLabel("Siguiente ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page + 1 >= totalPages),
  );
  return row;
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const group = interaction.options.getString("grupo") ?? undefined;
  const cards = await loadCatalog(group);
  const totalPages = Math.max(Math.ceil(cards.length / PAGE_SIZE), 1);

  await interaction.reply({
    embeds: [buildEmbed(cards, 0, totalPages, group)],
    components: [buildRow(0, totalPages, group)],
  });
}

export async function handlePage(interaction: ButtonInteraction, page: number, group?: string) {
  const cards = await loadCatalog(group);
  const totalPages = Math.max(Math.ceil(cards.length / PAGE_SIZE), 1);
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);

  await interaction.update({
    embeds: [buildEmbed(cards, safePage, totalPages, group)],
    components: [buildRow(safePage, totalPages, group)],
  });
}
