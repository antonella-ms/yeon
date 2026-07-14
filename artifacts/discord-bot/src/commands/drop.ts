import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  ButtonInteraction,
} from "discord.js";
import { pickRandomCards, cardEmbed, giveCardToPlayer } from "../lib/cards";
import { getOrCreatePlayer } from "../lib/economy";
import { createDropSession, getDropSession, expireDropSession, buildDropRows } from "../lib/dropSessions";
import { logger } from "../lib/logger";

const DROP_SIZE = 1;
const DROP_DURATION_MS = 60_000;
const channelCooldowns = new Map<string, number>();
const CHANNEL_COOLDOWN_MS = 15_000;

export const data = new SlashCommandBuilder()
  .setName("drop")
  .setDescription("Suelta una carta aleatoria para que el canal la reclame");

export async function execute(interaction: ChatInputCommandInteraction) {
  const channelId = interaction.channelId;
  const now = Date.now();
  const lastDrop = channelCooldowns.get(channelId) ?? 0;

  if (now - lastDrop < CHANNEL_COOLDOWN_MS) {
    const remaining = Math.ceil((CHANNEL_COOLDOWN_MS - (now - lastDrop)) / 1000);
    await interaction.reply({
      content: `Espera ${remaining}s antes de soltar otro drop en este canal.`,
      ephemeral: true,
    });
    return;
  }

  const cards = await pickRandomCards(DROP_SIZE);
  if (cards.length === 0) {
    await interaction.reply({
      content: "Todavía no hay cartas cargadas en el catálogo.",
      ephemeral: true,
    });
    return;
  }

  channelCooldowns.set(channelId, now);
  const session = createDropSession(cards);

  const embeds = cards.map((card) => cardEmbed(card));

  const reply = await interaction.reply({
    content: `${interaction.user.username} soltó una carta nueva. ¡El primero en tocar el botón se la queda!`,
    embeds,
    components: buildDropRows(session),
    withResponse: true,
  });

  setTimeout(async () => {
    const current = getDropSession(session.id);
    if (!current) return;
    expireDropSession(session.id);
    try {
      await reply.resource?.message?.edit({
        content: "Este drop ya expiró.",
        components: buildDropRows(current),
      });
    } catch (err) {
      logger.warn({ err }, "No se pudo editar el mensaje de drop expirado");
    }
  }, DROP_DURATION_MS);
}

export async function handleClaim(interaction: ButtonInteraction, dropId: string, cardIndex: number) {
  const session = getDropSession(dropId);

  if (!session || session.expired) {
    await interaction.reply({ content: "Este drop ya expiró.", ephemeral: true });
    return;
  }

  if (session.claimedCardIndexes.has(cardIndex)) {
    await interaction.reply({ content: "Alguien ya reclamó esa carta.", ephemeral: true });
    return;
  }

  if (session.claimedUserIds.has(interaction.user.id)) {
    await interaction.reply({ content: "Ya reclamaste una carta de este drop.", ephemeral: true });
    return;
  }

  const card = session.cards[cardIndex];
  if (!card) {
    await interaction.reply({ content: "Esa carta ya no existe.", ephemeral: true });
    return;
  }

  await getOrCreatePlayer(interaction.user.id, interaction.user.username);
  await giveCardToPlayer(interaction.user.id, card.id);

  session.claimedCardIndexes.set(cardIndex, interaction.user.username);
  session.claimedUserIds.add(interaction.user.id);

  await interaction.update({ components: buildDropRows(session) });
  await interaction.followUp({
    content: `¡Te llevaste a **${card.memberName}** (${card.groupName})!`,
    ephemeral: true,
  });
}
