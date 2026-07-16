import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Tracks per-user cooldowns for commands like /drop and /daily, so the bot
// can ping the person in the right channel exactly when their cooldown
// ends -- even across restarts, since this is persisted to the database
// instead of kept in memory.
export const COOLDOWN_KINDS = ["drop", "daily"] as const;
export type CooldownKind = (typeof COOLDOWN_KINDS)[number];

export const cooldownsTable = pgTable("cooldowns", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  kind: text("kind", { enum: COOLDOWN_KINDS }).notNull(),
  // The channel where the command was used, so the "ready" ping lands in a
  // place the person will actually see.
  channelId: text("channel_id").notNull(),
  // When this cooldown is over and the person can use the command again.
  readyAt: timestamp("ready_at", { withTimezone: true }).notNull(),
  // Whether the bot already sent the "you can use it again" ping for this
  // cooldown. Prevents double-pinging if the watcher runs more than once
  // before the row is cleared, and lets old rows be told apart from active
  // ones.
  notified: boolean("notified").notNull().default(false),
});

export const insertCooldownSchema = createInsertSchema(cooldownsTable).omit({
  id: true,
});
export type InsertCooldown = z.infer<typeof insertCooldownSchema>;
export type Cooldown = typeof cooldownsTable.$inferSelect;