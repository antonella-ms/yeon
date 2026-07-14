import { db, playersTable, type Player } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const STARTING_COINS = 200;
const DAILY_MIN = 80;
const DAILY_MAX = 150;
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Fetches a player, creating a fresh row (with starting coins) on first contact. */
export async function getOrCreatePlayer(
  discordId: string,
  username: string,
): Promise<Player> {
  const existing = await db.query.playersTable.findFirst({
    where: (p, { eq: eqOp }) => eqOp(p.discordId, discordId),
  });

  if (existing) {
    if (existing.username !== username) {
      const [updated] = await db
        .update(playersTable)
        .set({ username })
        .where(eq(playersTable.discordId, discordId))
        .returning();
      return updated!;
    }
    return existing;
  }

  const [created] = await db
    .insert(playersTable)
    .values({ discordId, username, coins: STARTING_COINS })
    .returning();
  return created!;
}

export async function addCoins(discordId: string, amount: number): Promise<Player> {
  const [updated] = await db
    .update(playersTable)
    .set({ coins: sqlIncrement(amount) })
    .where(eq(playersTable.discordId, discordId))
    .returning();
  return updated!;
}

// Small helper so coin balances update atomically instead of read-then-write.
function sqlIncrement(amount: number) {
  return sql`${playersTable.coins} + ${amount}`;
}

export type DailyClaimResult =
  | { success: true; amount: number; newBalance: number }
  | { success: false; remainingMs: number };

export async function claimDaily(discordId: string, username: string): Promise<DailyClaimResult> {
  const player = await getOrCreatePlayer(discordId, username);
  const now = new Date();

  if (player.lastDailyAt) {
    const elapsed = now.getTime() - player.lastDailyAt.getTime();
    if (elapsed < DAILY_COOLDOWN_MS) {
      return { success: false, remainingMs: DAILY_COOLDOWN_MS - elapsed };
    }
  }

  const amount = Math.floor(Math.random() * (DAILY_MAX - DAILY_MIN + 1)) + DAILY_MIN;

  const [updated] = await db
    .update(playersTable)
    .set({ coins: sqlIncrement(amount), lastDailyAt: now })
    .where(eq(playersTable.discordId, discordId))
    .returning();

  return { success: true, amount, newBalance: updated!.coins };
}
