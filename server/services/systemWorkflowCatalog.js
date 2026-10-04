import { PLATFORM_FUNCTIONS } from "./platformFunctionRegistry.js";
import { PLATFORM_ACTION_REGISTRY } from "./platformActionRegistry.js";
import { TRUSTED_JOB_KINDS } from "./trustedJobKinds.js";

const outputVariable = (name, dataType = "Text", extra = {}) => ({
  value: `variables.${name}`,
  apiName: name,
  label: name,
  type: "Variable",
  dataType,
  defaultValue: "",
  isCollection: false,
  availableInput: false,
  availableOutput: true,
  objectKey: "",
  ...extra,
});
const assignment = (id, label, variableName, variableType, value) => ({
  id, label, apiName: id, key: "ASSIGNMENT", variableName, variableType, operator: "set", value,
});

const PLATFORM_SYSTEM_WORKFLOWS = Object.freeze([
  {
    systemKey: "flow:GPT_OPEN_FOOD_FACTS_LOOKUP_PRODUCT",
    name: "GPT - Open Food Facts - Lookup Product",
    triggerKey: "manual",
    action: {
      type: "workflow", systemGenerated: true, systemKey: "flow:GPT_OPEN_FOOD_FACTS_LOOKUP_PRODUCT",
      scope: "system", capabilityType: "workflow", capabilityKey: "GPT_OPEN_FOOD_FACTS_LOOKUP_PRODUCT",
      apiName: "GPT_OPEN_FOOD_FACTS_LOOKUP_PRODUCT", flowType: "AUTOLAUNCHED",
      inputs: [{ name: "barcode", type: "text", required: true }],
      outputs: ["found","barcode","productName","brand","imageUrl","ingredients"],
      resources: [
        outputVariable("barcode", "Text", { availableInput: true }),
        outputVariable("found", "Boolean"),
        outputVariable("productName"),
        outputVariable("brand"),
        outputVariable("imageUrl"),
        outputVariable("ingredients"),
      ],
      actions: [
        { id: "lookup_http", label: "Lookup Product", apiName: "lookup_http", key: "ONE_HTTP_REQUEST", providerKey: "open_food_facts", method: "GET", endpoint: "/api/v2/product/{{barcode}}.json" },
        { id: "product_found", label: "Product Found?", apiName: "product_found", key: "CONDITION",
          outcomes: [{ id: "found", label: "Found", condition: { match: "all", conditions: [
            { field: "steps.lookup_http.success", operator: "equals", value: true },
            { field: "steps.lookup_http.data.status", operator: "equals", value: 1 }
          ] }, branch: ["set_found","set_barcode","set_product_name","set_brand","set_image_url","set_ingredients"] }],
          defaultLabel: "Not Found", defaultBranch: ["set_not_found"] },
        assignment("set_found", "Set Found", "found", "boolean", true),
        assignment("set_barcode", "Set Barcode", "barcode", "text", { path: "steps.lookup_http.data.code" }),
        assignment("set_product_name", "Set Product Name", "productName", "text", { path: "steps.lookup_http.data.product.product_name" }),
        assignment("set_brand", "Set Brand", "brand", "text", { path: "steps.lookup_http.data.product.brands" }),
        assignment("set_image_url", "Set Image URL", "imageUrl", "text", { path: "steps.lookup_http.data.product.image_front_url" }),
        assignment("set_ingredients", "Set Ingredients", "ingredients", "text", { path: "steps.lookup_http.data.product.ingredients_text" }),
        assignment("set_not_found", "Set Not Found", "found", "boolean", false),
      ]
    }
  },
  {
    systemKey: "flow:GPT_OPEN_FOOD_FACTS_TEST_CONNECTION",
    name: "GPT - Open Food Facts - Test Connection",
    triggerKey: "manual",
    action: {
      type: "workflow", systemGenerated: true, systemKey: "flow:GPT_OPEN_FOOD_FACTS_TEST_CONNECTION",
      scope: "system", capabilityType: "workflow", capabilityKey: "GPT_OPEN_FOOD_FACTS_TEST_CONNECTION",
      apiName: "GPT_OPEN_FOOD_FACTS_TEST_CONNECTION", flowType: "AUTOLAUNCHED",
      outputs: ["connected","message","statusCode"],
      resources: [
        outputVariable("connected", "Boolean"),
        outputVariable("message"),
        outputVariable("statusCode", "Number"),
      ],
      actions: [
        { id: "test_http", label: "Call Open Food Facts", apiName: "test_http", key: "ONE_HTTP_REQUEST", providerKey: "open_food_facts", method: "GET", endpoint: "/api/v2/product/737628064502.json" },
        { id: "connection_ok", label: "Connection Successful?", apiName: "connection_ok", key: "CONDITION",
          outcomes: [{ id: "success", label: "Success", condition: { match: "all", conditions: [{ field: "steps.test_http.success", operator: "equals", value: true }] },
            branch: ["set_connected","set_connected_message","set_connected_status"] }],
          defaultLabel: "Failed", defaultBranch: ["set_failed","set_failed_message","set_failed_status"] },
        assignment("set_connected", "Set Connected", "connected", "boolean", true),
        assignment("set_connected_message", "Set Connected Message", "message", "text", "Connected"),
        assignment("set_connected_status", "Set Connected Status Code", "statusCode", "number", { path: "steps.test_http.statusCode" }),
        assignment("set_failed", "Set Failed", "connected", "boolean", false),
        assignment("set_failed_message", "Set Failed Message", "message", "text", "Connection failed"),
        assignment("set_failed_status", "Set Failed Status Code", "statusCode", "number", { path: "steps.test_http.statusCode" }),
      ]
    }
  },
  {
    systemKey: "flow:GPT_QUICKBOOKS_SYNC_VENDORS",
    name: "GPT - QuickBooks - Sync Vendors",
    triggerKey: "manual",
    action: {
      type: "workflow", systemGenerated: true, systemKey: "flow:GPT_QUICKBOOKS_SYNC_VENDORS",
      scope: "system", capabilityType: "workflow", capabilityKey: "GPT_QUICKBOOKS_SYNC_VENDORS",
      apiName: "GPT_QUICKBOOKS_SYNC_VENDORS", flowType: "AUTOLAUNCHED",
      inputs: [{ name: "supplierId", type: "text", required: true }, { name: "integrationId", type: "text", required: true }],
      outputs: ["externalId","syncToken","mappingId"],
      resources: [
        outputVariable("supplierId","Text",{ availableInput:true }), outputVariable("integrationId","Text",{ availableInput:true }),
        outputVariable("externalId"), outputVariable("syncToken"), outputVariable("mappingId")
      ],
      actions: [
        { id:"get_supplier", label:"Get Supplier", apiName:"get_supplier", key:"GET_RECORDS", objectKey:"supplier", filters:[{field:"id",operator:"equals",value:{path:"variables.supplierId"}}], limit:1, store:"first" },
        { id:"get_mapping", label:"Get QuickBooks Vendor Mapping", apiName:"get_mapping", key:"GET_RECORDS", objectKey:"integration_entity_mapping",
          filters:[{field:"integration_id",operator:"equals",value:{path:"variables.integrationId"}},{field:"entity_type",operator:"equals",value:"supplier"},{field:"local_entity_id",operator:"equals",value:{path:"variables.supplierId"}}], limit:1, store:"first" },
        { id:"vendor_mapped", label:"Vendor Already Mapped?", apiName:"vendor_mapped", key:"CONDITION",
          outcomes:[{id:"mapped",label:"Mapped",condition:{match:"all",conditions:[{field:"steps.get_mapping.count",operator:"greater_than",value:0}]},branch:["update_vendor"]}],
          defaultLabel:"New Vendor",defaultBranch:["create_vendor"] },
        { id:"create_vendor", label:"Create QuickBooks Vendor", apiName:"create_vendor", key:"ONE_HTTP_REQUEST", providerKey:"quickbooks", method:"POST", endpoint:"/v3/company/{{realmId}}/vendor",
          body:{ DisplayName:{path:"steps.get_supplier.record.name"}, PrimaryEmailAddr:{Address:{path:"steps.get_supplier.record.email"}}, PrimaryPhone:{FreeFormNumber:{path:"steps.get_supplier.record.phone"}}, BillAddr:{Line1:{path:"steps.get_supplier.record.address"}} } },
        { id:"update_vendor", label:"Update QuickBooks Vendor", apiName:"update_vendor", key:"ONE_HTTP_REQUEST", providerKey:"quickbooks", method:"POST", endpoint:"/v3/company/{{realmId}}/vendor",
          body:{ Id:{path:"steps.get_mapping.record.external_id"}, SyncToken:{path:"steps.get_mapping.record.metadata.syncToken"}, sparse:true, DisplayName:{path:"steps.get_supplier.record.name"}, PrimaryEmailAddr:{Address:{path:"steps.get_supplier.record.email"}}, PrimaryPhone:{FreeFormNumber:{path:"steps.get_supplier.record.phone"}}, BillAddr:{Line1:{path:"steps.get_supplier.record.address"}} } },
        { id:"vendor_created", label:"New Vendor Created?", apiName:"vendor_created", key:"CONDITION",
          outcomes:[{id:"yes",label:"Created",condition:{match:"all",conditions:[{field:"steps.create_vendor.success",operator:"equals",value:true}]},branch:["create_vendor_mapping"]}],
          defaultLabel:"Existing Vendor Updated",defaultBranch:["update_vendor_mapping"] },
        { id:"create_vendor_mapping", label:"Create Vendor Mapping", apiName:"create_vendor_mapping", key:"CREATE_RECORD", objectKey:"integration_entity_mapping",
          fieldValues:{integration_id:{path:"variables.integrationId"},entity_type:"supplier",local_entity_id:{path:"variables.supplierId"},external_id:{path:"steps.create_vendor.data.Vendor.Id"},mapping_status:"LINKED",metadata:{syncToken:{path:"steps.create_vendor.data.Vendor.SyncToken"},displayName:{path:"steps.create_vendor.data.Vendor.DisplayName"}}} },
        { id:"update_vendor_mapping", label:"Update Vendor Mapping", apiName:"update_vendor_mapping", key:"UPDATE_RECORD", objectKey:"integration_entity_mapping", recordId:{path:"steps.get_mapping.record.id"},
          fieldValues:{external_id:{path:"steps.update_vendor.data.Vendor.Id"},mapping_status:"LINKED",safe_error:null,metadata:{syncToken:{path:"steps.update_vendor.data.Vendor.SyncToken"},displayName:{path:"steps.update_vendor.data.Vendor.DisplayName"}}} },
        assignment("set_vendor_external_create","Set Vendor External ID","externalId","text",{path:"steps.create_vendor.data.Vendor.Id"}),
        assignment("set_vendor_sync_create","Set Vendor Sync Token","syncToken","text",{path:"steps.create_vendor.data.Vendor.SyncToken"}),
        assignment("set_vendor_mapping_create","Set Vendor Mapping ID","mappingId","text",{path:"steps.create_vendor_mapping.created.id"}),
        assignment("set_vendor_external_update","Set Updated Vendor External ID","externalId","text",{path:"steps.update_vendor.data.Vendor.Id"}),
        assignment("set_vendor_sync_update","Set Updated Vendor Sync Token","syncToken","text",{path:"steps.update_vendor.data.Vendor.SyncToken"}),
        assignment("set_vendor_mapping_update","Set Updated Vendor Mapping ID","mappingId","text",{path:"steps.get_mapping.record.id"})
      ]
    }
  },
  {
    systemKey: "flow:GPT_QUICKBOOKS_SYNC_PURCHASES",
    name: "GPT - QuickBooks - Sync Purchases",
    triggerKey: "manual",
    action: {
      type:"workflow", systemGenerated:true, systemKey:"flow:GPT_QUICKBOOKS_SYNC_PURCHASES",
      scope:"system", capabilityType:"workflow", capabilityKey:"GPT_QUICKBOOKS_SYNC_PURCHASES",
      apiName:"GPT_QUICKBOOKS_SYNC_PURCHASES", flowType:"AUTOLAUNCHED",
      inputs:[{name:"purchaseId",type:"text",required:true},{name:"integrationId",type:"text",required:true}],
      outputs:["externalId","syncToken","mappingId"],
      resources:[outputVariable("purchaseId","Text",{availableInput:true}),outputVariable("integrationId","Text",{availableInput:true}),outputVariable("externalId"),outputVariable("syncToken"),outputVariable("mappingId")],
      actions:[
        {id:"get_purchase",label:"Get Purchase",apiName:"get_purchase",key:"GET_RECORDS",objectKey:"purchase",filters:[{field:"id",operator:"equals",value:{path:"variables.purchaseId"}}],limit:1,store:"first"},
        {id:"get_vendor_mapping",label:"Get Supplier QuickBooks Mapping",apiName:"get_vendor_mapping",key:"GET_RECORDS",objectKey:"integration_entity_mapping",
          filters:[{field:"integration_id",operator:"equals",value:{path:"variables.integrationId"}},{field:"entity_type",operator:"equals",value:"supplier"},{field:"local_entity_id",operator:"equals",value:{path:"steps.get_purchase.record.supplier_id"}}],limit:1,store:"first"},
        {id:"get_purchase_mapping",label:"Get Purchase QuickBooks Mapping",apiName:"get_purchase_mapping",key:"GET_RECORDS",objectKey:"integration_entity_mapping",
          filters:[{field:"integration_id",operator:"equals",value:{path:"variables.integrationId"}},{field:"entity_type",operator:"equals",value:"purchase"},{field:"local_entity_id",operator:"equals",value:{path:"variables.purchaseId"}}],limit:1,store:"first"},
        {id:"get_lines",label:"Get Purchase Lines",apiName:"get_lines",key:"GET_RECORDS",objectKey:"purchase_line",filters:[{field:"purchase_id",operator:"equals",value:{path:"variables.purchaseId"}}],store:"all",limit:500},
        {id:"purchase_already_synced",label:"Purchase Already Synced?",apiName:"purchase_already_synced",key:"CONDITION",
          outcomes:[{id:"yes",label:"Already Synced",condition:{match:"all",conditions:[{field:"steps.get_purchase_mapping.count",operator:"greater_than",value:0},{field:"steps.get_purchase_mapping.record.mapping_status",operator:"equals",value:"LINKED"}]},branch:["set_existing_purchase_external","set_existing_purchase_mapping"]}],
          defaultLabel:"Export Bill",defaultBranch:["export_bill"]},
        {id:"export_bill",label:"Export QuickBooks Bill",apiName:"export_bill",key:"ONE_HTTP_REQUEST",providerKey:"quickbooks",method:"POST",endpoint:"/v3/company/{{realmId}}/bill",
          body:{VendorRef:{value:{path:"steps.get_vendor_mapping.record.external_id"}},TxnDate:{path:"steps.get_purchase.record.purchase_date"},DocNumber:{path:"steps.get_purchase.record.reference_number"},
            Line:{path:"steps.get_lines.records"}}},
        {id:"bill_exported",label:"Bill Exported?",apiName:"bill_exported",key:"CONDITION",
          outcomes:[{id:"yes",label:"Success",condition:{match:"all",conditions:[{field:"steps.export_bill.success",operator:"equals",value:true}]},branch:["create_purchase_mapping","set_purchase_external","set_purchase_sync","set_purchase_mapping"]}],
          defaultLabel:"Failed",defaultBranch:[]},
        {id:"create_purchase_mapping",label:"Create Purchase Mapping",apiName:"create_purchase_mapping",key:"CREATE_RECORD",objectKey:"integration_entity_mapping",
          fieldValues:{integration_id:{path:"variables.integrationId"},entity_type:"purchase",local_entity_id:{path:"variables.purchaseId"},external_id:{path:"steps.export_bill.data.Bill.Id"},mapping_status:"LINKED",metadata:{syncToken:{path:"steps.export_bill.data.Bill.SyncToken"}}}},
        assignment("set_purchase_external","Set Purchase External ID","externalId","text",{path:"steps.export_bill.data.Bill.Id"}),
        assignment("set_purchase_sync","Set Purchase Sync Token","syncToken","text",{path:"steps.export_bill.data.Bill.SyncToken"}),
        assignment("set_purchase_mapping","Set Purchase Mapping ID","mappingId","text",{path:"steps.create_purchase_mapping.created.id"}),
        assignment("set_existing_purchase_external","Set Existing Purchase External ID","externalId","text",{path:"steps.get_purchase_mapping.record.external_id"}),
        assignment("set_existing_purchase_mapping","Set Existing Purchase Mapping ID","mappingId","text",{path:"steps.get_purchase_mapping.record.id"})
      ]
    }
  }
]);

