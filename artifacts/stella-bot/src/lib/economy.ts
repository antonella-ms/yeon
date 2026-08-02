import { db, playersTable, type Player } from "@workspace/db";
import { eq } from "drizzle-orm";

const STARTING_COINS = 200;

// NUEVO: versión recortada del lib/economy.ts de Ye-on -- Stella solo
// necesita crear/leer un jugador (para /gift) y resetear el cooldown de
// /daily (para /reset_cooldown). Todo lo demás (streak, claimDaily,
// addCoins, recordFirstAction) es lógica de juego que sigue viviendo
// exclusivamente en Ye-on.

/** Fetches a player, creating a fresh row (with starting coins) on first
 * contact. */
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

/**
 * Clears a player's daily cooldown early (used by /reset_cooldown), by
 * setting lastDailyAt back to null. This is separate from the cooldowns
 * table -- /daily's cooldown has always lived on the players row, so
 * resetting it here is what actually lets someone claim /daily again.
 */
export async function resetDailyCooldown(discordId: string): Promise<void> {
  await db
    .update(playersTable)
    .set({ lastDailyAt: null })
    .where(eq(playersTable.discordId, discordId));
}

/** Clears the daily cooldown for every player at once. */
export async function resetAllDailyCooldowns(): Promise<void> {
  await db.update(playersTable).set({ lastDailyAt: null });
}
