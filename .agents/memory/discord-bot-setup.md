---
name: Discord bot setup
description: Common pitfalls when wiring a Discord.js bot with DISCORD_BOT_TOKEN/DISCORD_CLIENT_ID secrets, and Ye-on Bot's card-code/copy-number scheme.
---

- `DISCORD_CLIENT_ID` (Application ID) must come from the **same** Discord application as `DISCORD_BOT_TOKEN`. If a user pastes the ID from a different app, guild command registration fails with `DiscordAPIError[10002]: Unknown Application` even though login succeeds.
  **Why:** login only needs a valid token; the REST `applications/{id}/guilds/{guildId}/commands` PUT call needs the ID to match the token's own application, and Discord gives no hint that they're mismatched beyond "Unknown Application".
  **How to apply:** if commands fail to register but the bot logs in fine, ask the user to re-copy the Application ID from OAuth2 → General on the exact application page where they generated the token.
- Registering slash commands per-guild (on `ClientReady` for each cached guild, plus on `GuildCreate`) makes commands available instantly, unlike global registration which can take up to an hour to propagate.
- Ye-on Bot (kpop card-collecting bot): each card design has a letters-only trade `code` (group initials + idol initials, e.g. `ENSU` for ENHYPEN Sunghoon) and an `era` column defaulted to "—" until eras are defined. Each owned copy has a `copyNumber` assigned once at drop time (count of existing copies for that design + 1) that never changes even after trades. This scheme is explicitly provisional — the user plans to wipe and reseed all cards once eras and card art are finalized, so don't over-invest in the current code-generation heuristic.
- Adding a UNIQUE constraint via `drizzle-kit push` on a non-empty Postgres table triggers an interactive "truncate?" prompt that has no non-interactive flag (even `--force` doesn't skip it) — it throws `Interactive prompts require a TTY`. Workaround: apply the constraint with a raw `ALTER TABLE ... ADD CONSTRAINT ... UNIQUE` via a script after backfilling data, then rerun `push` to confirm "No changes detected".
