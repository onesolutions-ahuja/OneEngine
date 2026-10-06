// Declarative package-owned runtime Flows. Generic runtime code imports these definitions;
// business behavior remains visible/editable as Flow metadata rather than imperative handlers.
const flow=(systemKey,name,inputContract,outputContract,actions)=>({systemKey,name,triggerKey:"manual",action:{type:"workflow",systemGenerated:true,systemKey,scope:"package",capabilityType:"workflow",capabilityKey:systemKey.replace(/^flow:/,""),apiName:systemKey.replace(/^flow:/,"").replaceAll(".","_").toUpperCase(),flowType:"AUTOLAUNCHED",inputContract,outputContract,actions}});
const input=(name,type="text",required=true)=>({name,label:name,type,required});
const output=(name,type="text")=>({name,label:name,type,source:`variables.${name}`});

export const PACKAGE_RUNTIME_FLOWS=[
 flow("flow:attendance.clock_in","Attendance · Clock In",[input("userId"),input("storeId"),input("now","text")],[output("recordId"),output("alreadyOpen","boolean")],[
  {id:"find_open",label:"Find Open Attendance",key:"GET_RECORDS",objectKey:"attendance",filters:[{field:"user_id",operator:"equals",value:{path:"$record.userId"}},{field:"status",operator:"equals",value:"open"}],limit:1,store:"first"},
  {id:"open_exists",label:"Open Attendance Exists?",key:"CONDITION",outcomes:[{id:"yes",label:"Already Open",condition:{match:"all",conditions:[{field:"steps.find_open.record.id",operator:"is_not_blank"}]},branch:["set_existing_id","set_already_open"]}],defaultLabel:"Create Attendance",defaultBranch:["create_attendance","set_created_id","set_not_already_open"]},
  {id:"create_attendance",label:"Create Attendance",key:"CREATE_RECORD",objectKey:"attendance",fieldValues:{user_id:{path:"$record.userId"},status:"open",clock_in:{path:"$record.now"}}},
  {id:"set_existing_id",label:"Return Existing Record",key:"ASSIGNMENT",variableName:"recordId",variableType:"text",operator:"set",value:{path:"steps.find_open.record.id"}},
  {id:"set_created_id",label:"Return Created Record",key:"ASSIGNMENT",variableName:"recordId",variableType:"text",operator:"set",value:{path:"steps.create_attendance.record.id"}},
  {id:"set_already_open",label:"Already Open",key:"ASSIGNMENT",variableName:"alreadyOpen",variableType:"boolean",operator:"set",value:true},
  {id:"set_not_already_open",label:"New Attendance",key:"ASSIGNMENT",variableName:"alreadyOpen",variableType:"boolean",operator:"set",value:false}
 ]),
 flow("flow:attendance.clock_out","Attendance · Clock Out",[input("userId"),input("now","text")],[output("recordId"),output("closed","boolean")],[
  {id:"find_open",label:"Find Open Attendance",key:"GET_RECORDS",objectKey:"attendance",filters:[{field:"user_id",operator:"equals",value:{path:"$record.userId"}},{field:"status",operator:"equals",value:"open"}],limit:1,store:"first"},
  {id:"open_exists",label:"Open Attendance Exists?",key:"CONDITION",outcomes:[{id:"yes",label:"Close Attendance",condition:{match:"all",conditions:[{field:"steps.find_open.record.id",operator:"is_not_blank"}]},branch:["worked_minutes","close_attendance","set_closed_id","set_closed"]}],defaultLabel:"Nothing Open",defaultBranch:["set_not_closed"]},
  {id:"worked_minutes",label:"Calculate Worked Minutes",key:"FORMULA",resourceName:"workedMinutes",resultType:"number",expression:"MINUTESBETWEEN(clockIn, clockOut)",inputs:{clockIn:{path:"steps.find_open.record.clock_in"},clockOut:{path:"$record.now"}}},
  {id:"close_attendance",label:"Close Attendance",key:"UPDATE_RECORD",objectKey:"attendance",recordId:{path:"steps.find_open.record.id"},fieldValues:{status:"closed",clock_out:{path:"$record.now"},worked_minutes:{path:"variables.workedMinutes"}}},
  {id:"set_closed_id",label:"Return Closed Record",key:"ASSIGNMENT",variableName:"recordId",variableType:"text",operator:"set",value:{path:"steps.find_open.record.id"}},
  {id:"set_closed",label:"Closed",key:"ASSIGNMENT",variableName:"closed",variableType:"boolean",operator:"set",value:true},
  {id:"set_not_closed",label:"Not Closed",key:"ASSIGNMENT",variableName:"closed",variableType:"boolean",operator:"set",value:false}
 ]),
 flow("flow:inventory.movement.create","Inventory · Apply Movement",[input("productId"),input("storeId"),input("movementType"),input("quantityChange","number"),input("referenceType","text",false),input("referenceId","text",false),input("reason","text",false),input("createdBy","text",false)],[output("movementId"),output("balance","number")],[
  {id:"get_stock",label:"Get Store Stock",key:"GET_RECORDS",objectKey:"inventory",filters:[{field:"product_id",operator:"equals",value:{path:"$record.productId"}},{field:"store_id",operator:"equals",value:{path:"$record.storeId"}}],limit:1,store:"first"},
  {id:"new_balance",label:"Calculate New Balance",key:"FORMULA",resourceName:"balance",resultType:"number",expression:"current + change",inputs:{current:{path:"steps.get_stock.record.quantity",fallback:0},change:{path:"$record.quantityChange"}}},
  {id:"stock_exists",label:"Stock Position Exists?",key:"CONDITION",outcomes:[{id:"yes",label:"Update Stock",condition:{match:"all",conditions:[{field:"steps.get_stock.record.id",operator:"is_not_blank"}]},branch:["update_stock"]}],defaultLabel:"Create Stock",defaultBranch:["create_stock"]},
  {id:"update_stock",label:"Update Store Stock",key:"UPDATE_RECORD",objectKey:"inventory",recordId:{path:"steps.get_stock.record.id"},fieldValues:{quantity:{path:"variables.balance"}}},
  {id:"create_stock",label:"Create Store Stock",key:"CREATE_RECORD",objectKey:"inventory",fieldValues:{product_id:{path:"$record.productId"},store_id:{path:"$record.storeId"},quantity:{path:"variables.balance"}}},
  {id:"create_movement",label:"Create Movement",key:"CREATE_RECORD",objectKey:"inventory_movement",fieldValues:{product_id:{path:"$record.productId"},store_id:{path:"$record.storeId"},movement_type:{path:"$record.movementType"},quantity_change:{path:"$record.quantityChange"},balance_after:{path:"variables.balance"},reference_type:{path:"$record.referenceType"},reference_id:{path:"$record.referenceId"},reason:{path:"$record.reason"},created_by:{path:"$record.createdBy"}}},
  {id:"set_movement_id",label:"Return Movement",key:"ASSIGNMENT",variableName:"movementId",variableType:"text",operator:"set",value:{path:"steps.create_movement.record.id"}}
 ]),
 flow("flow:online_order.create","Online Order · Create",[input("externalOrderId"),input("storeId"),input("fulfilmentType"),input("items","collection"),input("customer","object",false),input("notes","text",false)],[output("orderId"),output("subtotal","number"),output("tax","number"),output("total","number")],[
  {id:"init_subtotal",label:"Initialize Subtotal",key:"ASSIGNMENT",variableName:"subtotal",variableType:"currency",operator:"set",value:0},
  {id:"init_tax",label:"Initialize Tax",key:"ASSIGNMENT",variableName:"tax",variableType:"currency",operator:"set",value:0},
  {id:"create_order",label:"Create Online Order",key:"CREATE_RECORD",objectKey:"online_order",fieldValues:{external_order_id:{path:"$record.externalOrderId"},platform:"generic",store_id:{path:"$record.storeId"},fulfilment_type:{path:"$record.fulfilmentType"},customer_name:{path:"$record.customer.name"},customer_phone:{path:"$record.customer.phone"},customer_email:{path:"$record.customer.email"},notes:{path:"$record.notes"},status:"RECEIVED",subtotal:0,tax:0,total:0}},
  {id:"set_order_id",label:"Store Order Id",key:"ASSIGNMENT",variableName:"orderId",variableType:"text",operator:"set",value:{path:"steps.create_order.record.id"}},
  {id:"order_lines",label:"Create Order Lines",key:"LOOP",collection:"$record.items",itemVariable:"currentItem",bodyBranch:["get_product","line_subtotal","line_tax","create_line","add_subtotal","add_tax"]},
  {id:"get_product",label:"Get Product",key:"GET_RECORDS",objectKey:"product",filters:[{field:"id",operator:"equals",value:{path:"variables.currentItem.productId"}}],limit:1,store:"first"},
  {id:"line_subtotal",label:"Calculate Line Subtotal",key:"FORMULA",resourceName:"lineSubtotal",resultType:"number",expression:"price * quantity",inputs:{price:{path:"steps.get_product.record.price"},quantity:{path:"variables.currentItem.quantity"}}},
  {id:"line_tax",label:"Calculate Line Tax",key:"FORMULA",resourceName:"lineTax",resultType:"number",expression:"lineSubtotal * vatRate / 100",inputs:{lineSubtotal:{path:"variables.lineSubtotal"},vatRate:{path:"steps.get_product.record.vat_rate",fallback:0}}},
  {id:"create_line",label:"Create Order Line",key:"CREATE_RECORD",objectKey:"online_order_line",fieldValues:{order_id:{path:"variables.orderId"},product_id:{path:"steps.get_product.record.id"},product_name:{path:"steps.get_product.record.name"},quantity:{path:"variables.currentItem.quantity"},unit_price:{path:"steps.get_product.record.price"},tax:{path:"variables.lineTax"},total:{path:"variables.lineSubtotal"}}},
  {id:"add_subtotal",label:"Add Subtotal",key:"ASSIGNMENT",variableName:"subtotal",variableType:"currency",operator:"add",value:{path:"variables.lineSubtotal"}},
  {id:"add_tax",label:"Add Tax",key:"ASSIGNMENT",variableName:"tax",variableType:"currency",operator:"add",value:{path:"variables.lineTax"}},
  {id:"calculate_total",label:"Calculate Total",key:"FORMULA",resourceName:"total",resultType:"number",expression:"subtotal + tax",inputs:{subtotal:{path:"variables.subtotal"},tax:{path:"variables.tax"}}},
  {id:"update_order_totals",label:"Update Order Totals",key:"UPDATE_RECORD",objectKey:"online_order",recordId:{path:"variables.orderId"},fieldValues:{subtotal:{path:"variables.subtotal"},tax:{path:"variables.tax"},total:{path:"variables.total"}}}
 ]),
 flow("flow:online_order.transition","Online Order · Transition",[input("orderId"),input("toStatus"),input("reason","text",false),input("now","text")],[output("orderId")],[
  {id:"get_order",label:"Get Online Order",key:"GET_RECORDS",objectKey:"online_order",filters:[{field:"id",operator:"equals",value:{path:"$record.orderId"}}],limit:1,store:"first"},
  {id:"update_order",label:"Update Order Status",key:"UPDATE_RECORD",objectKey:"online_order",recordId:{path:"steps.get_order.record.id"},fieldValues:{status:{path:"$record.toStatus"},updated_at:{path:"$record.now"}}},
  {id:"set_order_id",label:"Return Order",key:"ASSIGNMENT",variableName:"orderId",variableType:"text",operator:"set",value:{path:"steps.get_order.record.id"}}
 ]),
 flow("flow:supplier.invoice.create","Supplier · Create Invoice",[input("supplierId"),input("invoiceNumber"),input("invoiceDate","text"),input("dueDate","text",false),input("subtotal","number"),input("tax","number"),input("total","number"),input("purchaseId","text",false),input("notes","text",false)],[output("invoiceId")],[
  {id:"create_invoice",label:"Create Supplier Invoice",key:"CREATE_RECORD",objectKey:"supplier_invoice",fieldValues:{supplier_id:{path:"$record.supplierId"},purchase_id:{path:"$record.purchaseId"},invoice_number:{path:"$record.invoiceNumber"},invoice_date:{path:"$record.invoiceDate"},due_date:{path:"$record.dueDate"},subtotal:{path:"$record.subtotal"},tax:{path:"$record.tax"},total:{path:"$record.total"},status:"OPEN"}},
  {id:"set_invoice_id",label:"Store Invoice Id",key:"ASSIGNMENT",variableName:"invoiceId",variableType:"text",operator:"set",value:{path:"steps.create_invoice.record.id"}},
  {id:"create_ledger",label:"Post Invoice Ledger Entry",key:"CREATE_RECORD",objectKey:"supplier_ledger",fieldValues:{supplier_id:{path:"$record.supplierId"},entry_type:"INVOICE",reference_type:"SUPPLIER_INVOICE",reference_id:{path:"variables.invoiceId"},amount:{path:"$record.total"},debit:true,reference:{path:"$record.invoiceNumber"}}}
 ]),
 flow("flow:supplier.payment.create","Supplier · Record Payment",[input("supplierId"),input("amount","number"),input("paymentDate","text"),input("paymentMethod","text",false),input("reference","text",false),input("invoiceId","text",false)],[output("paymentId")],[
  {id:"create_payment",label:"Create Supplier Payment",key:"CREATE_RECORD",objectKey:"supplier_payment",fieldValues:{supplier_id:{path:"$record.supplierId"},amount:{path:"$record.amount"},payment_date:{path:"$record.paymentDate"},payment_method:{path:"$record.paymentMethod"},reference:{path:"$record.reference"},status:"COMPLETED"}},
  {id:"set_payment_id",label:"Store Payment Id",key:"ASSIGNMENT",variableName:"paymentId",variableType:"text",operator:"set",value:{path:"steps.create_payment.record.id"}},
  {id:"has_invoice",label:"Allocate To Invoice?",key:"CONDITION",outcomes:[{id:"yes",label:"Allocate",condition:{match:"all",conditions:[{field:"$record.invoiceId",operator:"is_not_blank"}]},branch:["create_allocation"]}],defaultLabel:"Unallocated",defaultBranch:[]},
  {id:"create_allocation",label:"Create Payment Allocation",key:"CREATE_RECORD",objectKey:"supplier_payment_allocation",fieldValues:{payment_id:{path:"variables.paymentId"},invoice_id:{path:"$record.invoiceId"},amount:{path:"$record.amount"}}},
  {id:"create_ledger",label:"Post Payment Ledger Entry",key:"CREATE_RECORD",objectKey:"supplier_ledger",fieldValues:{supplier_id:{path:"$record.supplierId"},entry_type:"PAYMENT",reference_type:"SUPPLIER_PAYMENT",reference_id:{path:"variables.paymentId"},amount:{path:"$record.amount"},debit:false,reference:{path:"$record.reference"}}}
 ]),
 flow("flow:supplier.ledger.adjust","Supplier · Ledger Adjustment",[input("supplierId"),input("entryType"),input("amount","number"),input("debit","boolean"),input("reference","text",false),input("description","text",false)],[output("ledgerId")],[
  {id:"create_ledger",label:"Create Ledger Adjustment",key:"CREATE_RECORD",objectKey:"supplier_ledger",fieldValues:{supplier_id:{path:"$record.supplierId"},entry_type:{path:"$record.entryType"},reference_type:"SUPPLIER_ADJUSTMENT",reference:{path:"$record.reference"},amount:{path:"$record.amount"},debit:{path:"$record.debit"}}},
  {id:"set_ledger_id",label:"Return Ledger Entry",key:"ASSIGNMENT",variableName:"ledgerId",variableType:"text",operator:"set",value:{path:"steps.create_ledger.record.id"}}
 ]),
 flow("flow:purchase.create","Purchase · Create",[input("supplierId"),input("supplierName","text",false),input("referenceNumber","text",false),input("purchaseDate"),input("notes","text",false),input("items","collection")],[output("purchaseId"),output("total","number")],[
  {id:"init_total",label:"Initialize Total",key:"ASSIGNMENT",variableName:"total",variableType:"currency",operator:"set",value:0},
  {id:"sum_lines",label:"Calculate Purchase Total",key:"LOOP",collection:"$record.items",itemVariable:"currentItem",bodyBranch:["line_total","add_total"]},
  {id:"line_total",label:"Calculate Line Total",key:"FORMULA",resourceName:"lineTotal",resultType:"number",expression:"quantity * unitCost",inputs:{quantity:{path:"variables.currentItem.quantity"},unitCost:{path:"variables.currentItem.unitCost"}}},
  {id:"add_total",label:"Add Line Total",key:"ASSIGNMENT",variableName:"total",variableType:"currency",operator:"add",value:{path:"variables.lineTotal"}},
  {id:"create_purchase",label:"Create Purchase",key:"CREATE_RECORD",objectKey:"purchase",fieldValues:{supplier_id:{path:"$record.supplierId"},supplier_name:{path:"$record.supplierName"},reference_number:{path:"$record.referenceNumber"},purchase_date:{path:"$record.purchaseDate"},notes:{path:"$record.notes"},status:"DRAFT",subtotal:{path:"variables.total"},total:{path:"variables.total"}}},
  {id:"set_purchase_id",label:"Store Purchase Id",key:"ASSIGNMENT",variableName:"purchaseId",variableType:"text",operator:"set",value:{path:"steps.create_purchase.record.id"}},
  {id:"create_lines",label:"Create Purchase Lines",key:"LOOP",collection:"$record.items",itemVariable:"currentItem",bodyBranch:["line_total_for_create","create_line"]},
  {id:"line_total_for_create",label:"Calculate Saved Line Total",key:"FORMULA",resourceName:"savedLineTotal",resultType:"number",expression:"quantity * unitCost",inputs:{quantity:{path:"variables.currentItem.quantity"},unitCost:{path:"variables.currentItem.unitCost"}}},
  {id:"create_line",label:"Create Purchase Line",key:"CREATE_RECORD",objectKey:"purchase_line",fieldValues:{purchase_id:{path:"variables.purchaseId"},product_id:{path:"variables.currentItem.productId"},quantity:{path:"variables.currentItem.quantity"},received_quantity:0,unit_cost:{path:"variables.currentItem.unitCost"},line_total:{path:"variables.savedLineTotal"},batch_number:{path:"variables.currentItem.batchNumber"},manufacturing_date:{path:"variables.currentItem.manufacturingDate"},expiry_date:{path:"variables.currentItem.expiryDate"}}}
 ]),
 flow("flow:purchase.receive","Purchase · Receive",[input("purchaseId"),input("receivingReference","text",false),input("receivingNotes","text",false),input("now","text"),input("userId","text")],[output("receiptId")],[
  {id:"get_purchase",label:"Get Purchase",key:"GET_RECORDS",objectKey:"purchase",filters:[{field:"id",operator:"equals",value:{path:"$record.purchaseId"}}],limit:1,store:"first"},
  {id:"get_lines",label:"Get Purchase Lines",key:"GET_RECORDS",objectKey:"purchase_line",filters:[{field:"purchase_id",operator:"equals",value:{path:"$record.purchaseId"}}],limit:20000,store:"all"},
  {id:"create_receipt",label:"Create Purchase Receipt",key:"CREATE_RECORD",objectKey:"purchase_receipt",fieldValues:{purchase_id:{path:"$record.purchaseId"},reference_number:{path:"$record.receivingReference"},notes:{path:"$record.receivingNotes"},received_by:{path:"$record.userId"}}},
  {id:"set_receipt_id",label:"Store Receipt Id",key:"ASSIGNMENT",variableName:"receiptId",variableType:"text",operator:"set",value:{path:"steps.create_receipt.record.id"}},
  {id:"receive_lines",label:"Receive Remaining Lines",key:"LOOP",collection:{path:"steps.get_lines.records"},itemVariable:"currentLine",bodyBranch:["remaining_qty","has_remaining","inventory_subflow","mark_line_received"]},
  {id:"remaining_qty",label:"Calculate Remaining Quantity",key:"FORMULA",resourceName:"remainingQty",resultType:"number",expression:"ordered - received",inputs:{ordered:{path:"variables.currentLine.quantity"},received:{path:"variables.currentLine.received_quantity",fallback:0}}},
  {id:"has_remaining",label:"Remaining Quantity?",key:"CONDITION",outcomes:[{id:"yes",label:"Receive",condition:{match:"all",conditions:[{field:"variables.remainingQty",operator:"greater_than",value:0}]},branch:["inventory_subflow","mark_line_received"]}],defaultLabel:"Already Received",defaultBranch:[]},
  {id:"inventory_subflow",label:"Apply Inventory Movement",key:"RUN_SUBFLOW",subflowApiName:"INVENTORY_MOVEMENT_CREATE",inputAssignments:{productId:{path:"variables.currentLine.product_id"},movementType:"PURCHASE",quantityChange:{path:"variables.remainingQty"},referenceType:"PURCHASE",referenceId:{path:"$record.purchaseId"},createdBy:{path:"$record.userId"}}},
  {id:"mark_line_received",label:"Mark Line Received",key:"UPDATE_RECORD",objectKey:"purchase_line",recordId:{path:"variables.currentLine.id"},fieldValues:{received_quantity:{path:"variables.currentLine.quantity"}}},
  {id:"mark_purchase_received",label:"Mark Purchase Received",key:"UPDATE_RECORD",objectKey:"purchase",recordId:{path:"$record.purchaseId"},fieldValues:{status:"RECEIVED",received_by:{path:"$record.userId"},received_at:{path:"$record.now"}}}
 ]),
 flow("flow:supplier.return.execute","Purchasing · Supplier Return",[input("purchaseItemId"),input("purchaseId"),input("productId"),input("quantity","number"),input("reason","text",false),input("returnNumber"),input("supplierId","text",false),input("unitCost","number"),input("userId","text")],[output("returnId"),output("credit","number")],[
  {id:"get_line",label:"Get Purchase Line",key:"GET_RECORDS",objectKey:"purchase_line",filters:[{field:"id",operator:"equals",value:{path:"$record.purchaseItemId"}},{field:"purchase_id",operator:"equals",value:{path:"$record.purchaseId"}}],limit:1,store:"first"},
  {id:"credit",label:"Calculate Return Credit",key:"FORMULA",resourceName:"credit",resultType:"number",expression:"unitCost * quantity",inputs:{unitCost:{path:"$record.unitCost"},quantity:{path:"$record.quantity"}}},
  {id:"create_return",label:"Create Supplier Return",key:"CREATE_RECORD",objectKey:"stock_return",fieldValues:{return_type:"SUPPLIER",return_number:{path:"$record.returnNumber"},purchase_id:{path:"$record.purchaseId"},supplier_id:{path:"$record.supplierId"},status:"COMPLETED",reason:{path:"$record.reason"}}},
  {id:"set_return_id",label:"Store Return Id",key:"ASSIGNMENT",variableName:"returnId",variableType:"text",operator:"set",value:{path:"steps.create_return.record.id"}},
  {id:"create_return_line",label:"Create Return Line",key:"CREATE_RECORD",objectKey:"stock_return_line",fieldValues:{return_id:{path:"variables.returnId"},product_id:{path:"$record.productId"},purchase_item_id:{path:"$record.purchaseItemId"},quantity:{path:"$record.quantity"},reason:{path:"$record.reason"}}},
  {id:"inventory_return",label:"Apply Inventory Return",key:"RUN_SUBFLOW",subflowApiName:"INVENTORY_MOVEMENT_CREATE",inputAssignments:{productId:{path:"$record.productId"},movementType:"SUPPLIER_RETURN",quantityChange:{path:"$record.quantity"},referenceType:"PURCHASE_RETURN",referenceId:{path:"variables.returnId"},reason:{path:"$record.reason"},createdBy:{path:"$record.userId"}}},
  {id:"has_supplier",label:"Supplier Credit?",key:"CONDITION",outcomes:[{id:"yes",label:"Post Credit",condition:{match:"all",conditions:[{field:"$record.supplierId",operator:"is_not_blank"}]},branch:["supplier_credit"]}],defaultLabel:"No Supplier Credit",defaultBranch:[]},
  {id:"supplier_credit",label:"Post Supplier Credit",key:"RUN_SUBFLOW",subflowApiName:"SUPPLIER_LEDGER_ADJUST",inputAssignments:{supplierId:{path:"$record.supplierId"},entryType:"RETURN_CREDIT",amount:{path:"variables.credit"},debit:false,reference:{path:"$record.returnNumber"},description:{path:"$record.reason"}}}
 ])
,
 flow("flow:global_product.lookup","Global Product · Lookup",[input("connectionId"),input("barcode"),input("operation","text",false)],[output("product","object"),output("providerResult","object")],[
  {id:"lookup_provider",label:"Lookup Product Provider",key:"CALL_CONNECTOR",connectionId:{path:"$record.connectionId"},operation:{path:"$record.operation",fallback:"product.lookup"},input:{barcode:{path:"$record.barcode"}}},
  {id:"set_provider_result",label:"Store Provider Result",key:"ASSIGNMENT",variableName:"providerResult",variableType:"object",operator:"set",value:{path:"steps.lookup_provider"}},
  {id:"set_product",label:"Store Product",key:"ASSIGNMENT",variableName:"product",variableType:"object",operator:"set",value:{path:"steps.lookup_provider.data"}}
 ]),
 flow("flow:shopify.webhook.process","Shopify · Process Webhook",[input("connectionId"),input("topic"),input("payload","object")],[output("providerResult","object")],[
  {id:"call_shopify",label:"Process Shopify Webhook",key:"CALL_CONNECTOR",connectionId:{path:"$record.connectionId"},operation:"webhook.process",input:{topic:{path:"$record.topic"},payload:{path:"$record.payload"}}},
  {id:"set_result",label:"Store Provider Result",key:"ASSIGNMENT",variableName:"providerResult",variableType:"object",operator:"set",value:{path:"steps.call_shopify"}}
 ]),
 flow("flow:shopify.products.sync","Shopify · Sync Products",[input("connectionId"),input("products","collection")],[output("providerResult","object")],[
  {id:"call_shopify",label:"Sync Products",key:"CALL_CONNECTOR",connectionId:{path:"$record.connectionId"},operation:"products.sync",input:{products:{path:"$record.products"}}},
  {id:"set_result",label:"Store Provider Result",key:"ASSIGNMENT",variableName:"providerResult",variableType:"object",operator:"set",value:{path:"steps.call_shopify"}}
 ]),
 flow("flow:shopify.inventory.sync","Shopify · Sync Inventory",[input("connectionId"),input("inventory","collection")],[output("providerResult","object")],[
  {id:"call_shopify",label:"Sync Inventory",key:"CALL_CONNECTOR",connectionId:{path:"$record.connectionId"},operation:"inventory.sync",input:{inventory:{path:"$record.inventory"}}},
  {id:"set_result",label:"Store Provider Result",key:"ASSIGNMENT",variableName:"providerResult",variableType:"object",operator:"set",value:{path:"steps.call_shopify"}}
 ]),
 flow("flow:shopify.fulfilment.export","Shopify · Export Fulfilment",[input("connectionId"),input("orderId"),input("lineItems","collection")],[output("providerResult","object")],[
  {id:"call_shopify",label:"Export Fulfilment",key:"CALL_CONNECTOR",connectionId:{path:"$record.connectionId"},operation:"fulfilment.export",input:{orderId:{path:"$record.orderId"},lineItems:{path:"$record.lineItems"}}},
  {id:"set_result",label:"Store Provider Result",key:"ASSIGNMENT",variableName:"providerResult",variableType:"object",operator:"set",value:{path:"steps.call_shopify"}}
 ]),
 flow("flow:shopify.refund.export","Shopify · Export Refund",[input("connectionId"),input("orderId"),input("amount","number"),input("lineItems","collection",false),input("reference","text")],[output("providerResult","object")],[
  {id:"call_shopify",label:"Export Refund",key:"CALL_CONNECTOR",connectionId:{path:"$record.connectionId"},operation:"refund.export",input:{orderId:{path:"$record.orderId"},amount:{path:"$record.amount"},lineItems:{path:"$record.lineItems"},reference:{path:"$record.reference"}}},
  {id:"set_result",label:"Store Provider Result",key:"ASSIGNMENT",variableName:"providerResult",variableType:"object",operator:"set",value:{path:"steps.call_shopify"}}
 ]),
 flow("flow:shopify.sync.retry","Shopify · Retry Failed Sync",[input("connectionId"),input("operation"),input("payload","object")],[output("providerResult","object")],[
  {id:"retry_connector",label:"Retry Connector Operation",key:"CALL_CONNECTOR",connectionId:{path:"$record.connectionId"},operation:{path:"$record.operation"},input:{payload:{path:"$record.payload"}}},
  {id:"set_result",label:"Store Provider Result",key:"ASSIGNMENT",variableName:"providerResult",variableType:"object",operator:"set",value:{path:"steps.retry_connector"}}
 ])
,
 flow("flow:sale.canonical.post","Sale · Post Canonical Transaction",[input("saleId"),input("companyId"),input("storeId"),input("transactionType","text"),input("originalTransactionId","text",false)],[output("saleId")],[
  {id:"get_sale",label:"Get Sale",key:"GET_RECORDS",objectKey:"sale",filters:[{field:"id",operator:"equals",value:{path:"$record.saleId"}},{field:"company_id",operator:"equals",value:{path:"$record.companyId"}}],limit:1,store:"first"},
  {id:"update_sale",label:"Set Transaction Metadata",key:"UPDATE_RECORD",objectKey:"sale",recordId:{path:"steps.get_sale.record.id"},fieldValues:{transaction_type:{path:"$record.transactionType"},original_transaction_id:{path:"$record.originalTransactionId"},net_amount:{path:"steps.get_sale.record.subtotal"}}},
  {id:"get_payments",label:"Get Payments",key:"GET_RECORDS",objectKey:"payment",filters:[{field:"sale_id",operator:"equals",value:{path:"$record.saleId"}}],limit:200,store:"all"},
  {id:"post_payments",label:"Post Payment Ledger",key:"LOOP",collection:{path:"steps.get_payments.records"},itemVariable:"currentPayment",bodyBranch:["update_payment","create_payment_ledger"]},
  {id:"update_payment",label:"Link Payment",key:"UPDATE_RECORD",objectKey:"payment",recordId:{path:"variables.currentPayment.id"},fieldValues:{company_id:{path:"$record.companyId"},store_id:{path:"$record.storeId"},customer_id:{path:"steps.get_sale.record.customer_id"},transaction_id:{path:"$record.saleId"},reference:{path:"steps.get_sale.record.receipt_number"}}},
  {id:"create_payment_ledger",label:"Create Payment Ledger",key:"CREATE_RECORD",objectKey:"financial_ledger_entry",fieldValues:{company_id:{path:"$record.companyId"},store_id:{path:"$record.storeId"},transaction_id:{path:"$record.saleId"},payment_id:{path:"variables.currentPayment.id"},customer_id:{path:"steps.get_sale.record.customer_id"},transaction_type:{path:"$record.transactionType"},amount:{path:"variables.currentPayment.amount"},net_amount:{path:"steps.get_sale.record.subtotal"},vat_amount:{path:"steps.get_sale.record.tax"},reference:{path:"steps.get_sale.record.receipt_number"},status:"POSTED"}},
  {id:"create_transaction_ledger",label:"Create Transaction Ledger",key:"CREATE_RECORD",objectKey:"financial_ledger_entry",fieldValues:{company_id:{path:"$record.companyId"},store_id:{path:"$record.storeId"},transaction_id:{path:"$record.saleId"},customer_id:{path:"steps.get_sale.record.customer_id"},transaction_type:{path:"$record.transactionType"},amount:{path:"steps.get_sale.record.total"},net_amount:{path:"steps.get_sale.record.subtotal"},vat_amount:{path:"steps.get_sale.record.tax"},reference:{path:"steps.get_sale.record.receipt_number"},status:"POSTED"}},
  {id:"set_sale_id",label:"Return Sale",key:"ASSIGNMENT",variableName:"saleId",variableType:"text",operator:"set",value:{path:"$record.saleId"}}
 ])
,
 flow("flow:invoice.delivery.send","Invoice · Deliver",[input("saleId"),input("channel"),input("recipient"),input("subject","text",false),input("message"),input("invoiceUrl","text",false)],[output("status")],[
  {id:"send_invoice",label:"Send Invoice Communication",key:"SEND_COMMUNICATION",channel:{path:"$record.channel"},recipient:{path:"$record.recipient"},subject:{path:"$record.subject"},message:{path:"$record.message"},templateContext:{sale_id:{path:"$record.saleId"},invoice_url:{path:"$record.invoiceUrl"}}},
  {id:"set_status",label:"Return Status",key:"ASSIGNMENT",variableName:"status",variableType:"text",operator:"set",value:{path:"steps.send_invoice.status"}}
 ])
];
