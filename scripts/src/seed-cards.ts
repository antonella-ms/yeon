// Seeds the card catalog used by Ye-on Bot with a starting roster of idols.
// Run with: pnpm --filter @workspace/scripts run seed-cards
import { db, cardsTable, type CardRarity } from "@workspace/db";

type SeedCard = {
  groupName: string;
  memberName: string;
  rarity: CardRarity;
};

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

const seedCards: SeedCard[] = Object.entries(GROUPS).flatMap(
  ([groupName, members]) =>
    members.map(([memberName, rarity]) => ({ groupName, memberName, rarity })),
);

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
