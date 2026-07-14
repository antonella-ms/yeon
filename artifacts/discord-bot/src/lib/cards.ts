import { EmbedBuilder } from "discord.js";
import { db, cardsTable, userCardsTable, type Card, type CardRarity } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

export const RARITY_COLORS: Record<CardRarity, number> = {
  common: 0x9aa3ad,
  rare: 0x4d8fdc,
  epic: 0xa15bde,
  legendary: 0xe8b93b,
};

export const RARITY_LABELS: Record<CardRarity, string> = {
  common: "Común",
  rare: "Rara",
  epic: "Épica",
  legendary: "★ Legendaria ★",
};

// Provisional 3-tier drop odds: rareza 1 (common) 65%, rareza 2 (rare) 25%,
// rareza 3 (epic + legendary) 10%, split unevenly so legendary stays the rarest.
const RARITY_WEIGHTS: Record<CardRarity, number> = {
  common: 65,
  rare: 25,
  epic: 7,
  legendary: 3,
};

/** Picks `count` random card designs from the catalog, weighted by rarity. */
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

export function cardEmbed(card: Card, opts?: { title?: string; footer?: string }) {
  const embed = new EmbedBuilder()
    .setColor(RARITY_COLORS[card.rarity])
    .setTitle(opts?.title ?? `${card.memberName} — ${card.groupName}`)
    .addFields(
      { name: "Grupo", value: card.groupName, inline: true },
      { name: "Rareza", value: RARITY_LABELS[card.rarity], inline: true },
    );

  if (card.imageUrl) {
    embed.setImage(card.imageUrl);
  }
  if (opts?.footer) {
    embed.setFooter({ text: opts.footer });
  }

  return embed;
}

/**
 * Gives a fresh copy of `cardId` to `ownerId`, assigning the next sequential
 * copy number for that card design (1st ever dropped, 2nd, etc). Copy numbers
 * never get reused, even if earlier copies are traded away.
 */
export async function giveCardToPlayer(ownerId: string, cardId: number) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(userCardsTable)
    .where(eq(userCardsTable.cardId, cardId));

  const [userCard] = await db
    .insert(userCardsTable)
    .values({ ownerId, cardId, copyNumber: Number(count) + 1 })
    .returning();
  return userCard!;
}

export async function getCardById(cardId: number): Promise<Card | undefined> {
  return db.query.cardsTable.findFirst({ where: eq(cardsTable.id, cardId) });
}
