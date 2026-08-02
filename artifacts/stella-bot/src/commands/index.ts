import type { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import * as resetCooldown from "./reset_cooldown";
import * as gift from "./gift";

export type Command = {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

export const commands: Command[] = [resetCooldown, gift] as unknown as Command[];
