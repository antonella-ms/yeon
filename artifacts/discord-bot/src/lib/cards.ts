import { EmbedBuilder } from "discord.js";
import { db, cardsTable, userCardsTable, type Card, type CardRarity, type UserCard } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

export const RARITY_COLORS: Record<CardRarity, number> = {
  1: 0x9aa3ad,
  2: 0x4d8fdc,
  3: 0xa15bde,
};

export const RARITY_LABELS: Record<CardRarity, string> = {
  1: "Común",
  2: "Rara",
  3: "Épica",
};

// Lemon emojis shown before the group/era line, one per rarity tier
// (1 for common, 2 for rare, 3 for epic).
export const RARITY_DIAMONDS: Record<CardRarity, string> = {
  1: "🍋",
  2: "🍋🍋",
  3: "🍋🍋🍋",
};

// 3-tier drop odds: rareza 1 65%, rareza 2 25%, rareza 3 10%.
const RARITY_WEIGHTS: Record<CardRarity, number> = {
  1: 65,
  2: 25,
  3: 10,
};
// 3-tier drop odds: rareza 1 (common) 65%, rareza 2 (rare) 25%,
// rareza 3 (epic) 10%.
const RARITY_WEIGHTS: Record<CardRarity, number> = {
  common: 65,
  rare: 25,
  epic: 10,
};

const HASH_CHARS = "0123456789abcdef";
const HASH_LENGTH = 4;
const MAX_HASH_ATTEMPTS = 20;

function randomHash(): string {
  let hash = "";
  for (let i = 0; i < HASH_LENGTH; i++) {
    hash += HASH_CHARS[Math.floor(Math.random() * HASH_CHARS.length)];
  }
  return hash;
}

async function generateUniqueHash(): Promise<string> {
  for (let attempt = 0; attempt < MAX_HASH_ATTEMPTS; attempt++) {
    const candidate = randomHash();
    const existing = await db.query.userCardsTable.findFirst({
      where: eq(userCardsTable.hash, candidate),
    });
    if (!existing) return candidate;
  }
  throw new Error(
    "Could not generate a unique card hash after multiple attempts. The hash space may be nearly exhausted.",
  );
}

export function formatCardCode(card: Card, userCard: UserCard): string {
  return `${card.code}.${userCard.hash}`;
}

export async function pickRandomCards(count: number): Promise<Card[]> {
  const allCards = await db.query.cardsTable.findMany();
  if (allCards.length === 0) return [];

  const picks: Card[] = [];
  for (let i = 0; i < count; i++) {
    picks.push(weightedPick(allCards));
  }
  return picks;
}

function weightedPick(cards: Card[]): Card {
  const totalWeight = cards.reduce((sum, c) => sum + RARITY_WEIGHTS[c.rarity], 0);
  let roll = Math.random() * totalWeight;
  for (const card of cards) {
    roll -= RARITY_WEIGHTS[card.rarity];
    if (roll <= 0) return card;
  }
  return cards[cards.length - 1]!;
}

export function cardEmbed(card: Card) {
  const embed = new EmbedBuilder().setColor(RARITY_COLORS[card.rarity]);

  if (card.imageUrl) {
    embed.setImage(card.imageUrl);
  }

  return embed;
}

export async function giveCardToPlayer(ownerId: string, cardId: number) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(userCardsTable)
    .where(eq(userCardsTable.cardId, cardId));

  const hash = await generateUniqueHash();

  const [userCard] = await db
    .insert(userCardsTable)
    .values({ ownerId, cardId, copyNumber: Number(count) + 1, hash })
    .returning();
  return userCard!;
}

export async function getCardById(cardId: number): Promise<Card | undefined> {
  return db.query.cardsTable.findFirst({ where: eq(cardsTable.id, cardId) });
}