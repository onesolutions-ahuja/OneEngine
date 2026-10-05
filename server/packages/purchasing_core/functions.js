import { createInventoryMovement } from "../../services/inventory.js";
import { receivePurchase } from "../../services/purchaseReceiving.js";

export const packageFunctions = [
  {
    key: "purchase.receive",
    category: "PURCHASING",
    description: "Receive purchase stock through the protected purchasing transaction.",
    inputs: { type: "object", required: ["purchaseId"] },
    outputs: { type: "object" },
    permissionsAny: ["purchase.edit", "inventory.adjust", "purchases.receive"],
    handler: async ({ inputs = {}, client, pool, companyId, userId, req }) => {
      const ownsTransaction = !client;
      const transaction = client || (pool?.connect ? await pool.connect() : null);
      if (!transaction) throw new Error("Database transaction is required");
      try {
        if (ownsTransaction) await transaction.query("BEGIN");
        const result = await receivePurchase({
          client: transaction,
          purchaseId: inputs.purchaseId,
          companyId: companyId || req?.user?.companyId,
          userId: userId || req?.user?.id,
          storeId: inputs.storeId || req?.user?.storeId,
          requestedItems: inputs.requestedItems || null,
          receiptMeta: inputs.receiptMeta || { referenceNumber: inputs.receivingReference || null, notes: inputs.receivingNotes || null },
          createInventoryMovement,
        });
        if (ownsTransaction) await transaction.query("COMMIT");
        return result;
      } catch (error) {
        if (ownsTransaction) await transaction.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        if (ownsTransaction) transaction.release?.();
      }
    },
  },
];
export default packageFunctions;
