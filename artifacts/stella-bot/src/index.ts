import { createServer } from "node:http";
import { Client, Events, GatewayIntentBits, REST, Routes } from "discord.js";
import { commands } from "./commands";
import { logger } from "./lib/logger";

// NUEVO: a propósito, Stella NUNCA corre nada de sincronización de schema
// (drizzle-kit push, migraciones, etc.) al arrancar. Solo lee y escribe
// datos con la misma base de Ye-on -- la estructura de las tablas se
// gestiona siempre desde el lado de Ye-on, nunca desde acá.

const PORT = Number(process.env["PORT"] ?? 3000);
createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Stella Bot is running");
}).listen(PORT, "0.0.0.0", () => {
  logger.info({ port: PORT }, "Health check server listening");
});

const token = process.env["DISCORD_BOT_TOKEN"];
const clientId = process.env["DISCORD_CLIENT_ID"];
const guildId = process.env["GUILD_ID"];

if (!token) {
  throw new Error("DISCORD_BOT_TOKEN must be set. Add it as a secret before starting the bot.");
}
if (!clientId) {
  throw new Error("DISCORD_CLIENT_ID must be set. Add it as a secret before starting the bot.");
}
if (!guildId) {
  throw new Error("GUILD_ID must be set. Add it as a secret before starting the bot.");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});
const commandsByName = new Map(commands.map((c) => [c.data.name, c]));

async function registerCommands() {
  const rest = new REST().setToken(token!);
  const body = commands.map((c) => c.data.toJSON());
  await rest.put(Routes.applicationGuildCommands(clientId!, guildId!), { body });
  logger.info({ guildId, count: body.length }, "Slash commands registered");
}

client.once(Events.ClientReady, async (readyClient) => {
  logger.info({ tag: readyClient.user.tag }, "Stella Bot conectada");
  try {
    await registerCommands();
  } catch (err) {
    logger.error({ err }, "No se pudieron registrar los comandos");
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
