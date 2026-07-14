import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// One row per Discord user who has interacted with the bot.
export const playersTable = pgTable("players", {
  discordId: text("discord_id").primaryKey(),
  username: text("username").notNull(),
  coins: integer("coins").notNull().default(200),
  lastDailyAt: timestamp("last_daily_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertPlayerSchema = createInsertSchema(playersTable).omit({
  createdAt: true,
});
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof playersTable.$inferSelect;
