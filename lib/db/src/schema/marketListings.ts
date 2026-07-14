import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { playersTable } from "./players";
import { userCardsTable } from "./userCards";

export const LISTING_STATUSES = ["active", "sold", "cancelled"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

// A card copy a player has put up for sale in the coin market.
export const marketListingsTable = pgTable("market_listings", {
  id: serial("id").primaryKey(),
  sellerId: text("seller_id")
    .notNull()
    .references(() => playersTable.discordId),
  userCardId: integer("user_card_id")
    .notNull()
    .references(() => userCardsTable.id),
  price: integer("price").notNull(),
  status: text("status", { enum: LISTING_STATUSES }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  soldAt: timestamp("sold_at", { withTimezone: true }),
  buyerId: text("buyer_id").references(() => playersTable.discordId),
});

export const insertMarketListingSchema = createInsertSchema(
  marketListingsTable,
).omit({
  id: true,
  createdAt: true,
  soldAt: true,
  buyerId: true,
});
export type InsertMarketListing = z.infer<typeof insertMarketListingSchema>;
export type MarketListing = typeof marketListingsTable.$inferSelect;
