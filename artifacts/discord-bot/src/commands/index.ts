import type { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import * as drop from "./drop";
import * as balance from "./balance";
import * as daily from "./daily";
import * as inventory from "./inventory";
import * as catalog from "./catalog";
import * as profile from "./profile";
import * as trade from "./trade";
import * as market from "./market";
import * as leaderboard from "./leaderboard";
import * as help from "./help";
import * as view from "./view";

export type Command = {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

export const commands: Command[] = [
  drop,
  balance,
  daily,
  inventory,
  catalog,
  profile,
  trade,
  market,
  leaderboard,
  help,
  view,
] as unknown as Command[];

export { drop, inventory, catalog, trade, market, view };