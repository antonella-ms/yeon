import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { playersTable } from "./players";
import { userCardsTable } from "./userCards";

export const TRADE_STATUSES = [
  "pending",
  "accepted",
  "declined",
  "cancelled",
] as const;
export type TradeStatus = (typeof TRADE_STATUSES)[number];

// A trade offer: initiator offers one owned card copy to a recipient in
// exchange for one of the recipient's owned card copies.
export const tradesTable = pgTable("trades", {
  id: serial("id").primaryKey(),
  initiatorId: text("initiator_id")
    .notNull()
    .references(() => playersTable.discordId),
  initiatorUserCardId: integer("initiator_user_card_id")
    .notNull()
    .references(() => userCardsTable.id),
  recipientId: text("recipient_id")
    .notNull()
    .references(() => playersTable.discordId),
  recipientUserCardId: integer("recipient_user_card_id")
    .notNull()
    .references(() => userCardsTable.id),
  status: text("status", { enum: TRADE_STATUSES }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
});

export const insertTradeSchema = createInsertSchema(tradesTable).omit({
  id: true,
  createdAt: true,
  respondedAt: true,
});
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof tradesTable.$inferSelect;
