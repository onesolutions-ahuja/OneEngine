import test from "node:test";
import assert from "node:assert/strict";
import { systemWorkflowDefinitions } from "../server/services/systemWorkflowCatalog.js";
import { executeWorkflowActions, getWorkflowActionDefinition } from "../server/services/platformWorkflow.js";

const systemFlows = new Map(
  systemWorkflowDefinitions()
    .filter((flow) => String(flow?.systemKey || "").startsWith("flow:till."))
    .map((flow) => [flow.systemKey, flow.action])
);

function permissionDb({ products = [], inserted = [] } = {}) {
  const objects = {
    product: { id: "obj-product", object_key: "product", label: "Product", source_table: "products", company_id: null, company_scoped: true, store_scoped: false },
    cash_ledger: { id: "obj-cash", object_key: "cash_ledger", label: "Cash Ledger", source_table: "cash_movements", company_id: null, company_scoped: true, store_scoped: true },
  };
  const fields = {
    product: [
      { id:"fp1",object_id:"obj-product",api_name:"name",source_column:"name",active:true,readable:true,writable:true,label:"Name",display_order:1 },
      { id:"fp2",object_id:"obj-product",api_name:"price",source_column:"price",active:true,readable:true,writable:true,label:"Price",display_order:2 },
    ],
    cash_ledger: [
      { id:"fc1",object_id:"obj-cash",api_name:"till_session_id",source_column:"till_session_id",active:true,readable:true,writable:true,label:"Till Session",display_order:1 },
      { id:"fc2",object_id:"obj-cash",api_name:"user_id",source_column:"user_id",active:true,readable:true,writable:true,label:"User",display_order:2 },
      { id:"fc3",object_id:"obj-cash",api_name:"type",source_column:"type",active:true,readable:true,writable:true,label:"Type",display_order:3 },
      { id:"fc4",object_id:"obj-cash",api_name:"amount",source_column:"amount",active:true,readable:true,writable:true,label:"Amount",display_order:4 },
      { id:"fc5",object_id:"obj-cash",api_name:"reason",source_column:"reason",active:true,readable:true,writable:true,label:"Reason",display_order:5 },
    ],
  };
  return async (sql, params = []) => {
    const s = String(sql);
    if (s.includes("FROM role_permissions") && s.includes("p.code = ANY")) return { rows: (params[2] || []).map((code) => ({ code })) };
    if (s.includes("FROM platform_permission_set_assignments")) return { rows: [] };
    if (s.includes("FROM platform_object_permissions")) return { rows: [{ can_view:true, can_create:true, can_edit:true, can_delete:true }] };
    if (s.includes("FROM platform_objects")) {
      const key = params.find((value) => typeof value === "string" && objects[value]);
      return { rows: key ? [objects[key]] : [] };
    }
    if (s.includes("FROM platform_fields")) {
      const id = params[0];
      const key = Object.keys(objects).find((name) => objects[name].id === id);
      return { rows: key ? fields[key] : [] };
    }
    if (s.includes('FROM "products"')) return { rows: products };
    if (s.includes('INSERT INTO "cash_movements"')) {
      const row = { id:"cash-1", till_session_id:params[0], user_id:params[1], type:params[2], amount:params[3], reason:params[4], company_id:"c1", store_id:"s1" };
      inserted.push(row);
      return { rows:[row] };
    }
    if (s.includes("information_schema.columns")) return { rows: [] };
    if (s.includes("platform_workflow_step_runs") || s.includes("platform_workflow_runs")) return { rows: [{ id:"trace" }] };
    return { rows: [] };
  };
}

const req = {
  user: { id:"u1", companyId:"c1", storeId:"s1", roleId:"r1", permissions:["workflow.execute"] },
  _workflowEffectivePermissionSets: [],
};

async function debugSystem(systemKey, inputs) {
  const flow = systemFlows.get(systemKey);
  assert.ok(flow, systemKey + " missing");
  const workflowVariables = { variables:{ ...inputs }, steps:{} };
  const results = await executeWorkflowActions({
    actions:flow.actions,
    allActions:flow.actions,
    db:permissionDb(),
    req,
    companyId:"c1",
    userId:"u1",
    record:{ ...inputs },
    workflowVariables,
    debugMode:true,
  });
  return { results, workflowVariables };
}

