import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Rarity tiers, stored as plain integers 1/2/3 (1 = most common, 3 =
// rarest). Each idol has exactly one card design per tier (three designs
// per idol total), each with its own code suffix matching the tier number,
// e.g. "ATMA" -> ATMA1/ATMA2/ATMA3.
export const CARD_RARITIES = [1, 2, 3] as const;
export type CardRarity = (typeof CARD_RARITIES)[number];

// Kept for readability in places that want a label instead of the bare
// number (e.g. command descriptions). The number IS the rarity now, this
// is purely cosmetic.
export const RARITY_LABELS_BASE: Record<CardRarity, string> = {
  1: "Común",
  2: "Rara",
  3: "Épica",
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
  // 1 = common, 2 = rare, 3 = epic.
  rarity: integer("rarity").notNull().default(1),
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