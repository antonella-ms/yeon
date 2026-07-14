import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Muestra todos los comandos de Ye-on Bot");

export async function execute(interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setColor(0xf2c9dc)
    .setTitle("✨ Ye-on Bot")
    .setDescription("Colecciona, intercambia y comercia cartas de tus grupos favoritos.")
    .addFields(
      { name: "/drop", value: "Suelta 3 cartas aleatorias en el canal para que las reclamen." },
      { name: "/inventory [usuario]", value: "Muestra tu colección (o la de alguien más)." },
      { name: "/cards [grupo]", value: "Explora el catálogo completo de cartas." },
      { name: "/profile [usuario]", value: "Muestra estadísticas de coleccionista." },
      { name: "/trade offer|list|cancel", value: "Propón, revisa o cancela intercambios de cartas." },
      { name: "/market sell|list|buy|cancel", value: "Compra y vende cartas con monedas." },
      { name: "/balance [usuario]", value: "Muestra el saldo de monedas." },
      { name: "/daily", value: "Reclama tu recompensa diaria de monedas." },
      { name: "/leaderboard [por]", value: "Muestra el ranking de coleccionistas." },
    );

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
