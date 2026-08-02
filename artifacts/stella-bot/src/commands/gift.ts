import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { db, giftsTable, giftClaimsTable, playersTable, type PackCode, type GiftCurrency } from "@workspace/db";
import { eq, count, sql } from "drizzle-orm";
import { PACK_DEFINITIONS, createUserPack, formatPackCode } from "../lib/packs";
import { getOrCreatePlayer } from "../lib/economy";
import { getPrimaryColor } from "../lib/theme";

const MAX_GIFTS = 20;
const MAX_CURRENCY_AMOUNT = 1_000_000;

// Role IDs allowed to use this command -- mismo rol que ya usaba /gift en
// Ye-on.
const STAFF_ROLE_IDS = ["1526624586093957170"];
const HAM_EMOJI = "<:ham:1529666166061142037>";
const LEMONS_EMOJI = "<:lemons:1528948992258343024>";

const CURRENCY_OPTION_VALUES = { HAMS: "HAMS", LEMONS: "LEMONS" } as const;
type CurrencyOptionValue = (typeof CURRENCY_OPTION_VALUES)[keyof typeof CURRENCY_OPTION_VALUES];

function isCurrencyOption(value: string): value is CurrencyOptionValue {
  return value === CURRENCY_OPTION_VALUES.HAMS || value === CURRENCY_OPTION_VALUES.LEMONS;
}

const DURATION_CHOICES: { name: string; value: string; ms: number }[] = [
  { name: "1 minuto", value: "1m", ms: 60_000 },
  { name: "10 minutos", value: "10m", ms: 10 * 60_000 },
  { name: "30 minutos", value: "30m", ms: 30 * 60_000 },
  { name: "1 hora", value: "1h", ms: 60 * 60_000 },
  { name: "3 horas", value: "3h", ms: 3 * 60 * 60_000 },
  { name: "6 horas", value: "6h", ms: 6 * 60 * 60_000 },
  { name: "12 horas", value: "12h", ms: 12 * 60 * 60_000 },
  { name: "16 horas", value: "16h", ms: 16 * 60 * 60_000 },
];

export const data = new SlashCommandBuilder()
  .setName("gift")
  .setDescription("Regala packs, Hams o Lemons en el canal para que la gente los reclame")
  .addStringOption((opt) =>
    opt
      .setName("codigo")
      .setDescription("Qué quieres regalar")
      .setRequired(true)
      .addChoices(
        ...Object.values(PACK_DEFINITIONS).map((p) => ({ name: p.name, value: p.code })),
        { name: "Hams", value: CURRENCY_OPTION_VALUES.HAMS },
        { name: "Lemons", value: CURRENCY_OPTION_VALUES.LEMONS },
      ),
  )
  .addIntegerOption((opt) =>
    opt
      .setName("cantidad")
      .setDescription("Packs: cuántos regalos independientes crear. Hams/Lemons: cuánto dar (un solo regalo)")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(MAX_CURRENCY_AMOUNT),
  )
  .addStringOption((opt) =>
    opt
      .setName("duracion")
      .setDescription("Por cuánto tiempo va a estar disponible cada regalo")
      .setRequired(true)
      .addChoices(...DURATION_CHOICES.map((d) => ({ name: d.name, value: d.value }))),
  );

// NUEVO: simplificado respecto al original de Ye-on -- como Stella solo se
// registra en el servidor (no global, no DM), interaction.member ya viene
// con los roles cacheados, sin necesidad de un guild.fetch() aparte.
function isStaff(interaction: ChatInputCommandInteraction): boolean {
  if (!interaction.inCachedGuild()) return false;
  return STAFF_ROLE_IDS.some((roleId) => interaction.member.roles.cache.has(roleId));
}

async function getClaimCount(giftId: number): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(giftClaimsTable)
    .where(eq(giftClaimsTable.giftId, giftId));
  return row?.value ?? 0;
}

function describeGiftContent(gift: { packCode: string | null; currencyType: string | null; amount: number | null }): {
  emoji: string;
  label: string;
} {
  if (gift.currencyType === "hams") {
    return { emoji: HAM_EMOJI, label: `**${gift.amount} Hams**` };
  }
  if (gift.currencyType === "lemons") {
    return { emoji: LEMONS_EMOJI, label: `**${gift.amount} Lemons**` };
  }
  const def = PACK_DEFINITIONS[gift.packCode as PackCode];
  return { emoji: def.emoji, label: `**${def.name}**` };
}

