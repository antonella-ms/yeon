// Seeds the card catalog used by Ye-on Bot with a starting roster of idols.
// Run with: pnpm --filter @workspace/scripts run seed-cards
import { db, cardsTable, type CardRarity } from "@workspace/db";

type SeedCard = {
  groupName: string;
  memberName: string;
  rarity: CardRarity;
  code: string;
};

// Deliberately short, memorable 2-letter group initials, chosen to avoid
// clashes with each other. Era initials will be folded in once eras exist
// (for now every card's `era` column defaults to "—").
const GROUP_CODES: Record<string, string> = {
  aespa: "AE",
  "&TEAM": "AT",
  ENHYPEN: "EN",
  ATEEZ: "TZ",
  ILLIT: "IL",
  TWICE: "TW",
  "Stray Kids": "SK",
};

// Letters-only idol code, growing from 2 letters only if needed to stay
// unique within the group (never falls back to digits).
function idolCode(memberName: string, taken: Set<string>): string {
  const cleaned = memberName.replace(/[^a-zA-Z]/g, "").toUpperCase();
  for (let len = 2; len <= Math.max(cleaned.length, 2); len++) {
    const candidate = cleaned.slice(0, len);
    if (!taken.has(candidate)) return candidate;
  }
  return cleaned;
}

const GROUPS: Record<string, [string, CardRarity][]> = {
  aespa: [
    ["Karina", "legendary"],
    ["Winter", "epic"],
    ["Giselle", "rare"],
    ["Ningning", "rare"],
  ],
  "&TEAM": [
    ["Fuma", "legendary"],
    ["EJ", "epic"],
    ["K", "rare"],
    ["Nicholas", "common"],
    ["Taki", "common"],
    ["Maki", "rare"],
    ["Yuma", "common"],
    ["Jo", "common"],
  ],
  ENHYPEN: [
    ["Jungwon", "legendary"],
    ["Heeseung", "epic"],
    ["Jay", "rare"],
    ["Jake", "rare"],
    ["Sunghoon", "common"],
    ["Sunoo", "common"],
    ["Ni-ki", "epic"],
  ],
  ATEEZ: [
    ["Hongjoong", "legendary"],
    ["Seonghwa", "epic"],
    ["Yunho", "rare"],
    ["Yeosang", "rare"],
    ["San", "epic"],
    ["Mingi", "common"],
    ["Wooyoung", "common"],
    ["Jongho", "common"],
  ],
  ILLIT: [
    ["Yunah", "legendary"],
    ["Minju", "epic"],
    ["Moka", "rare"],
    ["Wonhee", "common"],
    ["Iroha", "common"],
  ],
  TWICE: [
    ["Nayeon", "legendary"],
    ["Jeongyeon", "common"],
    ["Momo", "epic"],
    ["Sana", "rare"],
    ["Jihyo", "epic"],
    ["Mina", "rare"],
    ["Dahyun", "common"],
    ["Chaeyoung", "common"],
    ["Tzuyu", "rare"],
  ],
  "Stray Kids": [
    ["Bang Chan", "legendary"],
    ["Lee Know", "epic"],
    ["Changbin", "common"],
    ["Hyunjin", "epic"],
    ["Han", "rare"],
    ["Felix", "rare"],
    ["Seungmin", "common"],
    ["I.N", "common"],
  ],
};

const seedCards: SeedCard[] = Object.entries(GROUPS).flatMap(([groupName, members]) => {
  const groupCode = GROUP_CODES[groupName] ?? groupName.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase();
  const taken = new Set<string>();
  return members.map(([memberName, rarity]) => {
    const idol = idolCode(memberName, taken);
    taken.add(idol);
    return { groupName, memberName, rarity, code: `${groupCode}${idol}` };
  });
});

async function main() {
  console.log(`Seeding ${seedCards.length} cards...`);

  for (const card of seedCards) {
    // Avoid duplicate rows if the script is run more than once.
    const existing = await db.query.cardsTable.findFirst({
      where: (c, { and, eq }) =>
        and(eq(c.groupName, card.groupName), eq(c.memberName, card.memberName)),
    });

    if (existing) {
      console.log(`Skipping ${card.groupName} - ${card.memberName} (already exists)`);
      continue;
    }

    await db.insert(cardsTable).values(card);
    console.log(`Added ${card.groupName} - ${card.memberName} [${card.rarity}]`);
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
