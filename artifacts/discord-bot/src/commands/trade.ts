import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { db, tradesTable, userCardsTable, cardsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getOrCreatePlayer } from "../lib/economy";

export const data = new SlashCommandBuilder()
  .setName("trade")
  .setDescription("Intercambia cartas con otro coleccionista")
  .addSubcommand((sub) =>
    sub
      .setName("offer")
      .setDescription("Ofrece una carta tuya a cambio de una carta de otra persona")
      .addUserOption((opt) => opt.setName("usuario").setDescription("Con quién quieres intercambiar").setRequired(true))
      .addIntegerOption((opt) => opt.setName("mi_carta").setDescription("ID de tu carta (ver /inventory)").setRequired(true))
      .addIntegerOption((opt) => opt.setName("su_carta").setDescription("ID de la carta que quieres a cambio").setRequired(true)),
  )
  .addSubcommand((sub) => sub.setName("list").setDescription("Muestra tus intercambios pendientes"))
  .addSubcommand((sub) =>
    sub
      .setName("cancel")
      .setDescription("Cancela un intercambio que tú iniciaste")
      .addIntegerOption((opt) => opt.setName("id").setDescription("ID del intercambio").setRequired(true)),
  );

async function getOwnedCard(instanceId: number, ownerId: string) {
  const row = await db.query.userCardsTable.findFirst({
    where: (uc, { eq: eqOp, and: andOp }) => andOp(eqOp(uc.id, instanceId), eqOp(uc.ownerId, ownerId)),
  });
  return row;
}

async function describeCard(instanceId: number) {
  const rows = await db
    .select({
      memberName: cardsTable.memberName,
      groupName: cardsTable.groupName,
      code: cardsTable.code,
      copyNumber: userCardsTable.copyNumber,
    })
    .from(userCardsTable)
    .innerJoin(cardsTable, eq(userCardsTable.cardId, cardsTable.id))
    .where(eq(userCardsTable.id, instanceId));
  return rows[0];
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "offer") {
    const targetUser = interaction.options.getUser("usuario", true);
    const myCardId = interaction.options.getInteger("mi_carta", true);
    const theirCardId = interaction.options.getInteger("su_carta", true);

    if (targetUser.id === interaction.user.id) {
      await interaction.reply({ content: "No puedes intercambiar contigo mismo.", ephemeral: true });
      return;
    }

    const myCard = await getOwnedCard(myCardId, interaction.user.id);
    if (!myCard) {
      await interaction.reply({ content: `No tienes ninguna carta con el ID ${myCardId}.`, ephemeral: true });
      return;
    }

    const theirCard = await getOwnedCard(theirCardId, targetUser.id);
    if (!theirCard) {
      await interaction.reply({ content: `${targetUser.username} no tiene ninguna carta con el ID ${theirCardId}.`, ephemeral: true });
      return;
    }

    await getOrCreatePlayer(interaction.user.id, interaction.user.username);
    await getOrCreatePlayer(targetUser.id, targetUser.username);

    const [trade] = await db
      .insert(tradesTable)
      .values({
        initiatorId: interaction.user.id,
        initiatorUserCardId: myCardId,
        recipientId: targetUser.id,
        recipientUserCardId: theirCardId,
      })
      .returning();

    const myDesc = await describeCard(myCardId);
    const theirDesc = await describeCard(theirCardId);

    const embed = new EmbedBuilder()
      .setColor(0xf2c9dc)
      .setTitle(`🔁 Propuesta de intercambio #${trade!.id}`)
      .setDescription(
        `${interaction.user.username} ofrece **${myDesc?.memberName}** (${myDesc?.groupName}) \`${myDesc?.code}#${myDesc?.copyNumber}\`\n` +
          `a cambio de **${theirDesc?.memberName}** (${theirDesc?.groupName}) \`${theirDesc?.code}#${theirDesc?.copyNumber}\` de ${targetUser.username}.`,
      )
      .setFooter({ text: `Solo ${targetUser.username} puede aceptar o rechazar` });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`trade:accept:${trade!.id}`).setLabel("Aceptar").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`trade:decline:${trade!.id}`).setLabel("Rechazar").setStyle(ButtonStyle.Danger),
    );

    await interaction.reply({ content: `<@${targetUser.id}>`, embeds: [embed], components: [row] });
    return;
  }

  if (sub === "list") {
    const pending = await db.query.tradesTable.findMany({
      where: (t, { eq: eqOp, and: andOp, or: orOp }) =>
        andOp(
          eqOp(t.status, "pending"),
          orOp(eqOp(t.initiatorId, interaction.user.id), eqOp(t.recipientId, interaction.user.id)),
        ),
    });

    if (pending.length === 0) {
      await interaction.reply({ content: "No tienes intercambios pendientes.", ephemeral: true });
      return;
    }

    const lines = pending.map((t) => {
      const role = t.initiatorId === interaction.user.id ? "enviaste" : "recibiste";
      return `#${t.id} — ${role} (con <@${t.initiatorId === interaction.user.id ? t.recipientId : t.initiatorId}>)`;
    });

    await interaction.reply({ content: lines.join("\n"), ephemeral: true });
    return;
  }

  if (sub === "cancel") {
    const tradeId = interaction.options.getInteger("id", true);
    const trade = await db.query.tradesTable.findFirst({ where: eq(tradesTable.id, tradeId) });

    if (!trade || trade.initiatorId !== interaction.user.id || trade.status !== "pending") {
      await interaction.reply({ content: "No se encontró un intercambio pendiente tuyo con ese ID.", ephemeral: true });
      return;
    }

    await db
      .update(tradesTable)
      .set({ status: "cancelled", respondedAt: new Date() })
      .where(eq(tradesTable.id, tradeId));

    await interaction.reply({ content: `Intercambio #${tradeId} cancelado.`, ephemeral: true });
  }
}

export async function handleTradeButton(interaction: ButtonInteraction, action: "accept" | "decline", tradeId: number) {
  const trade = await db.query.tradesTable.findFirst({ where: eq(tradesTable.id, tradeId) });

  if (!trade || trade.status !== "pending") {
    await interaction.reply({ content: "Este intercambio ya no está disponible.", ephemeral: true });
    return;
  }

  if (interaction.user.id !== trade.recipientId) {
    await interaction.reply({ content: "Solo la persona invitada puede responder este intercambio.", ephemeral: true });
    return;
  }

  if (action === "decline") {
    await db.update(tradesTable).set({ status: "declined", respondedAt: new Date() }).where(eq(tradesTable.id, tradeId));
    await interaction.update({ content: "❌ Intercambio rechazado.", embeds: [], components: [] });
    return;
  }

  // Swap ownership of the two card copies.
  await db
    .update(userCardsTable)
    .set({ ownerId: trade.recipientId })
    .where(and(eq(userCardsTable.id, trade.initiatorUserCardId), eq(userCardsTable.ownerId, trade.initiatorId)));

  await db
    .update(userCardsTable)
    .set({ ownerId: trade.initiatorId })
    .where(and(eq(userCardsTable.id, trade.recipientUserCardId), eq(userCardsTable.ownerId, trade.recipientId)));

  await db.update(tradesTable).set({ status: "accepted", respondedAt: new Date() }).where(eq(tradesTable.id, tradeId));

  await interaction.update({ content: "✅ ¡Intercambio completado!", embeds: [], components: [] });
}