test("Till system Flows are present and validate", () => {
  for (const key of ["flow:till.stock.validate","flow:till.age.verify","flow:till.payment.validate","flow:till.receipt.qr"]) {
    const flow = systemFlows.get(key);
    assert.ok(flow, key + " missing");
    for (const action of flow.actions) {
      const definition = getWorkflowActionDefinition(action.key || action.type);
      assert.ok(definition, (action.key || action.type) + " runtime missing");
      definition.validation?.(action);
    }
  }
});

test("Till stock Flow debug covers block and allow paths", async () => {
  let run = await debugSystem("flow:till.stock.validate", { hasShortfall:true, allowNegativeStock:false });
  assert.equal(run.workflowVariables.variables.allowed, false);
  run = await debugSystem("flow:till.stock.validate", { hasShortfall:true, allowNegativeStock:true });
  assert.equal(run.workflowVariables.variables.allowed, true);
});

test("Till age Flow debug covers required and verified paths", async () => {
  let run = await debugSystem("flow:till.age.verify", { requiresAgeVerification:true, ageVerified:false });
  assert.equal(run.workflowVariables.variables.allowed, false);
  run = await debugSystem("flow:till.age.verify", { requiresAgeVerification:true, ageVerified:true });
  assert.equal(run.workflowVariables.variables.allowed, true);
});

test("Till payment Flow debug covers cash, card, credit and gift-card requirements", async () => {
  const base = { online:true, cardAvailable:true, customerSelected:true, hasGiftCardCode:true, cashReceived:20, total:10 };
  let run = await debugSystem("flow:till.payment.validate", { ...base, paymentMethod:"cash" });
  assert.equal(run.workflowVariables.variables.allowed, true);
  run = await debugSystem("flow:till.payment.validate", { ...base, paymentMethod:"cash", cashReceived:5 });
  assert.equal(run.workflowVariables.variables.allowed, false);
  run = await debugSystem("flow:till.payment.validate", { ...base, paymentMethod:"card", cardAvailable:false });
  assert.equal(run.workflowVariables.variables.allowed, false);
  run = await debugSystem("flow:till.payment.validate", { ...base, paymentMethod:"customer_credit", customerSelected:false });
  assert.equal(run.workflowVariables.variables.allowed, false);
  run = await debugSystem("flow:till.payment.validate", { ...base, paymentMethod:"gift_card", hasGiftCardCode:false });
  assert.equal(run.workflowVariables.variables.allowed, false);
});

const priceOverrideActions = [
  { id:"get_product", label:"Get Product", apiName:"get_product", key:"GET_RECORDS", objectKey:"product", filters:[{ field:"id", operator:"equals", value:{ path:"record.productId" } }], limit:1, store:"first" },
  { id:"price_is_valid", label:"Requested Price Is Valid", apiName:"price_is_valid", key:"FORMULA", resourceName:"priceIsValid", resultType:"boolean", expression:"requestedPrice > 0", inputs:{ requestedPrice:{ path:"record.requestedPrice" } } },
  { id:"validate_price", label:"Validate Requested Price", apiName:"validate_price", key:"CONDITION", outcomes:[{ id:"valid", label:"Valid Price", condition:{ match:"all", conditions:[{ field:"variables.priceIsValid", operator:"equals", value:true }] }, branch:["approved_price","approved_reason"] }], defaultLabel:"Invalid Price", defaultBranch:["invalid_price"] },
  { id:"approved_price", label:"Set Approved Price", apiName:"approved_price", key:"ASSIGNMENT", variableName:"approvedPrice", variableType:"currency", operator:"set", value:{ path:"record.requestedPrice" } },
  { id:"approved_reason", label:"Set Override Reason", apiName:"approved_reason", key:"ASSIGNMENT", variableName:"approvedReason", variableType:"text", operator:"set", value:{ path:"record.reason" } },
  { id:"invalid_price", label:"Reject Invalid Price", apiName:"invalid_price", key:"CUSTOM_ERROR", errorMessage:"Price override must be greater than zero", errorLocation:"record" },
];

test("Price Override Flow debug validates object lookup and both decision paths", async () => {
  const db = permissionDb({ products:[{ id:"p1", name:"Tea", price:4 }] });
  let workflowVariables = { variables:{}, steps:{} };
  await executeWorkflowActions({ actions:priceOverrideActions, allActions:priceOverrideActions, db, req, companyId:"c1", record:{ productId:"p1", requestedPrice:3.5, reason:"Manager approved" }, workflowVariables, debugMode:true });
  assert.equal(workflowVariables.variables.approvedPrice, 3.5);
  assert.equal(workflowVariables.variables.approvedReason, "Manager approved");

  workflowVariables = { variables:{}, steps:{} };
  await assert.rejects(
    executeWorkflowActions({ actions:priceOverrideActions, allActions:priceOverrideActions, db, req, companyId:"c1", record:{ productId:"p1", requestedPrice:0 }, workflowVariables, debugMode:true }),
    /greater than zero/
  );
});

