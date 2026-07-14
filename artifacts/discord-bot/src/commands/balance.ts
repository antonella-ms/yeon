import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { getOrCreatePlayer } from "../lib/economy";

export const data = new SlashCommandBuilder()
  .setName("balance")
  .setDescription("Muestra cuántas monedas tienes")
  .addUserOption((opt) =>
    opt.setName("usuario").setDescription("Ver el saldo de otra persona").setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("usuario") ?? interaction.user;
  const player = await getOrCreatePlayer(target.id, target.username);

  const embed = new EmbedBuilder()
    .setColor(0xf2c9dc)
    .setTitle(`💰 ${target.username}`)
    .setDescription(`**${player.coins}** monedas`);

  await interaction.reply({ embeds: [embed] });
}
