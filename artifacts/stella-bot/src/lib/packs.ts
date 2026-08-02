import { db, userPacksTable, type PackCode } from "@workspace/db";
import { eq } from "drizzle-orm";

// NUEVO: versión recortada del lib/packs.ts de Ye-on -- Stella solo
// necesita crear packs SIN ABRIR (para /gift) y sus definiciones/emoji,
// nunca la lógica de generar cartas al azar (eso es de /use, que Stella
// no tiene). Si se agrega un pack nuevo en Ye-on, hay que copiar su
// entrada acá también -- no comparten el mismo archivo.

export const PACK_HASH_CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";
export const PACK_HASH_LENGTH = 6;

type PackDefinition = {
  code: PackCode;
  name: string;
  emoji: string;
  description: string;
};

export const PACK_DEFINITIONS: Record<PackCode, PackDefinition> = {
  PST: {
    code: "PST",
    name: "Style Pack",
    emoji: "<:packstyle:1527550976716832949>",
    description: "4 cartas comunes y 1 rara, generadas al azar",
  },
  PTC: {
    code: "PTC",
    name: "The Chase Pack",
    emoji: "<:packthechase:1527550911830818926>",
    description: "2 cartas comunes y 3 raras, generadas al azar",
  },
  PRU: {
    code: "PRU",
    name: "Rude Pack",
    emoji: "<:packrude:1527550835926499440>",
    description: "Elegí 3 de 15 cartas del inventario de Ye-on",
  },
  PLT: {
    code: "PLT",
    name: "Lemon Tang Pack",
    emoji: "<:packlemontang:1527550774190538854>",
    description: "5 cartas de las últimas 3 eras del grupo que elijas",
  },
  PHA: {
    code: "PHA",
    name: "Hamssong Pack",
    emoji: "<:packhamssong:1527550710143651840>",
    description: "5 cartas (sin rareza 1) del grupo e idol que elijas, generadas",
  },
  PBF: {
    code: "PBF",
    name: "Butterflies Pack",
    emoji: "<:packbutterflies:1531509026083311626>",
    description: "5 cartas de rareza 3, generadas al azar",
  },
  PBM: {
    code: "PBM",
    name: "Blue Moon Pack",
    emoji: "<:packbluemoon:1531509168790306888>",
    description: "5 cartas de rareza 2, generadas al azar",
  },
  PHE: {
    code: "PHE",
    name: "Heart Emoji Pack",
    emoji: "<:packheartemoji:1531509357408419840>",
    description: "5 cartas de rareza 1, generadas al azar",
  },
  P15: {
    code: "P15",
    name: "15 Love Pack",
    emoji: "<:pack15love:1531509524010106921>",
    description: "3 cartas de rareza 3 del grupo que elijas",
  },
  PAP: {
    code: "PAP",
    name: "Apple Pie Pack",
    emoji: "<:packapplepie:1531509694063972455>",
    description: "1 carta de rareza 1, 3 de rareza 2 y 1 de rareza 3, generadas al azar",
  },
};

function randomHash(): string {
  let hash = "";
  for (let i = 0; i < PACK_HASH_LENGTH; i++) {
    hash += PACK_HASH_CHARS[Math.floor(Math.random() * PACK_HASH_CHARS.length)];
  }
  return hash;
}

async function generateUniquePackHash(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = randomHash();
    const existing = await db.query.userPacksTable.findFirst({
      where: eq(userPacksTable.hash, candidate),
    });
    if (!existing) return candidate;
  }
  throw new Error("No se pudo generar un hash único para el pack.");
}

export async function createUserPack(ownerId: string, packCode: PackCode) {
  const hash = await generateUniquePackHash();
  const [pack] = await db.insert(userPacksTable).values({ ownerId, packCode, hash }).returning();
  return pack!;
}

export function formatPackCode(packCode: PackCode, hash: string): string {
  return `${packCode}.${hash}`;
}
