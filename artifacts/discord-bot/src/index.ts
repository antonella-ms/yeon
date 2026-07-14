import { Client, Events, GatewayIntentBits, REST, Routes } from "discord.js";
import { commands } from "./commands";
import { handlePage as handleInventoryPage } from "./commands/inventory";
import { handlePage as handleCatalogPage } from "./commands/catalog";
import { handleTradeButton } from "./commands/trade";
import { handleMarketPage } from "./commands/market";
import { logger } from "./lib/logger";

const token = process.env["DISCORD_BOT_TOKEN"];
const clientId = process.env["DISCORD_CLIENT_ID"];

if (!token) {
  throw new Error("DISCORD_BOT_TOKEN must be set. Add it as a secret before starting the bot.");
}
if (!clientId) {
  throw new Error("DISCORD_CLIENT_ID must be set. Add it as a secret before starting the bot.");
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const commandsByName = new Map(commands.map((c) => [c.data.name, c]));

async function registerCommandsForGuild(guildId: string) {
  const rest = new REST().setToken(token!);
  const body = commands.map((c) => c.data.toJSON());
  await rest.put(Routes.applicationGuildCommands(clientId!, guildId), { body });
  logger.info({ guildId, count: body.length }, "Slash commands registered for guild");
}

client.once(Events.ClientReady, async (readyClient) => {
  logger.info({ tag: readyClient.user.tag }, "Ye-on Bot conectado");

  for (const guild of readyClient.guilds.cache.values()) {
    try {
      await registerCommandsForGuild(guild.id);
    } catch (err) {
      logger.error({ err, guildId: guild.id }, "No se pudieron registrar los comandos en este servidor");
    }
  }
});

// Registers commands automatically as soon as the bot joins a new server.
client.on(Events.GuildCreate, async (guild) => {
  try {
    await registerCommandsForGuild(guild.id);
  } catch (err) {
    logger.error({ err, guildId: guild.id }, "No se pudieron registrar los comandos en el nuevo servidor");
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = commandsByName.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
      return;
    }

    if (interaction.isButton()) {
      const [namespace, ...rest] = interaction.customId.split(":");

      if (namespace === "inv") {
        await handleInventoryPage(interaction, rest[0]!, Number(rest[1]));
        return;
      }

      if (namespace === "catalog") {
        const group = rest[1] ? decodeURIComponent(rest[1]) : undefined;
        await handleCatalogPage(interaction, Number(rest[0]), group);
        return;
      }

      if (namespace === "trade" && (rest[0] === "accept" || rest[0] === "decline")) {
        await handleTradeButton(interaction, rest[0], Number(rest[1]));
        return;
      }

      if (namespace === "market") {
        await handleMarketPage(interaction, Number(rest[0]));
        return;
      }
    }
  } catch (err) {
    logger.error({ err }, "Error manejando una interacción");
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: "Ocurrió un error inesperado. Inténtalo de nuevo.", ephemeral: true })
        .catch(() => undefined);
    }
  }
});

client.login(token).catch((err) => {
  logger.error({ err }, "No se pudo iniciar sesión en Discord. Revisa DISCORD_BOT_TOKEN.");
  process.exit(1);
});
