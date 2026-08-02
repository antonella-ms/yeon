import { db, playersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const DEFAULT_COLOR = 0xf5e6a3;

/**
 * Returns the accent color for the given player (the OWNER of whatever's
 * being displayed, not necessarily whoever ran the command). Falls back to
 * DEFAULT_COLOR if the player never set one, or if no ownerId is given.
 *
 * NUEVO: versión recortada del lib/theme.ts de Ye-on -- Stella no tiene
 * /theme, así que no necesita setPrimaryColor, solo leer el color ya
 * elegido para mostrar los embeds de /gift con el color de quien lo crea.
 */
export async function getPrimaryColor(ownerId?: string): Promise<number> {
  if (!ownerId) return DEFAULT_COLOR;
  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.discordId, ownerId),
  });
  if (player?.accentColor) {
    const parsed = parseInt(player.accentColor, 16);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return DEFAULT_COLOR;
}
