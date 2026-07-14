import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Rarity tiers, ordered from most to least common.
export const CARD_RARITIES = ["common", "rare", "epic", "legendary"] as const;
export type CardRarity = (typeof CARD_RARITIES)[number];

// The catalog of collectible idol cards. Each row is a "design" (one idol,
// one rarity) -- individual copies owned by players live in userCardsTable.
export const cardsTable = pgTable("cards", {
  id: serial("id").primaryKey(),
  groupName: text("group_name").notNull(),
  memberName: text("member_name").notNull(),
  rarity: text("rarity", { enum: CARD_RARITIES }).notNull().default("common"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertCardSchema = createInsertSchema(cardsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCard = z.infer<typeof insertCardSchema>;
export type Card = typeof cardsTable.$inferSelect;
