import { createInventoryMovement, syncBatchMovement } from "../../services/inventory.js";
import { upsertBatchRow } from "../../services/inventory.js";
import { resolveBatchEntry, normaliseBatchPolicy } from "../../services/batchPolicy.js";
import { dispatchIntegrationEvent } from "../../services/integrationDispatcher.js";
import { saveDomainConfiguration } from "../../services/platformDomainRecords.js";

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function purchaseItems(items) {
  if (!Array.isArray(items) || !items.length) throw new Error("At least one purchase product is required");
  return items.map((item) => {
    const quantity = Number(item.quantity), unitCost = Number(item.unitCost);
    if (!item.productId || !Number.isFinite(quantity) || quantity <= 0) throw new Error("Each purchase line needs a valid product and quantity");
    if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error("Each purchase line needs a valid unit cost");
    return { productId:item.productId,quantity,unitCost,lineTotal:quantity*unitCost,batchNumber:item.batchNumber||null,manufacturingDate:item.manufacturingDate||null,expiryDate:item.expiryDate||null };
  });
}

function planReceipt(lines, requestedItems = null) {
  const requestedByLine = new Map(Array.isArray(requestedItems) ? requestedItems.map((item) => [String(item.purchaseItemId), Number(item.quantity)]) : []);
  return lines.map((line) => {
    const remaining = Number(line.quantity) - Number(line.received_quantity || 0);
    const quantity = requestedByLine.size ? Number(requestedByLine.get(String(line.purchase_item_id)) || 0) : remaining;
    if (!Number.isFinite(quantity) || quantity < 0) throw new Error("Invalid received quantity");
    if (quantity > remaining) throw new Error(`Cannot receive more than the remaining quantity for product ${line.product_id}`);
    return { ...line, quantity, remaining };
  }).filter((line) => line.quantity > 0);
}