function titleCase(value = "") {
  return String(value)
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function functionWorkflow(fn) {
  return {
    systemKey: `function:${fn.key}`,
    name: `System · Function · ${titleCase(fn.key)}`,
    triggerKey: "system_function",
    action: {
      type: "workflow",
      systemGenerated: true,
      systemKey: `function:${fn.key}`,
      scope: "system",
      capabilityType: "function",
      capabilityKey: fn.key,
      actions: [{
        type: "CALL_FUNCTION",
        functionKey: fn.key,
        inputs: {},
        label: fn.description || fn.key,
      }],
    },
  };
}

function actionWorkflow(action) {
  return {
    systemKey: `action:${action.key}`,
    name: `System · Action · ${action.displayName || titleCase(action.key)}`,
    triggerKey: "system_action",
    action: {
      type: "workflow",
      systemGenerated: true,
      systemKey: `action:${action.key}`,
      scope: "system",
      capabilityType: "action",
      capabilityKey: action.key,
      // This is the canonical editable wrapper. Phase 3 reroutes callers
      // through these workflow ids and supplies runtime inputs/config.
      actions: [{
        type: action.key,
        systemTemplate: true,
        label: action.displayName || action.key,
      }],
    },
  };
}

function jobWorkflow(kind) {
  return {
    systemKey: `job:${kind}`,
    name: `System · Trigger · ${titleCase(kind)}`,
    triggerKey: "system_job",
    action: {
      type: "workflow",
      systemGenerated: true,
      systemKey: `job:${kind}`,
      scope: "system",
      capabilityType: "job",
      capabilityKey: kind,
      // Job execution is wired to these entries in Phase 3.
      actions: [{
        type: "STOP",
        reason: `System job trigger placeholder for ${kind}`,
        systemTemplate: true,
      }],
    },
  };
}

export function systemWorkflowDefinitions() {
  const functions = PLATFORM_FUNCTIONS.map(functionWorkflow);
  const actions = PLATFORM_ACTION_REGISTRY
    .filter((item) => item?.key && item.key !== "WORKFLOW" && item.systemVisible !== false)
    .map(actionWorkflow);
  const jobs = TRUSTED_JOB_KINDS.map(jobWorkflow);
  return [...functions, ...actions, ...jobs, ...PLATFORM_SYSTEM_WORKFLOWS];
}

export async function ensureSystemWorkflowCatalog({ db, companyId, userId = null }) {
  if (!db || typeof db !== "function" || !companyId) return { created: 0, existing: 0, total: 0 };

  const definitions = systemWorkflowDefinitions();
  const existingResult = await db(
    `SELECT id,name,object_id,trigger_key,conditions,action,version,active_version,lifecycle_status,created_by,user_modified
       FROM platform_rules
      WHERE company_id=$1
        AND action->>'systemGenerated'='true'
        AND action->>'systemKey' IS NOT NULL`,
    [companyId]
  );
  const existing = new Map(
    (existingResult.rows || []).map((row) => [String(row.action?.systemKey || ""), row])
  );

  // Remove untouched generated wrappers whose underlying capability no longer exists.
  // Developer-modified wrappers are preserved for explicit migration/review.
  const validSystemKeys = definitions.map((definition) => definition.systemKey);
  const staleResult = await db(
    `DELETE FROM platform_rules
      WHERE company_id=$1
        AND action->>'systemGenerated'='true'
        AND action->>'systemKey' IS NOT NULL
        AND COALESCE(user_modified,FALSE)=FALSE
        AND NOT ((action->>'systemKey') = ANY($2::text[]))
      RETURNING id,action->>'systemKey' AS system_key`,
    [companyId, validSystemKeys]
  );
  const removed = staleResult.rows?.length || 0;

  // System workflows are executable defaults. Respect developer edits, but
  // repair untouched rows created by older catalogue versions.
  await db(
    `UPDATE platform_rules
        SET active=TRUE,lifecycle_status='ACTIVE',active_version=COALESCE(active_version,version,1),updated_at=NOW()
      WHERE company_id=$1
        AND action->>'systemGenerated'='true'
        AND COALESCE(user_modified,FALSE)=FALSE
        AND (active=FALSE OR lifecycle_status<>'ACTIVE')`,
    [companyId]
  );

  let created = 0;
  for (const definition of definitions) {
    const current = existing.get(definition.systemKey);
    if (current) {
      if (current.user_modified !== true) {
        await db(
          `UPDATE platform_rules
              SET name=$1,trigger_key=$2,action=$3::jsonb,active=TRUE,lifecycle_status='ACTIVE',updated_at=NOW()
            WHERE id=$4 AND company_id=$5 AND COALESCE(user_modified,FALSE)=FALSE`,
          [definition.name, definition.triggerKey, JSON.stringify(definition.action), current.id, companyId]
        );
      }
      continue;
    }
    await db(
      `INSERT INTO platform_rules
         (object_id,name,trigger_key,conditions,action,active,lifecycle_status,version,active_version,company_id,created_by,managed,package_required,user_modified)
       VALUES
         (NULL,$1,$2,'[]'::jsonb,$3::jsonb,TRUE,'ACTIVE',1,1,$4,$5,TRUE,FALSE,FALSE)`,
      [
        definition.name,
        definition.triggerKey,
        JSON.stringify(definition.action),
        companyId,
        userId || null,
      ]
    );
    created += 1;
  }

  await db(
    `INSERT INTO platform_workflow_versions
       (company_id,workflow_id,version,definition,lifecycle_status,created_by)
     SELECT r.company_id,r.id,COALESCE(r.active_version,r.version,1),
            jsonb_build_object(
              'object_id',r.object_id,
              'name',r.name,
              'trigger_key',r.trigger_key,
              'conditions',r.conditions,
              'action',r.action,
              'active',r.active,
              'lifecycle_status',r.lifecycle_status,
              'version',COALESCE(r.active_version,r.version,1)
            ),
            r.lifecycle_status,r.created_by
       FROM platform_rules r
      WHERE r.company_id=$1
        AND r.action->>'systemGenerated'='true'
        AND r.action->>'systemKey' IS NOT NULL
     ON CONFLICT (company_id,workflow_id,version) DO NOTHING`,
    [companyId]
  );

  return {
    created,
    removed,
    existing: Math.max(0, existing.size - removed),
    total: definitions.length,
  };
}