const pettyActions = [
  { id:"amount_is_valid", label:"Petty Cash Amount Is Valid", apiName:"amount_is_valid", key:"FORMULA", resourceName:"amountIsValid", resultType:"boolean", expression:"amount > 0", inputs:{ amount:{ path:"record.amount" } } },
  { id:"validate_amount", label:"Validate Petty Cash", apiName:"validate_amount", key:"CONDITION", outcomes:[{ id:"valid", label:"Valid Amount", condition:{ match:"all", conditions:[{ field:"variables.amountIsValid", operator:"equals", value:true }] }, branch:["create_cash_ledger"] }], defaultLabel:"Invalid Amount", defaultBranch:["invalid_amount"] },
  { id:"create_cash_ledger", label:"Create Cash Ledger Entry", apiName:"create_cash_ledger", key:"CREATE_RECORD", objectKey:"cash_ledger", fieldValues:{ till_session_id:{ path:"record.tillSessionId" }, user_id:{ path:"record.userId" }, type:"cash_out", amount:{ path:"record.amount" }, reason:{ path:"record.reason" } } },
  { id:"invalid_amount", label:"Reject Invalid Amount", apiName:"invalid_amount", key:"CUSTOM_ERROR", errorMessage:"Petty cash amount must be greater than zero", errorLocation:"record" },
];

test("Petty Cash Flow debug creates Cash Ledger and rejects invalid amount", async () => {
  const inserted = [];
  const db = permissionDb({ inserted });
  await executeWorkflowActions({ actions:pettyActions, allActions:pettyActions, db, req, companyId:"c1", record:{ tillSessionId:"ts1", userId:"u1", amount:7.25, reason:"Milk" }, workflowVariables:{ variables:{}, steps:{} }, debugMode:true });
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].type, "cash_out");
  assert.equal(inserted[0].amount, 7.25);

  await assert.rejects(
    executeWorkflowActions({ actions:pettyActions, allActions:pettyActions, db, req, companyId:"c1", record:{ tillSessionId:"ts1", userId:"u1", amount:0 }, workflowVariables:{ variables:{}, steps:{} }, debugMode:true }),
    /greater than zero/
  );
});

test("Receipt QR policy Flow formula debug covers AUTO, MANUAL, REGENERATE and NEW_SALE", async () => {
  const action = {
    id:"policy_allowed", label:"Evaluate Receipt QR Policy", apiName:"policy_allowed", key:"FORMULA",
    resourceName:"allowed", resultType:"boolean",
    expression:'(event == "AUTO" && (mode == "ALWAYS" || (mode == "ONLY_WHEN_PRINTER_UNAVAILABLE" && !printerAvailable))) || (event == "MANUAL" && allowManual) || (event == "REGENERATE" && allowRegenerate) || (event == "NEW_SALE" && autoClose)',
    inputs:{
      event:{ path:"record.event" }, mode:{ path:"record.mode" }, printerAvailable:{ path:"record.printerAvailable" },
      allowManual:{ path:"record.allowManual" }, allowRegenerate:{ path:"record.allowRegenerate" }, autoClose:{ path:"record.autoClose" },
    },
  };
  const run = async (record) => {
    const vars={ variables:{}, steps:{} };
    await executeWorkflowActions({ actions:[action], allActions:[action], db:permissionDb(), req, companyId:"c1", record, workflowVariables:vars, debugMode:true });
    return vars.variables.allowed;
  };
  assert.equal(await run({ event:"AUTO",mode:"ALWAYS",printerAvailable:true,allowManual:false,allowRegenerate:false,autoClose:false }), true);
  assert.equal(await run({ event:"AUTO",mode:"ONLY_WHEN_PRINTER_UNAVAILABLE",printerAvailable:true,allowManual:false,allowRegenerate:false,autoClose:false }), false);
  assert.equal(await run({ event:"MANUAL",mode:"OFF",printerAvailable:true,allowManual:true,allowRegenerate:false,autoClose:false }), true);
  assert.equal(await run({ event:"REGENERATE",mode:"OFF",printerAvailable:true,allowManual:false,allowRegenerate:true,autoClose:false }), true);
  assert.equal(await run({ event:"NEW_SALE",mode:"OFF",printerAvailable:true,allowManual:false,allowRegenerate:false,autoClose:true }), true);
});