async function buildGiftEmbed(
  gift: { packCode: string | null; currencyType: string | null; amount: number | null },
  expiresAt: Date,
  claimCount: number,
  expired: boolean,
) {
  const { emoji, label } = describeGiftContent(gift);
  const expiresUnix = Math.floor(expiresAt.getTime() / 1000);
  const color = expired ? 0x6b7280 : await getPrimaryColor();

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(expired ? "Gift ended." : "Gift available!")
    .setDescription(
      (expired ? "" : "Click the button below to claim your gift.\n\n") +
        `${emoji} ${label}\n\n` +
        (expired ? `Expired <t:${expiresUnix}:R>` : `Expires <t:${expiresUnix}:R>`),
    )
    .setFooter({ text: `Total Users Claimed: ${claimCount}` });
}

function buildGiftRow(giftId: number, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`gift:claim:${giftId}`)
      .setLabel("Claim")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
}

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!isStaff(interaction)) {
    await interaction.reply({
      content: "No tienes permiso para usar este comando.",
      ephemeral: true,
    });
    return;
  }

  const codigoInput = interaction.options.getString("codigo", true);
  const cantidad = interaction.options.getInteger("cantidad", true);
  const durationValue = interaction.options.getString("duracion", true);
  const duration = DURATION_CHOICES.find((d) => d.value === durationValue)!;

  await getOrCreatePlayer(interaction.user.id, interaction.user.username);

  const channel = interaction.channel;
  if (!channel || !channel.isSendable()) {
    await interaction.reply({
      content: "No puedo enviar mensajes en este canal.",
      ephemeral: true,
    });
    return;
  }

  if (isCurrencyOption(codigoInput)) {
    const currencyType: GiftCurrency = codigoInput === CURRENCY_OPTION_VALUES.HAMS ? "hams" : "lemons";
    const currencyLabel = currencyType === "hams" ? "Hams" : "Lemons";

    await interaction.reply({
      content: `Enviando un regalo de ${cantidad} ${currencyLabel}...`,
      ephemeral: true,
    });

    try {
      const expiresAt = new Date(Date.now() + duration.ms);

      const [gift] = await db
        .insert(giftsTable)
        .values({
          currencyType,
          amount: cantidad,
          creatorId: interaction.user.id,
          channelId: channel.id,
          expiresAt,
        })
        .returning();

      if (!gift) {
        throw new Error("El insert a giftsTable no devolvió una fila (revisar .returning() / driver de Postgres)");
      }

      const embed = await buildGiftEmbed(gift, expiresAt, 0, false);
      const row = buildGiftRow(gift.id);
      const message = await channel.send({ embeds: [embed], components: [row] });

      await db.update(giftsTable).set({ messageId: message.id }).where(eq(giftsTable.id, gift.id));
    } catch (err) {
      console.error("Error en /gift (moneda):", err);
      await interaction.followUp({
        content: `Ocurrió un error al enviar el regalo: ${err instanceof Error ? err.message : String(err)}`,
        ephemeral: true,
      });
    }
    return;
  }

  const packCode = codigoInput as PackCode;
  const quantity = cantidad;

  if (quantity > MAX_GIFTS) {
    await interaction.reply({
      content: `Para packs, "cantidad" es el número de regalos independientes -- máximo ${MAX_GIFTS}.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: `Enviando ${quantity} regalo(s) de ${PACK_DEFINITIONS[packCode].name}...`,
    ephemeral: true,
  });

  try {
    for (let i = 0; i < quantity; i++) {
      const expiresAt = new Date(Date.now() + duration.ms);

      const [gift] = await db
        .insert(giftsTable)
        .values({
          packCode,
          creatorId: interaction.user.id,
          channelId: channel.id,
          expiresAt,
        })
        .returning();

      if (!gift) {
        throw new Error("El insert a giftsTable no devolvió una fila (revisar .returning() / driver de Postgres)");
      }

      const embed = await buildGiftEmbed(gift, expiresAt, 0, false);
      const row = buildGiftRow(gift.id);
      const message = await channel.send({ embeds: [embed], components: [row] });

      await db.update(giftsTable).set({ messageId: message.id }).where(eq(giftsTable.id, gift.id));
    }
  } catch (err) {
    console.error("Error en /gift:", err);
    await interaction.followUp({
      content: `Ocurrió un error al enviar los regalos: ${err instanceof Error ? err.message : String(err)}`,
      ephemeral: true,
    });
  }
}

export async function handleGiftClaim(interaction: ButtonInteraction, giftId: number) {
  const gift = await db.query.giftsTable.findFirst({ where: eq(giftsTable.id, giftId) });

  if (!gift) {
    await interaction.reply({ content: "Este regalo ya no existe.", ephemeral: true });
    return;
  }

  const expired = gift.status !== "pending" || gift.expiresAt <= new Date();

  if (expired) {
    if (gift.status === "pending") {
      await db.update(giftsTable).set({ status: "expired" }).where(eq(giftsTable.id, giftId));
    }
    const claimCount = await getClaimCount(giftId);
    await interaction
      .update({
        embeds: [await buildGiftEmbed(gift, gift.expiresAt, claimCount, true)],
        components: [buildGiftRow(giftId, true)],
      })
      .catch(() => undefined);
    await interaction.followUp({
      content: "Este regalo ya no está disponible.",
      ephemeral: true,
    });
    return;
  }

  await getOrCreatePlayer(interaction.user.id, interaction.user.username);

  const [claim] = await db
    .insert(giftClaimsTable)
    .values({ giftId, claimedBy: interaction.user.id })
    .onConflictDoNothing()
    .returning();

  if (!claim) {
    await interaction.reply({
      content: "Ya reclamaste este regalo.",
      ephemeral: true,
    });
    return;
  }

  if (gift.currencyType) {
    if (gift.currencyType === "hams") {
      await db
        .update(playersTable)
        .set({ coins: sql`${playersTable.coins} + ${gift.amount}` })
        .where(eq(playersTable.discordId, interaction.user.id));
    } else {
      await db
        .update(playersTable)
        .set({ lemons: sql`${playersTable.lemons} + ${gift.amount}` })
        .where(eq(playersTable.discordId, interaction.user.id));
    }

    const claimCount = await getClaimCount(giftId);
    await interaction.update({
      embeds: [await buildGiftEmbed(gift, gift.expiresAt, claimCount, false)],
      components: [buildGiftRow(giftId, false)],
    });

    const { emoji } = describeGiftContent(gift);
    const currencyName = gift.currencyType === "hams" ? "Hams" : "Lemons";
    await interaction.followUp({
      content: `${emoji} ¡Reclamaste **${gift.amount} ${currencyName}**!`,
      ephemeral: true,
    });
    return;
  }

  const pack = await createUserPack(interaction.user.id, gift.packCode as PackCode);
  const def = PACK_DEFINITIONS[gift.packCode as PackCode];
  const claimCount = await getClaimCount(giftId);

  await interaction.update({
    embeds: [await buildGiftEmbed(gift, gift.expiresAt, claimCount, false)],
    components: [buildGiftRow(giftId, false)],
  });

  await interaction.followUp({
    content: `${def.emoji} ¡Reclamaste **${def.name}**! Tu código: \`${formatPackCode(gift.packCode as PackCode, pack.hash)}\``,
    ephemeral: true,
  });
}

export async function expirePendingGifts(client: Client) {
  const expiredGifts = await db.query.giftsTable.findMany({
    where: (gifts, { and, eq, lte }) => and(eq(gifts.status, "pending"), lte(gifts.expiresAt, new Date())),
  });

  for (const gift of expiredGifts) {
    await db.update(giftsTable).set({ status: "expired" }).where(eq(giftsTable.id, gift.id));

    if (!gift.messageId) continue;

    try {
      const channel = await client.channels.fetch(gift.channelId);
      if (!channel || !channel.isTextBased()) continue;

      const message = await channel.messages.fetch(gift.messageId);
      const claimCount = await getClaimCount(gift.id);

      await message.edit({
        embeds: [await buildGiftEmbed(gift, gift.expiresAt, claimCount, true)],
        components: [buildGiftRow(gift.id, true)],
      });
    } catch {
      // El mensaje o canal ya no existe, o el bot perdió acceso. Se ignora.
    }
  }
}

export function startGiftExpiryScheduler(client: Client) {
  setInterval(() => {
    expirePendingGifts(client).catch(() => undefined);
  }, 60_000);
}
