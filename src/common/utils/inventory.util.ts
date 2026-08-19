import { Prisma, StockMovementType } from '../../../generated/prisma/client';

export interface AdjustInventoryParams {
  id_product: string;
  id_merchant: string;
  id_user: string;
  id_transaction?: string | null;
  quantity_change: number; // Positive to increment stock, negative to decrement
  movement_type: StockMovementType;
  notes: string;
}

/**
 * Shared utility to adjust inventory stock and write audit trail history
 * using a Prisma Transaction Client.
 */
export async function adjustInventoryAndHistory(
  tx: Prisma.TransactionClient,
  params: AdjustInventoryParams,
): Promise<void> {
  const {
    id_product,
    id_merchant,
    id_user,
    id_transaction,
    quantity_change,
    movement_type,
    notes,
  } = params;

  await tx.inventory.update({
    where: { id_product },
    data: { current_stock: { increment: quantity_change } },
  });

  await tx.stockHistory.create({
    data: {
      id_product,
      id_merchant,
      id_user,
      id_transaction,
      movement_type,
      quantity: quantity_change,
      notes,
    },
  });
}
