import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import type { Card } from "@workspace/db";

export type DropSession = {
  id: string;
  cards: Card[];
  claimedCardIndexes: Map<number, string>; // cardIndex -> claimerUsername
  claimedUserIds: Set<string>; // users who already claimed a card from this drop
  expired: boolean;
};

const activeDrops = new Map<string, DropSession>();

let dropCounter = 0;

export function createDropSession(cards: Card[]): DropSession {
  dropCounter += 1;
  const session: DropSession = {
    id: `${Date.now()}-${dropCounter}`,
    cards,
    claimedCardIndexes: new Map(),
    claimedUserIds: new Set(),
    expired: false,
  };
  activeDrops.set(session.id, session);
  return session;
}

export function getDropSession(id: string): DropSession | undefined {
  return activeDrops.get(id);
}

export function expireDropSession(id: string) {
  const session = activeDrops.get(id);
  if (session) {
    session.expired = true;
    activeDrops.delete(id);
  }
}

export function buildDropRows(session: DropSession): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>();

  session.cards.forEach((card, idx) => {
    const claimedBy = session.claimedCardIndexes.get(idx);
    const button = new ButtonBuilder()
      .setCustomId(`drop:claim:${session.id}:${idx}`)
      .setStyle(claimedBy ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setLabel(claimedBy ? `Reclamada por ${claimedBy}` : `Reclamar a ${card.memberName}`)
      .setDisabled(Boolean(claimedBy) || session.expired);
    row.addComponents(button);
  });

  return [row];
}
