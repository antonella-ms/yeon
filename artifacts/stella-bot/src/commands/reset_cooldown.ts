import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { clearCooldown, clearAllCooldowns } from "../lib/cooldowns";
import { resetDailyCooldown, resetAllDailyCooldowns } from "../lib/economy";
import type { CooldownKind } from "@workspace/db";

// Role IDs allowed to use this command (fndr, manager, ceo). Using IDs
// instead of role names because names can contain emoji/decorative
// characters that are fragile to match, and IDs never change even if the
// role gets renamed later.
const STAFF_ROLE_IDS = ["1116065098109292626", "1526626155883663584", "1526625281979322489"];

// Explicit user override: always allowed regardless of role lookup, so
// this doesn't break if the guild/member fetch ever fails.
const STAFF_USER_IDS = ["938133779459997717"];

export const data = new SlashCommandBuilder()
  .setName("reset_cooldown")
  .setDescription("[Staff] Reinicia cooldowns de /drop y/o /daily")
  .addUserOption((opt) =>
    opt
      .setName("usuario")
      .setDescription("A quién reiniciar (por defecto, a ti mismo)")
      .setRequired(false),
  )
  .addBooleanOption((opt) =>
    opt
      .setName("todos")
      .setDescription("Reiniciar a TODOS los usuarios (ignora la opción usuario)")
      .setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName("tipo")
      .setDescription("Qué cooldown reiniciar (por defecto, ambos)")
      .setRequired(false)
      .addChoices(
        { name: "Drop", value: "drop" },
        { name: "Daily", value: "daily" },
        { name: "Ambos", value: "both" },
      ),
  );

// NUEVO: simplificado respecto al original de Ye-on -- como Stella solo se
// registra en el servidor (Routes.applicationGuildCommands con GUILD_ID
// fijo, no global), esta interacción SIEMPRE viene de ese servidor, así
// que interaction.member ya viene con los roles cacheados sin necesidad
// de un guild.fetch() + member.fetch() aparte.
function isStaff(interaction: ChatInputCommandInteraction): boolean {
  if (STAFF_USER_IDS.includes(interaction.user.id)) return true;
  if (!interaction.inCachedGuild()) return false;
  return STAFF_ROLE_IDS.some((roleId) => interaction.member.roles.cache.has(roleId));
}

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!isStaff(interaction)) {
    await interaction.reply({
      content: "Este comando es solo para staff.",
      ephemeral: true,
    });
    return;
  }

  const targetUser = interaction.options.getUser("usuario");
  const everyone = interaction.options.getBoolean("todos") ?? false;
  const tipoInput = interaction.options.getString("tipo") as CooldownKind | "both" | null;
  const kind: CooldownKind | undefined = tipoInput && tipoInput !== "both" ? tipoInput : undefined;
  const shouldResetDaily = !kind || kind === "daily";

  if (everyone) {
    const count = await clearAllCooldowns(kind);
    if (shouldResetDaily) {
      await resetAllDailyCooldowns();
    }
    await interaction.reply({
      content: `Reiniciados ${count} cooldown(s) de ${kind ? `\`/${kind}\`` : "todos los tipos"} para todos los usuarios.`,
    });
    return;
  }

  const target = targetUser ?? interaction.user;
  const count = await clearCooldown(target.id, kind);
  if (shouldResetDaily) {
    await resetDailyCooldown(target.id);
  }

  await interaction.reply({
    content:
      count > 0 || shouldResetDaily
        ? `Reiniciado el cooldown de ${kind ? `\`/${kind}\`` : "/drop y /daily"} para <@${target.id}>.`
        : `<@${target.id}> no tenía ningún cooldown activo${kind ? ` de \`/${kind}\`` : ""}.`,
  });
}
