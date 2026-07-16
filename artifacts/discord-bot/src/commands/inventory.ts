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
import { eq, and, desc, asc, or, ilike } from "drizzle-orm";
import { RARITY_DIAMONDS } from "../lib/cards";
import type { CardRarity } from "@workspace/db";

const PAGE_SIZE = 5;

const SORT_CHOICES = [
  { name: "Más nuevo primero", value: "newest" },
  { name: "Más viejo primero", value: "oldest" },
  { name: "Número de copia", value: "copy" },
  { name: "Era", value: "era" },
  { name: "Idol", value: "idol" },
  { name: "Grupo", value: "group" },
] as const;
type SortOption = (typeof SORT_CHOICES)[number]["value"];

export const data = new SlashCommandBuilder()
  .setName("inventory")
  .setDescription("Muestra tu colección de cartas")
  .addUserOption((opt) =>
    opt.setName("usuario").setDescription("Ver la colección de otra persona").setRequired(false),
  )
  .addStringOption((opt) =>
    opt.setName("grupo").setDescription("Filtra por grupo de kpop").setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName("idols")
      .setDescription("Filtra por idol o idols separados por coma, ej: Jiwoo, Hyerin")
      .setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName("rareza")
      .setDescription("Filtra por rareza")
      .setRequired(false)
      .addChoices(
        { name: "Común (🍋)", value: "common" },
        { name: "Rara (🍋🍋)", value: "rare" },
        { name: "Épica (🍋🍋🍋)", value: "epic" },
      ),
  )
  .addStringOption((opt) =>
    opt.setName("era").setDescription("Filtra por era").setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName("ordenar")
      .setDescription("Cómo ordenar los resultados")
      .setRequired(false)
      .addChoices(...SORT_CHOICES.map((c) => ({ name: c.name, value: c.value }))),
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

// Filters are packed into a compact string so they survive round-trips
// through a button's customId (Discord limits customId to 100 chars, so we
// keep this short and avoid re-encoding full sentences).
type Filters = {
  group?: string;
  idols?: string[];
  rarity?: CardRarity;
  era?: string;
  sort?: SortOption;
};

function encodeFilters(f: Filters): string {
  const parts = [
    f.group ?? "",
    f.idols?.join("+") ?? "",
    f.rarity ?? "",
    f.era ?? "",
    f.sort ?? "",
  ];
  return parts.map((p) => encodeURIComponent(p)).join(",");
}

function decodeFilters(encoded: string): Filters {
  const [group, idols, rarity, era, sort] = encoded.split(",").map((p) => decodeURIComponent(p ?? ""));
  return {
    group: group || undefined,
    idols: idols ? idols.split("+") : undefined,
    rarity: (rarity || undefined) as CardRarity | undefined,
    era: era || undefined,
    sort: (sort || undefined) as SortOption | undefined,
  };
}

async function loadInventory(ownerId: string, filters: Filters): Promise<InventoryEntry[]> {
  const conditions = [eq(userCardsTable.ownerId, ownerId)];

  if (filters.group) {
    conditions.push(ilike(cardsTable.groupName, `%${filters.group}%`));
  }
  if (filters.idols && filters.idols.length > 0) {
    conditions.push(
      or(...filters.idols.map((name) => ilike(cardsTable.memberName, `%${name.trim()}%`)))!,
    );
  }
  if (filters.rarity) {
    conditions.push(eq(cardsTable.rarity, filters.rarity));
  }
  if (filters.era) {
    conditions.push(ilike(cardsTable.era, `%${filters.era}%`));
  }

  const orderBy = (() => {
    switch (filters.sort) {
      case "oldest":
        return asc(userCardsTable.obtainedAt);
      case "copy":
        return asc(userCardsTable.copyNumber);
      case "era":
        return asc(cardsTable.era);
      case "idol":
        return asc(cardsTable.memberName);
      case "group":
        return asc(cardsTable.groupName);
      case "newest":
      default:
        return desc(userCardsTable.obtainedAt);
    }
  })();

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
    .where(and(...conditions))
    .orderBy(orderBy);
}

function describeFilters(filters: Filters): string | null {
  const parts: string[] = [];
  if (filters.group) parts.push(`grupo: ${filters.group}`);
  if (filters.idols?.length) parts.push(`idols: ${filters.idols.join(", ")}`);
  if (filters.rarity) parts.push(`rareza: ${filters.rarity}`);
  if (filters.era) parts.push(`era: ${filters.era}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function buildEmbed(
  username: string,
  entries: InventoryEntry[],
  page: number,
  totalPages: number,
  filters: Filters,
) {
  const start = page * PAGE_SIZE;
  const pageEntries = entries.slice(start, start + PAGE_SIZE);
  const filterLine = describeFilters(filters);

  const embed = new EmbedBuilder()
    .setColor(0xf2c9dc)
    .setTitle(`📇 Colección de ${username}`)
    .setFooter({ text: `Página ${page + 1} de ${Math.max(totalPages, 1)} · ${entries.length} cartas` });

  const header = filterLine ? `*Filtros: ${filterLine}*\n\n` : "";

  if (pageEntries.length === 0) {
    embed.setDescription(
      header +
        (filterLine
          ? "No se encontraron cartas con esos filtros."
          : "Todavía no tiene ninguna carta. ¡Usa /drop para conseguir una!"),
    );
  } else {
    embed.setDescription(
      header +
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

function buildRow(targetId: string, page: number, totalPages: number, filters: Filters) {
  const encoded = encodeFilters(filters);
  const row = new ActionRowBuilder<ButtonBuilder>();
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`inv:${targetId}:${page - 1}:${encoded}`)
      .setLabel("◀ Anterior")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`inv:${targetId}:${page + 1}:${encoded}`)
      .setLabel("Siguiente ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page + 1 >= totalPages),
  );
  return row;
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("usuario") ?? interaction.user;

  const idolsInput = interaction.options.getString("idols");
  const filters: Filters = {
    group: interaction.options.getString("grupo") ?? undefined,
    idols: idolsInput ? idolsInput.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    rarity: (interaction.options.getString("rareza") as CardRarity | null) ?? undefined,
    era: interaction.options.getString("era") ?? undefined,
    sort: (interaction.options.getString("ordenar") as SortOption | null) ?? undefined,
  };

  const entries = await loadInventory(target.id, filters);
  const totalPages = Math.max(Math.ceil(entries.length / PAGE_SIZE), 1);

  await interaction.reply({
    embeds: [buildEmbed(target.username, entries, 0, totalPages, filters)],
    components: [buildRow(target.id, 0, totalPages, filters)],
  });
}

export async function handlePage(
  interaction: ButtonInteraction,
  targetId: string,
  page: number,
  encodedFilters?: string,
) {
  const target = await interaction.client.users.fetch(targetId);
  const filters = encodedFilters ? decodeFilters(encodedFilters) : {};
  const entries = await loadInventory(targetId, filters);
  const totalPages = Math.max(Math.ceil(entries.length / PAGE_SIZE), 1);
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);

  await interaction.update({
    embeds: [buildEmbed(target.username, entries, safePage, totalPages, filters)],
    components: [buildRow(targetId, safePage, totalPages, filters)],
  });
}