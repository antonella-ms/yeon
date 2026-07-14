import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { pickRandomCards, giveCardToPlayer } from "../lib/cards";
import { getOrCreatePlayer } from "../lib/economy";

const CHANNEL_COOLDOWN_MS = 15_000;
const channelCooldowns = new Map<string, number>();

export const data = new SlashCommandBuilder()
  .setName("drop")
  .setDescription("Suelta una carta aleatoria directo a tu inventario");

export async function execute(interaction: ChatInputCommandInteraction) {
  const channelId = interaction.channelId;
  const now = Date.now();
  const lastDrop = channelCooldowns.get(channelId) ?? 0;

  if (now - lastDrop < CHANNEL_COOLDOWN_MS) {
    const remaining = Math.ceil((CHANNEL_COOLDOWN_MS - (now - lastDrop)) / 1000);
    await interaction.reply({
      content: `Espera ${remaining}s antes de soltar otra carta en este canal.`,
      ephemeral: true,
    });
    return;
  }

  const [card] = await pickRandomCards(1);
  if (!card) {
    await interaction.reply({
      content: "Todavía no hay cartas cargadas en el catálogo.",
      ephemeral: true,
    });
    return;
  }

  channelCooldowns.set(channelId, now);

  await getOrCreatePlayer(interaction.user.id, interaction.user.username);
  const userCard = await giveCardToPlayer(interaction.user.id, card.id);

  await interaction.reply({
    content:
      `<@${interaction.user.id}>, you got ${card.groupName} ${card.memberName} ${card.era} 🍋 ${userCard.copyNumber}\n\n` +
      `Code:${card.code}`,
  });
}