async function receivePurchase({ client, purchaseId, companyId, userId, storeId, requestedItems = null, receiptMeta = {}, createInventoryMovement }) {
  if (!client || typeof client.query !== "function") throw new Error("Database transaction is required");
  const purchaseResult = await client.query("SELECT id, store_id, status FROM purchases WHERE id=$1 AND company_id=$2 FOR UPDATE", [purchaseId, companyId]);
  if (!purchaseResult.rows.length) throw new Error("Purchase not found");
  const purchase = purchaseResult.rows[0];
  if (purchase.status === "RECEIVED") throw Object.assign(new Error("Purchase has already been received"), { code: "ALREADY_RECEIVED" });
  if (purchase.status === "CANCELLED") throw new Error("Cancelled purchases cannot be received");
  const lines = await client.query(`SELECT pi.id AS purchase_item_id, pi.product_id, pi.quantity, pi.received_quantity, pi.unit_cost,
    p.batch_tracking, pi.batch_number, pi.manufacturing_date, pi.expiry_date
    FROM purchase_items pi INNER JOIN products p ON p.id=pi.product_id WHERE pi.purchase_id=$1 ORDER BY pi.id`, [purchaseId]);
  if (!lines.rows.length) throw new Error("Purchase has no product lines");
  const policyResult = await client.query("SELECT batch_inventory_mode, batch_default_mfg_rule, batch_default_expiry_rule, batch_default_expiry_days FROM company_settings WHERE company_id=$1", [companyId]);
  const policy = normaliseBatchPolicy(policyResult.rows[0]);
  const receiptLines = [];
  for (const line of planReceipt(lines.rows, requestedItems)) {
    const batch = resolveBatchEntry(policy, { productBatchTracking: line.batch_tracking, batchNumber: line.batch_number, manufacturingDate: line.manufacturing_date, expiryDate: line.expiry_date });
    await createInventoryMovement(client, { companyId, productId: line.product_id, storeId: purchase.store_id || storeId, movementType: "PURCHASE", quantityChange: line.quantity, referenceType: "PURCHASE", referenceId: purchaseId, createdBy: userId });
    if (line.batch_tracking) await upsertBatchRow(client, { companyId, storeId: purchase.store_id || storeId, productId: line.product_id, batchNumber: batch.batchNumber, manufacturingDate: batch.manufacturingDate, manufacturingDateSource: batch.manufacturingDateSource, expiryDate: batch.expiryDate, expiryDateSource: batch.expiryDateSource, quantity: line.quantity });
    receiptLines.push(line);
  }
  if (!receiptLines.length) throw new Error("No remaining quantity to receive");
  const receipt = await client.query("INSERT INTO purchase_receipts (company_id,purchase_id,store_id,received_by,reference_number,notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,received_at", [companyId,purchaseId,purchase.store_id || storeId,userId,receiptMeta.referenceNumber || null,receiptMeta.notes || null]);
  for (const line of receiptLines) {
    await client.query("INSERT INTO purchase_receipt_items (receipt_id,purchase_item_id,product_id,quantity,unit_cost,batch_number,manufacturing_date,expiry_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [receipt.rows[0].id,line.purchase_item_id,line.product_id,line.quantity,line.unit_cost,line.batch_number || null,line.manufacturing_date || null,line.expiry_date || null]);
    await client.query("UPDATE purchase_items SET received_quantity=received_quantity+$1 WHERE id=$2 AND purchase_id=$3", [line.quantity,line.purchase_item_id,purchaseId]);
  }
  const remaining = await client.query("SELECT COUNT(*)::int AS open_lines FROM purchase_items WHERE purchase_id=$1 AND received_quantity < quantity", [purchaseId]);
  const status = Number(remaining.rows[0].open_lines) === 0 ? "RECEIVED" : "PARTIALLY_RECEIVED";
  const updated = await client.query("UPDATE purchases SET status=$1,received_by=$2,received_at=CASE WHEN $1='RECEIVED' THEN NOW() ELSE received_at END,updated_at=NOW() WHERE id=$3 AND company_id=$4 AND status IN ('DRAFT','PARTIALLY_RECEIVED')", [status,userId,purchaseId,companyId]);
  if (updated.rowCount !== 1) throw Object.assign(new Error("Purchase has already been received"), { code: "ALREADY_RECEIVED" });
  return { receipt: receipt.rows[0], status, lines: receiptLines };
}

async function nextReturnNumber(client, companyId) {
  const result = await client.query(
    `SELECT COALESCE(MAX(NULLIF(SUBSTRING(return_number FROM '[0-9]+$'), '')::int),0)+1 AS next_number
       FROM stock_returns WHERE company_id=$1 AND return_number IS NOT NULL`, [companyId]);
  let candidate = Number(result.rows[0]?.next_number || 1);
  for (;;) {
    const value = `RET-${String(candidate).padStart(4,"0")}`;
    const clash = await client.query("SELECT 1 FROM stock_returns WHERE return_number=$1 LIMIT 1",[value]);
    if (!clash.rows.length) return value;
    candidate += 1;
  }
}

export const packageFunctions = [
  {
    key:"purchase.create",category:"PURCHASING",
    description:"Create a purchase and optional initial receipt through the protected transaction.",
    inputs:{type:"object",required:["items"]},outputs:{type:"object"},
    permissionsAny:["purchase.create","inventory.adjust"],
    handler: async ({inputs={},client,pool,db,companyId,userId,req}) => {
      const lines=purchaseItems(inputs.items), tenantId=companyId||req?.user?.companyId, actorId=userId||req?.user?.id||null;
      const storeId=inputs.storeId||req?.user?.storeId||null;
      const owns=!client, tx=client||(pool?.connect?await pool.connect():null);
      if(!tx) throw new Error("Database transaction is required");
      try{
        if(owns) await tx.query("BEGIN");
        let supplierId=inputs.supplierId||null, supplierName=inputs.supplierName?String(inputs.supplierName).trim():null;
        if(supplierId){
          const supplier=await tx.query("SELECT id,name FROM suppliers WHERE id=$1 AND company_id=$2 AND active=true",[supplierId,tenantId]);
          if(!supplier.rows.length) throw new Error("Supplier not found or inactive");
          supplierName=supplier.rows[0].name;
        } else if(supplierName){
          const existing=await tx.query("SELECT id,name FROM suppliers WHERE company_id=$1 AND LOWER(name)=LOWER($2) LIMIT 1",[tenantId,supplierName]);
          if(existing.rows.length) supplierId=existing.rows[0].id;
          else supplierId=(await tx.query("INSERT INTO suppliers(company_id,name) VALUES($1,$2) RETURNING id",[tenantId,supplierName])).rows[0].id;
        }
        const total=lines.reduce((sum,line)=>sum+line.lineTotal,0);
        const created=await tx.query(
          `INSERT INTO purchases(company_id,store_id,supplier_id,supplier_name,reference_number,purchase_date,notes,status,subtotal,total,created_by)
           VALUES($1,$2,$3,$4,$5,COALESCE($6::date,CURRENT_DATE),$7,'DRAFT',$8,$8,$9) RETURNING *`,
          [tenantId,storeId,supplierId,supplierName,inputs.referenceNumber?String(inputs.referenceNumber).trim()||null:null,inputs.purchaseDate||null,inputs.notes?String(inputs.notes).trim()||null:null,total,actorId]);
        const purchase=created.rows[0];
        for(const line of lines) await tx.query(
          `INSERT INTO purchase_items(purchase_id,product_id,quantity,unit_cost,line_total,batch_number,manufacturing_date,expiry_date)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [purchase.id,line.productId,line.quantity,line.unitCost,line.lineTotal,line.batchNumber,line.manufacturingDate,line.expiryDate]);
        const platformInput=req?.body?.platform || null;
        if(platformInput || inputs.recordTypeId || (inputs.customFields&&typeof inputs.customFields==="object")){
          const domainReq=platformInput
            ? req
            : {...req,body:{...(req?.body||{}),platform:{recordTypeId:inputs.recordTypeId||null,customFields:inputs.customFields||{}}}};
          await saveDomainConfiguration({db:tx.query.bind(tx),key:"purchase",req:domainReq,record:purchase});
        }
        let received=null;
        if(inputs.receiveNow!==false) received=await receivePurchase({
          client:tx,purchaseId:purchase.id,companyId:tenantId,userId:actorId,storeId,
          requestedItems:Array.isArray(inputs.receiveItems)?inputs.receiveItems:null,
          receiptMeta:{referenceNumber:inputs.receivingReference||null,notes:inputs.receivingNotes||null},
          createInventoryMovement,
        });
        if(owns) await tx.query("COMMIT");
        if(typeof db==="function"){
          dispatchIntegrationEvent({event:"PURCHASE_CREATED",deps:{db},context:{companyId:tenantId,storeId},entityId:purchase.id}).catch(()=>{});
          if(inputs.receiveNow!==false) dispatchIntegrationEvent({event:"PURCHASE_RECEIVED",deps:{db},context:{companyId:tenantId,storeId},entityId:purchase.id}).catch(()=>{});
        }
        return {id:purchase.id,status:received?.status||"DRAFT",receipt:received?.receipt||null};
      }catch(error){
        if(owns) await tx.query("ROLLBACK").catch(()=>{});
        if(error?.code==="23505") throw Object.assign(new Error("A purchase with this reference already exists"),{code:"DUPLICATE_PURCHASE"});
        throw error;
      }finally{if(owns) tx.release?.();}
    },
  },
  {
    key:"purchase.receive",category:"PURCHASING",description:"Receive remaining purchase stock through the protected transaction.",
    inputs:{type:"object",required:["purchaseId"]},outputs:{type:"object"},permissionsAny:["purchase.edit","inventory.adjust","purchases.receive"],
    handler:async({inputs={},client,pool,db,companyId,userId,req})=>{
      const tenantId=companyId||req?.user?.companyId, storeId=inputs.storeId||req?.user?.storeId, owns=!client,tx=client||(pool?.connect?await pool.connect():null);
      if(!tx) throw new Error("Database transaction is required");
      try{
        if(owns) await tx.query("BEGIN");
        const result=await receivePurchase({client:tx,purchaseId:inputs.purchaseId,companyId:tenantId,userId:userId||req?.user?.id,storeId,requestedItems:inputs.requestedItems||null,receiptMeta:inputs.receiptMeta||{referenceNumber:inputs.receivingReference||null,notes:inputs.receivingNotes||null},createInventoryMovement});
        if(owns) await tx.query("COMMIT");
        if(typeof db==="function") dispatchIntegrationEvent({event:"PURCHASE_RECEIVED",deps:{db},context:{companyId:tenantId,storeId},entityId:inputs.purchaseId}).catch(()=>{});
        return result;
      }catch(error){if(owns) await tx.query("ROLLBACK").catch(()=>{});throw error;}finally{if(owns) tx.release?.();}
    },
  },
  {
    key:"supplier.return.execute",category:"PURCHASING",description:"Return received purchase stock to its supplier.",
    inputs:{type:"object",required:["purchaseItemId","purchaseId","productId","quantity"]},outputs:{type:"object"},permissionsAny:["returns.create","sale.refund"],
    handler:async({inputs={},client,pool,companyId,userId,req})=>{
      const tenantId=companyId||req?.user?.companyId, actorId=userId||req?.user?.id||null, quantity=Number(inputs.quantity);
      if(!Number.isFinite(quantity)||quantity<=0) throw new Error("Enter a positive return quantity");
      const owns=!client,tx=client||(pool?.connect?await pool.connect():null); if(!tx) throw new Error("Database transaction is required");
      try{
        if(owns) await tx.query("BEGIN");
        if(inputs.requestKey){
          const duplicate=await tx.query("SELECT id,return_number FROM stock_returns WHERE company_id=$1 AND request_key=$2",[tenantId,String(inputs.requestKey).slice(0,100)]);
          if(duplicate.rows.length) throw Object.assign(new Error("This return request has already been processed"),{code:"DUPLICATE_RETURN"});
        }
        const purchase=await tx.query(
          `SELECT id,store_id,supplier_id FROM purchases WHERE id=$1 AND company_id=$2 AND status IN ('PARTIALLY_RECEIVED','RECEIVED') FOR UPDATE`,
          [inputs.purchaseId,tenantId]);
        if(!purchase.rows.length) throw new Error("Purchase not found");
        const source=await tx.query("SELECT id,product_id,received_quantity,unit_cost FROM purchase_items WHERE id=$1 AND purchase_id=$2",[inputs.purchaseItemId,inputs.purchaseId]);
        if(!source.rows.length||String(source.rows[0].product_id)!==String(inputs.productId)) throw new Error("Return line does not belong to the purchase");
        const returned=await tx.query(
          `SELECT COALESCE(SUM(sri.quantity),0) AS quantity FROM stock_return_items sri
             JOIN stock_returns sr ON sr.id=sri.return_id
            WHERE sr.return_type='SUPPLIER' AND sr.status='COMPLETED' AND sr.purchase_id=$1 AND sri.purchase_item_id=$2`,
          [inputs.purchaseId,inputs.purchaseItemId]);
        const remaining=round2(Number(source.rows[0].received_quantity||0)-Number(returned.rows[0].quantity||0));
        if(round2(quantity)>remaining) throw new Error("Return quantity exceeds the remaining returnable quantity");
        const returnNumber=await nextReturnNumber(tx,tenantId), storeId=purchase.rows[0].store_id||req?.user?.storeId||null;
        const created=await tx.query(
          `INSERT INTO stock_returns(company_id,store_id,return_type,return_number,purchase_id,supplier_id,request_key,reason,status,created_by)
           VALUES($1,$2,'SUPPLIER',$3,$4,$5,$6,$7,'COMPLETED',$8) RETURNING id`,
          [tenantId,storeId,returnNumber,inputs.purchaseId,purchase.rows[0].supplier_id||null,inputs.requestKey?String(inputs.requestKey).slice(0,100):null,inputs.reason||null,actorId]);
        const returnId=created.rows[0].id;
        await tx.query("INSERT INTO stock_return_items(return_id,product_id,purchase_item_id,quantity,reason) VALUES($1,$2,$3,$4,$5)",[returnId,inputs.productId,inputs.purchaseItemId,quantity,inputs.reason||null]);
        await createInventoryMovement(tx,{companyId:tenantId,productId:inputs.productId,storeId,movementType:"SUPPLIER_RETURN",quantityChange:-quantity,referenceType:"PURCHASE_RETURN",referenceId:returnId,reason:inputs.reason||null,createdBy:actorId});
        const product=await tx.query("SELECT batch_tracking FROM products WHERE id=$1 AND company_id=$2",[inputs.productId,tenantId]);
        await syncBatchMovement(tx,{companyId:tenantId,storeId,productId:inputs.productId,quantityChange:-quantity,batchTracked:product.rows[0]?.batch_tracking===true});
        const credit=round2(Number(source.rows[0].unit_cost||0)*quantity);
        if(purchase.rows[0].supplier_id&&credit>0) await tx.query(
          `INSERT INTO supplier_ledger_entries(company_id,supplier_id,store_id,entry_type,reference_type,reference_id,amount,debit,description,created_by)
           VALUES($1,$2,$3,'RETURN_CREDIT','PURCHASE_RETURN',$4,$5,false,$6,$7)`,
          [tenantId,purchase.rows[0].supplier_id,storeId,returnId,credit,inputs.reason||"Supplier purchase return",actorId]);
        if(owns) await tx.query("COMMIT");
        return {id:returnId,returnNumber,credit};
      }catch(error){if(owns) await tx.query("ROLLBACK").catch(()=>{});throw error;}finally{if(owns) tx.release?.();}
    },
  },
];
export default packageFunctions;
