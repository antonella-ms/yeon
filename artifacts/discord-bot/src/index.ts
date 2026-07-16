import { createServer } from "node:http";
import { Client, Events, GatewayIntentBits, REST, Routes } from "discord.js";
import { commands } from "./commands";
import { handlePage as handleInventoryPage } from "./commands/inventory";
import { handlePage as handleCatalogPage } from "./commands/catalog";
import { handleTradeButton } from "./commands/trade";
import { handleMarketPage } from "./commands/market";
import { logger } from "./lib/logger";

const PORT = Number(process.env["PORT"] ?? 3000);
createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Ye-on Bot is running");
}).listen(PORT, "0.0.0.0", () => {
  logger.info({ port: PORT }, "Health check server listening");
});

const token = process.env["DISCORD_BOT_TOKEN"];
const clientId = process.env["DISCORD_CLIENT_ID"];

if (!token) {
  throw new Error("DISCORD_BOT_TOKEN must be set. Add it as a secret before starting the bot.");
}
if (!clientId) {
  throw new Error("DISCORD_CLIENT_ID must be set. Add it as a secret before starting the bot.");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});
const commandsByName = new Map(commands.map((c) => [c.data.name, c]));

// Casual, conversation-flavored replies for when someone pings the bot
// directly instead of using a slash command. This is NOT a real AI -- it
// doesn't understand what the person wrote. It just picks a category based
// on a few keyword hints in the message, and a random reply within that
// category, so it feels a bit more alive than a single fixed list. No
// memory between messages, no mention of bot commands -- purely for fun.
const GREETING_REPLIES = [
  "¡Holaa! ¿Cómo andás? 💖",
  "Ey, ¿qué contás?",
  "Holis, ¿todo bien por ahí?",
  "¡Hola hola! ¿Cómo va tu día?",
  "¡Buenas! ¿Qué se cuenta?",
];

const QUESTION_REPLIES = [
  "Mmm, buena pregunta... ¿vos qué pensás?",
  "Ni idea, pero contame más jaja",
  "Eso me pregunto yo también a veces 🤔",
  "¡Uh, no sé! ¿Y a vos por qué te interesa?",
  "Dejame pensarlo... ¿o mejor decime vos primero?",
];

const SAD_REPLIES = [
  "Uy, ¿todo bien? Estoy para escuchar 💛",
  "Ánimo, ya va a pasar 🫂",
  "Che, mandale fuerza. ¿Querés contarme qué pasó?",
];

const HAPPY_REPLIES = [
  "¡Ayy qué lindo! Me alegro un montón 🎉",
  "¡Eso me gusta escuchar! ✨",
  "Jeje, contagiame esa buena onda",
];

const GENERIC_REPLIES = [
  "Jaja, contame más",
  "Interesante eso que decís 👀",
  "¿En serio? Contame más",
  "Jeje, ¿y después qué pasó?",
  "Ah mirá vos",
  "Se aprende algo nuevo todos los días",
];

function pickRandom(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)]!;
}

function randomPingReply(messageContent: string): string {
  const text = messageContent.toLowerCase();

  if (/\b(hola|holis|buenas|ey|hey)\b/.test(text)) {
    return pickRandom(GREETING_REPLIES);
  }
  if (text.includes("?")) {
    return pickRandom(QUESTION_REPLIES);
  }
  if (/\b(triste|mal|cansad|aburrid)/.test(text)) {
    return pickRandom(SAD_REPLIES);
  }
  if (/\b(feliz|content|bien|genial|excelente)\b/.test(text)) {
    return pickRandom(HAPPY_REPLIES);
  }
  return pickRandom(GENERIC_REPLIES);
}

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

 // Replies with a casual, semi-varied message whenever someone pings the bot
// directly by name in a normal message (not a slash command). Explicitly
// excludes @everyone/@here -- those also count as "mentioning" the bot in
// discord.js's eyes, but the person didn't actually address the bot.
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (message.mentions.everyone) return;
  if (!client.user || !message.mentions.has(client.user)) return;

  try {
    await message.reply(randomPingReply(message.content));
  } catch (err) {
    logger.error({ err }, "No se pudo responder al ping");
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