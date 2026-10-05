import { executeSupplierPayment } from "../../services/supplierPaymentExecution.js";

export const packageFunctions = [
  {
    key: "supplier.payment.execute", category: "SUPPLIER_ACCOUNTING",
    description: "Execute a supplier payment transaction selected by metadata Flow.",
    inputs: { type: "object", required: ["supplierId","amount"] }, outputs: { type: "object" },
    permissionsAny: ["payment.manage","purchase.edit","inventory.adjust"],
    handler: async ({ inputs = {}, client, pool, companyId, userId, req }) => {
      const amount = Number(inputs.amount), invoiceId = inputs.invoiceId || null;
      const allocations = Array.isArray(inputs.allocations) ? inputs.allocations : invoiceId && amount > 0 ? [{ invoiceId, amount }] : [];
      const owns = !client, tx = client || (pool?.connect ? await pool.connect() : null);
      if (!tx) throw new Error("Database transaction is required");
      try {
        if (owns) await tx.query("BEGIN");
        const result = await executeSupplierPayment({ client: tx, companyId: companyId || req?.user?.companyId, userId: userId || req?.user?.id, defaultStoreId: req?.user?.storeId, input: { ...inputs, allocations } });
        if (owns) await tx.query("COMMIT");
        return result;
      } catch (error) { if (owns) await tx.query("ROLLBACK").catch(() => {}); throw error; }
      finally { if (owns) tx.release?.(); }
    },
  },
  {
    key: "supplier.invoice.create", category: "SUPPLIER_ACCOUNTING",
    description: "Create a supplier invoice and matching ledger entry.",
    inputs: { type: "object", required: ["supplierId","invoiceNumber","total"] }, outputs: { type: "object" },
    permissionsAny: ["purchase.edit","inventory.adjust"],
    handler: async ({ inputs = {}, client, pool, companyId, userId, req }) => {
      const total=Number(inputs.total), subtotal=Number(inputs.subtotal ?? total), tax=Number(inputs.tax || 0);
      if (!inputs.supplierId || !String(inputs.invoiceNumber || "").trim() || !Number.isFinite(total) || total < 0 || !Number.isFinite(subtotal) || subtotal < 0 || !Number.isFinite(tax) || tax < 0) throw new Error("Supplier, invoice number and valid totals are required");
      const owns=!client, tx=client || (pool?.connect ? await pool.connect() : null); if(!tx) throw new Error("Database transaction is required");
      try {
        if(owns) await tx.query("BEGIN");
        const tenantId=companyId||req?.user?.companyId, actorId=userId||req?.user?.id||null, storeId=inputs.storeId||req?.user?.storeId||null, number=String(inputs.invoiceNumber).trim();
        const result=await tx.query(
          `INSERT INTO supplier_invoices(company_id,supplier_id,store_id,purchase_id,invoice_number,invoice_date,due_date,subtotal,tax,total,notes,created_by)
           SELECT $1,$2,$3,$4,$5,COALESCE($6::date,CURRENT_DATE),$7,$8,$9,$10,$11,$12
           WHERE EXISTS(SELECT 1 FROM suppliers WHERE id=$2 AND company_id=$1) RETURNING *`,
          [tenantId,inputs.supplierId,storeId,inputs.purchaseId||null,number,inputs.invoiceDate||null,inputs.dueDate||null,subtotal,tax,total,inputs.notes||null,actorId]);
        if(!result.rows.length) throw new Error("Supplier not found");
        await tx.query(
          `INSERT INTO supplier_ledger_entries(company_id,supplier_id,store_id,entry_type,reference_type,reference_id,amount,debit,description,created_by)
           VALUES($1,$2,$3,'INVOICE','SUPPLIER_INVOICE',$4,$5,true,$6,$7)`,
          [tenantId,inputs.supplierId,storeId,result.rows[0].id,total,`Supplier invoice ${number}`,actorId]);
        if(owns) await tx.query("COMMIT"); return result.rows[0];
      } catch(error) { if(owns) await tx.query("ROLLBACK").catch(()=>{}); if(error?.code==="23505") throw Object.assign(new Error("Supplier invoice already exists"),{code:"DUPLICATE_INVOICE"}); throw error; }
      finally { if(owns) tx.release?.(); }
    },
  },
  {
    key: "supplier.ledger.adjust", category: "SUPPLIER_ACCOUNTING",
    description: "Post a supplier credit, debit or credit-note adjustment.",
    inputs: { type: "object", required: ["supplierId","entryType","amount","debit"] }, outputs: { type: "object" },
    permissionsAny: ["purchase.edit","inventory.adjust"],
    handler: async ({ inputs = {}, client, pool, companyId, userId, req }) => {
      const amount=Number(inputs.amount), debit=inputs.debit===true||String(inputs.debit).toLowerCase()==="true", entryType=String(inputs.entryType||"").toUpperCase();
      if(!inputs.supplierId || !["RETURN_CREDIT","OPENING"].includes(entryType) || !Number.isFinite(amount) || amount<=0) throw new Error("Supplier, valid ledger type and positive amount are required");
      const owns=!client, tx=client || (pool?.connect ? await pool.connect() : null); if(!tx) throw new Error("Database transaction is required");
      try {
        if(owns) await tx.query("BEGIN");
        const tenantId=companyId||req?.user?.companyId, actorId=userId||req?.user?.id||null, storeId=inputs.storeId||req?.user?.storeId||null;
        const supplier=await tx.query("SELECT id,active FROM suppliers WHERE id=$1 AND company_id=$2",[inputs.supplierId,tenantId]);
        if(!supplier.rows.length || supplier.rows[0].active===false) throw new Error("Supplier not found or inactive");
        const key=inputs.idempotencyKey?String(inputs.idempotencyKey).slice(0,100):null;
        if(key && (await tx.query("SELECT id FROM supplier_ledger_entries WHERE company_id=$1 AND idempotency_key=$2 LIMIT 1",[tenantId,key])).rows.length) throw Object.assign(new Error("Ledger entry has already been processed"),{code:"DUPLICATE_LEDGER_ENTRY"});
        const result=await tx.query(
          `INSERT INTO supplier_ledger_entries(company_id,supplier_id,store_id,entry_type,reference_type,reference_id,reference,amount,debit,description,idempotency_key,created_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [tenantId,inputs.supplierId,storeId,entryType,inputs.referenceType||"SUPPLIER_ADJUSTMENT",inputs.referenceId||null,inputs.reference?String(inputs.reference).trim()||null:null,amount,debit,inputs.description?String(inputs.description).trim()||null:null,key,actorId]);
        if(owns) await tx.query("COMMIT"); return result.rows[0];
      } catch(error) { if(owns) await tx.query("ROLLBACK").catch(()=>{}); throw error; }
      finally { if(owns) tx.release?.(); }
    },
  },
];
export default packageFunctions;
