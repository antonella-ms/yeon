import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { claimDaily } from "../lib/economy";

export const data = new SlashCommandBuilder()
  .setName("daily")
  .setDescription("Reclama tus monedas diarias");

export async function execute(interaction: ChatInputCommandInteraction) {
  const result = await claimDaily(interaction.user.id, interaction.user.username);

  if (!result.success) {
    const hours = Math.floor(result.remainingMs / (60 * 60 * 1000));
    const minutes = Math.floor((result.remainingMs % (60 * 60 * 1000)) / (60 * 1000));
    await interaction.reply({
      content: `Ya reclamaste tu recompensa de hoy. Vuelve en ${hours}h ${minutes}m.`,
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xf2c9dc)
    .setTitle("🎁 Recompensa diaria")
    .setDescription(`Ganaste **${result.amount}** monedas. Saldo actual: **${result.newBalance}**.`);

  await interaction.reply({ embeds: [embed] });
}
