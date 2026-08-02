import { db, cooldownsTable, type CooldownKind } from "@workspace/db";
import { eq, and } from "drizzle-orm";

// NUEVO: versión recortada del lib/cooldowns.ts de Ye-on -- Stella solo
// necesita LIMPIAR cooldowns (para /reset_cooldown), nunca crearlos ni
// vigilarlos. setCooldown/getCooldown/startCooldownWatcher siguen siendo
// trabajo exclusivo de Ye-on; si Stella también corriera el watcher,
// mandaría avisos de "ya podés usar /drop" duplicados.

/**
 * Clears a cooldown early (used by /reset_cooldown). If `kind` is omitted,
 * clears every kind for that user. Returns how many rows were removed.
 */
export async function clearCooldown(userId: string, kind?: CooldownKind): Promise<number> {
  const conditions = kind
    ? and(eq(cooldownsTable.userId, userId), eq(cooldownsTable.kind, kind))
    : eq(cooldownsTable.userId, userId);
  const deleted = await db.delete(cooldownsTable).where(conditions).returning();
  return deleted.length;
}

/**
 * Clears cooldowns for every user at once (used by /reset_cooldown with the
 * "everyone" option). If `kind` is omitted, clears every kind. Returns how
 * many rows were removed.
 */
export async function clearAllCooldowns(kind?: CooldownKind): Promise<number> {
  const deleted = kind
    ? await db.delete(cooldownsTable).where(eq(cooldownsTable.kind, kind)).returning()
    : await db.delete(cooldownsTable).returning();
  return deleted.length;
}
