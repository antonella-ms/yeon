import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Rarity tiers, ordered from most to least common. Each idol has exactly
// one card design per tier (three designs per idol total), each with its
// own code suffix: base code + tier number, e.g. "ATMA" -> ATMA1/ATMA2/ATMA3.
export const CARD_RARITIES = ["common", "rare", "epic"] as const;
export type CardRarity = (typeof CARD_RARITIES)[number];

// Maps each rarity to its numeric suffix used in the display code
// (base code + 1/2/3).
export const RARITY_TIER: Record<CardRarity, 1 | 2 | 3> = {
  common: 1,
  rare: 2,
  epic: 3,
};

// The catalog of collectible idol cards. Each row is a "design" (one idol,
// one rarity tier) -- individual copies owned by players live in
// userCardsTable. `code` already includes the rarity suffix (e.g. "T2J2").
export const cardsTable = pgTable("cards", {
  id: serial("id").primaryKey(),
  groupName: text("group_name").notNull(),
  memberName: text("member_name").notNull(),
  // Trade code: base code (group + era + idol initials, e.g. "T2J") plus
  // the rarity tier digit, e.g. "T2J2" for a rare design.
  code: text("code").notNull().unique(),
  // Human-readable era label, e.g. "ASSEMBLE25".
  era: text("era").notNull().default("—"),
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