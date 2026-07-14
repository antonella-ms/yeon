import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { playersTable } from "./players";
import { cardsTable } from "./cards";

// One row per physical copy of a card owned by a player. A player can own
// several copies of the same card design (each is its own instance/row).
export const userCardsTable = pgTable("user_cards", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => playersTable.discordId),
  cardId: integer("card_id")
    .notNull()
    .references(() => cardsTable.id),
  // Which numbered copy of this card design this is (1st ever dropped, 2nd, etc).
  // Assigned once at drop time and never changes, even if the card is traded.
  copyNumber: integer("copy_number").notNull(),
  obtainedAt: timestamp("obtained_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertUserCardSchema = createInsertSchema(userCardsTable).omit({
  id: true,
  obtainedAt: true,
});
export type InsertUserCard = z.infer<typeof insertUserCardSchema>;
export type UserCard = typeof userCardsTable.$inferSelect;
