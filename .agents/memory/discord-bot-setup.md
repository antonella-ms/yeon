---
name: Discord bot setup
description: Common pitfalls when wiring a Discord.js bot with DISCORD_BOT_TOKEN/DISCORD_CLIENT_ID secrets.
---

- `DISCORD_CLIENT_ID` (Application ID) must come from the **same** Discord application as `DISCORD_BOT_TOKEN`. If a user pastes the ID from a different app, guild command registration fails with `DiscordAPIError[10002]: Unknown Application` even though login succeeds.
  **Why:** login only needs a valid token; the REST `applications/{id}/guilds/{guildId}/commands` PUT call needs the ID to match the token's own application, and Discord gives no hint that they're mismatched beyond "Unknown Application".
  **How to apply:** if commands fail to register but the bot logs in fine, ask the user to re-copy the Application ID from OAuth2 → General on the exact application page where they generated the token.
- Registering slash commands per-guild (on `ClientReady` for each cached guild, plus on `GuildCreate`) makes commands available instantly, unlike global registration which can take up to an hour to propagate.
