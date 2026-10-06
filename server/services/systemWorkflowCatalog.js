import { PACKAGE_RUNTIME_FLOWS } from "../packages/runtimeFlowManifests.js";

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

const creditInput = (name, type, { required = false, defaultValue = null } = {}) => ({
  name,
  label: name,
  type,
  required,
  defaultValue,
});
const creditFormula = (id, resourceName, resultType, expression, inputs) => ({
  id,
  label: resourceName,
  apiName: id,
  key: "FORMULA",
  resourceName,
  resultType,
  expression,
  inputs,
});
const creditResourceType = (type) => ({
  text: "Text",
  number: "Number",
  boolean: "Boolean",
  object: "Object",
  record: "Record",
  collection: "Collection",
  date: "Date",
  datetime: "DateTime",
})[String(type || "text").toLowerCase()] || "Text";
const creditFlow = ({ key, name, inputs, outputs, actions }) => {
  const resources = [
    ...inputs.map((input) => outputVariable(input.name, creditResourceType(input.type), {
      availableInput: true,
      availableOutput: false,
      defaultValue: input.defaultValue,
      isCollection: input.type === "collection",
    })),
    ...outputs.map((output) => outputVariable(output.name, creditResourceType(output.type), {
      availableInput: false,
      availableOutput: true,
      isCollection: output.type === "collection",
    })),
  ];
  const resourceNames = new Set(resources.map((resource) => resource.apiName));
  for (const action of actions) {
    const actionType = String(action?.type || action?.key || "").toUpperCase();
    const candidates = actionType === "FORMULA"
      ? [{ name: action.resourceName, type: action.resultType }]
      : actionType === "ASSIGNMENT"
        ? [{ name: action.variableName, type: action.variableType }]
        : actionType === "LOOP"
          ? [{ name: action.itemVariable, type: "object" }]
          : ["COLLECTION_FILTER", "TRANSFORM"].includes(actionType)
            ? [{ name: action.outputVariable, type: "collection" }]
            : [];
    for (const candidate of candidates) {
      const name = String(candidate.name || "");
      if (!name || resourceNames.has(name)) continue;
      resources.push(outputVariable(name, creditResourceType(candidate.type), {
        availableInput: false,
        availableOutput: true,
        defaultValue: candidate.type === "collection" ? [] : candidate.type === "object" ? {} : "",
        isCollection: candidate.type === "collection",
      }));
      resourceNames.add(name);
    }
  }
  return {
    systemKey: `flow:${key}`,
    name: `COPILOT- ${name}`,
    triggerKey: "manual",
    action: {
      type: "workflow",
      systemGenerated: true,
      systemKey: `flow:${key}`,
      scope: "system",
      capabilityType: "workflow",
      capabilityKey: key,
      apiName: key.replaceAll(".", "_"),
      flowType: "AUTOLAUNCHED",
      inputs,
      outputs: outputs.map((output) => output.name),
      inputContract: inputs,
      outputContract: outputs,
      resources,
      actions,
    },
  };
};

const CUSTOMER_CREDIT_SYSTEM_WORKFLOWS = [];

const tillFlow = (spec) => {
  const flow = creditFlow(spec);
  return { ...flow, name: `OneTill - ${spec.name}` };
};

const TILL_SYSTEM_WORKFLOWS = Object.freeze([]);

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
      inputs:[{name:"purchaseId",type:"text",required:true},{name:"integrationId",type:"text",required:true},{name:"expenseAccountId",type:"text",required:true}],
      outputs:["externalId","syncToken","mappingId"],
      resources:[outputVariable("purchaseId","Text",{availableInput:true}),outputVariable("integrationId","Text",{availableInput:true}),outputVariable("expenseAccountId","Text",{availableInput:true}),outputVariable("externalId"),outputVariable("syncToken"),outputVariable("mappingId")],
      actions:[
        {id:"get_purchase",label:"Get Purchase",apiName:"get_purchase",key:"GET_RECORDS",objectKey:"purchase",filters:[{field:"id",operator:"equals",value:{path:"variables.purchaseId"}}],limit:1,store:"first"},
        {id:"get_vendor_mapping",label:"Get Supplier QuickBooks Mapping",apiName:"get_vendor_mapping",key:"GET_RECORDS",objectKey:"integration_entity_mapping",
          filters:[{field:"integration_id",operator:"equals",value:{path:"variables.integrationId"}},{field:"entity_type",operator:"equals",value:"supplier"},{field:"local_entity_id",operator:"equals",value:{path:"steps.get_purchase.record.supplier_id"}}],limit:1,store:"first"},
        {id:"get_purchase_mapping",label:"Get Purchase QuickBooks Mapping",apiName:"get_purchase_mapping",key:"GET_RECORDS",objectKey:"integration_entity_mapping",
          filters:[{field:"integration_id",operator:"equals",value:{path:"variables.integrationId"}},{field:"entity_type",operator:"equals",value:"purchase"},{field:"local_entity_id",operator:"equals",value:{path:"variables.purchaseId"}}],limit:1,store:"first"},
        {id:"get_lines",label:"Get Purchase Lines",apiName:"get_lines",key:"GET_RECORDS",objectKey:"purchase_line",filters:[{field:"purchase_id",operator:"equals",value:{path:"variables.purchaseId"}}],store:"all",limit:500},
        {id:"build_bill_lines",label:"Build QuickBooks Bill Lines",apiName:"build_bill_lines",key:"TRANSFORM",collection:"steps.get_lines.records",
          transformMappings:{"Amount":"item.line_total","Description":"item.product_id","DetailType":"AccountBasedExpenseLineDetail","AccountBasedExpenseLineDetail.AccountRef.value":"variables.expenseAccountId"}},
        {id:"purchase_already_synced",label:"Purchase Already Synced?",apiName:"purchase_already_synced",key:"CONDITION",
          outcomes:[{id:"yes",label:"Already Synced",condition:{match:"all",conditions:[{field:"steps.get_purchase_mapping.count",operator:"greater_than",value:0},{field:"steps.get_purchase_mapping.record.mapping_status",operator:"equals",value:"LINKED"}]},branch:["set_existing_purchase_external","set_existing_purchase_mapping"]}],
          defaultLabel:"Export Bill",defaultBranch:["export_bill"]},
        {id:"export_bill",label:"Export QuickBooks Bill",apiName:"export_bill",key:"ONE_HTTP_REQUEST",providerKey:"quickbooks",method:"POST",endpoint:"/v3/company/{{realmId}}/bill",
          body:{VendorRef:{value:{path:"steps.get_vendor_mapping.record.external_id"}},TxnDate:{path:"steps.get_purchase.record.purchase_date"},DocNumber:{path:"steps.get_purchase.record.reference_number"},
            Line:{path:"steps.build_bill_lines.collection"}}},
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
  },
  {
    systemKey:"flow:GPT_QUICKBOOKS_SYNC_SUPPLIER_PAYMENTS", name:"GPT - QuickBooks - Sync Supplier Payments", triggerKey:"manual",
    action:{type:"workflow",systemGenerated:true,systemKey:"flow:GPT_QUICKBOOKS_SYNC_SUPPLIER_PAYMENTS",scope:"system",capabilityType:"workflow",capabilityKey:"GPT_QUICKBOOKS_SYNC_SUPPLIER_PAYMENTS",apiName:"GPT_QUICKBOOKS_SYNC_SUPPLIER_PAYMENTS",flowType:"AUTOLAUNCHED",
      inputs:[{name:"paymentId",type:"text",required:true},{name:"integrationId",type:"text",required:true},{name:"paymentAccountId",type:"text",required:false}],outputs:["externalId","mappingId"],
      resources:[outputVariable("paymentId","Text",{availableInput:true}),outputVariable("integrationId","Text",{availableInput:true}),outputVariable("paymentAccountId","Text",{availableInput:true}),outputVariable("externalId"),outputVariable("mappingId")],
      actions:[
        {id:"get_payment",label:"Get Supplier Payment",apiName:"get_payment",key:"GET_RECORDS",objectKey:"supplier_payment",filters:[{field:"id",operator:"equals",value:{path:"variables.paymentId"}}],limit:1,store:"first"},
        {id:"get_vendor_mapping",label:"Get Vendor Mapping",apiName:"get_vendor_mapping",key:"GET_RECORDS",objectKey:"integration_entity_mapping",filters:[{field:"integration_id",operator:"equals",value:{path:"variables.integrationId"}},{field:"entity_type",operator:"equals",value:"supplier"},{field:"local_entity_id",operator:"equals",value:{path:"steps.get_payment.record.supplier_id"}}],limit:1,store:"first"},
        {id:"get_existing",label:"Get Existing Payment Mapping",apiName:"get_existing",key:"GET_RECORDS",objectKey:"integration_entity_mapping",filters:[{field:"integration_id",operator:"equals",value:{path:"variables.integrationId"}},{field:"entity_type",operator:"equals",value:"supplier_payment"},{field:"local_entity_id",operator:"equals",value:{path:"variables.paymentId"}}],limit:1,store:"first"},
        {id:"already_synced",label:"Payment Already Synced?",apiName:"already_synced",key:"CONDITION",outcomes:[{id:"yes",label:"Already Synced",condition:{match:"all",conditions:[{field:"steps.get_existing.record.mapping_status",operator:"equals",value:"LINKED"}]},branch:["set_existing_payment_external","set_existing_payment_mapping"]}],defaultLabel:"Export",defaultBranch:["export_payment"]},
        {id:"export_payment",label:"Export QuickBooks Bill Payment",apiName:"export_payment",key:"ONE_HTTP_REQUEST",providerKey:"quickbooks",method:"POST",endpoint:"/v3/company/{{realmId}}/billpayment",
          body:{VendorRef:{value:{path:"steps.get_vendor_mapping.record.external_id"}},TotalAmt:{path:"steps.get_payment.record.amount"},TxnDate:{path:"steps.get_payment.record.payment_date"},PrivateNote:{path:"steps.get_payment.record.reference"},PayType:"Check",CheckPayment:{BankAccountRef:{value:{path:"variables.paymentAccountId"}}}}},
        {id:"payment_exported",label:"Payment Exported?",apiName:"payment_exported",key:"CONDITION",outcomes:[{id:"yes",label:"Success",condition:{match:"all",conditions:[{field:"steps.export_payment.success",operator:"equals",value:true}]},branch:["create_payment_mapping","set_payment_external","set_payment_mapping"]}],defaultLabel:"Failed",defaultBranch:[]},
        {id:"create_payment_mapping",label:"Create Payment Mapping",apiName:"create_payment_mapping",key:"CREATE_RECORD",objectKey:"integration_entity_mapping",fieldValues:{integration_id:{path:"variables.integrationId"},entity_type:"supplier_payment",local_entity_id:{path:"variables.paymentId"},external_id:{path:"steps.export_payment.data.BillPayment.Id"},mapping_status:"LINKED",metadata:{syncToken:{path:"steps.export_payment.data.BillPayment.SyncToken"}}}},
        assignment("set_payment_external","Set Payment External ID","externalId","text",{path:"steps.export_payment.data.BillPayment.Id"}),assignment("set_payment_mapping","Set Payment Mapping ID","mappingId","text",{path:"steps.create_payment_mapping.created.id"}),
        assignment("set_existing_payment_external","Set Existing Payment External ID","externalId","text",{path:"steps.get_existing.record.external_id"}),assignment("set_existing_payment_mapping","Set Existing Payment Mapping ID","mappingId","text",{path:"steps.get_existing.record.id"})
      ]}
  },
  {
    systemKey:"flow:GPT_QUICKBOOKS_SYNC_SUPPLIER_CREDITS",name:"GPT - QuickBooks - Sync Supplier Credits",triggerKey:"manual",
    action:{type:"workflow",systemGenerated:true,systemKey:"flow:GPT_QUICKBOOKS_SYNC_SUPPLIER_CREDITS",scope:"system",capabilityType:"workflow",capabilityKey:"GPT_QUICKBOOKS_SYNC_SUPPLIER_CREDITS",apiName:"GPT_QUICKBOOKS_SYNC_SUPPLIER_CREDITS",flowType:"AUTOLAUNCHED",
      inputs:[{name:"returnId",type:"text",required:true},{name:"integrationId",type:"text",required:true},{name:"expenseAccountId",type:"text",required:true}],outputs:["externalId","mappingId"],
      resources:[outputVariable("returnId","Text",{availableInput:true}),outputVariable("integrationId","Text",{availableInput:true}),outputVariable("expenseAccountId","Text",{availableInput:true}),outputVariable("externalId"),outputVariable("mappingId")],
      actions:[
        {id:"get_return",label:"Get Supplier Return",apiName:"get_return",key:"GET_RECORDS",objectKey:"stock_return",filters:[{field:"id",operator:"equals",value:{path:"variables.returnId"}},{field:"return_type",operator:"equals",value:"SUPPLIER"}],limit:1,store:"first"},
        {id:"get_vendor_mapping",label:"Get Vendor Mapping",apiName:"get_vendor_mapping",key:"GET_RECORDS",objectKey:"integration_entity_mapping",filters:[{field:"integration_id",operator:"equals",value:{path:"variables.integrationId"}},{field:"entity_type",operator:"equals",value:"supplier"},{field:"local_entity_id",operator:"equals",value:{path:"steps.get_return.record.supplier_id"}}],limit:1,store:"first"},
        {id:"get_existing",label:"Get Existing Credit Mapping",apiName:"get_existing",key:"GET_RECORDS",objectKey:"integration_entity_mapping",filters:[{field:"integration_id",operator:"equals",value:{path:"variables.integrationId"}},{field:"entity_type",operator:"equals",value:"supplier_return"},{field:"local_entity_id",operator:"equals",value:{path:"variables.returnId"}}],limit:1,store:"first"},
        {id:"already_synced",label:"Credit Already Synced?",apiName:"already_synced",key:"CONDITION",outcomes:[{id:"yes",label:"Already Synced",condition:{match:"all",conditions:[{field:"steps.get_existing.record.mapping_status",operator:"equals",value:"LINKED"}]},branch:["set_existing_credit_external","set_existing_credit_mapping"]}],defaultLabel:"Export",defaultBranch:["export_credit"]},
        {id:"export_credit",label:"Export QuickBooks Vendor Credit",apiName:"export_credit",key:"ONE_HTTP_REQUEST",providerKey:"quickbooks",method:"POST",endpoint:"/v3/company/{{realmId}}/vendorcredit",
          body:{VendorRef:{value:{path:"steps.get_vendor_mapping.record.external_id"}},TxnDate:{path:"steps.get_return.record.created_at"},DocNumber:{path:"steps.get_return.record.return_number"},Line:[{Amount:{path:"steps.get_return.record.refund_amount"},DetailType:"AccountBasedExpenseLineDetail",AccountBasedExpenseLineDetail:{AccountRef:{value:{path:"variables.expenseAccountId"}}}}]}},
        {id:"credit_exported",label:"Credit Exported?",apiName:"credit_exported",key:"CONDITION",outcomes:[{id:"yes",label:"Success",condition:{match:"all",conditions:[{field:"steps.export_credit.success",operator:"equals",value:true}]},branch:["create_credit_mapping","set_credit_external","set_credit_mapping"]}],defaultLabel:"Failed",defaultBranch:[]},
        {id:"create_credit_mapping",label:"Create Credit Mapping",apiName:"create_credit_mapping",key:"CREATE_RECORD",objectKey:"integration_entity_mapping",fieldValues:{integration_id:{path:"variables.integrationId"},entity_type:"supplier_return",local_entity_id:{path:"variables.returnId"},external_id:{path:"steps.export_credit.data.VendorCredit.Id"},mapping_status:"LINKED",metadata:{syncToken:{path:"steps.export_credit.data.VendorCredit.SyncToken"}}}},
        assignment("set_credit_external","Set Credit External ID","externalId","text",{path:"steps.export_credit.data.VendorCredit.Id"}),assignment("set_credit_mapping","Set Credit Mapping ID","mappingId","text",{path:"steps.create_credit_mapping.created.id"}),
        assignment("set_existing_credit_external","Set Existing Credit External ID","externalId","text",{path:"steps.get_existing.record.external_id"}),assignment("set_existing_credit_mapping","Set Existing Credit Mapping ID","mappingId","text",{path:"steps.get_existing.record.id"})
      ]}
  },
  {
    systemKey:"flow:GPT_QUICKBOOKS_RETRY_FAILED_SYNC",name:"GPT - QuickBooks - Retry Failed Sync",triggerKey:"manual",
    action:{type:"workflow",systemGenerated:true,systemKey:"flow:GPT_QUICKBOOKS_RETRY_FAILED_SYNC",scope:"system",capabilityType:"workflow",capabilityKey:"GPT_QUICKBOOKS_RETRY_FAILED_SYNC",apiName:"GPT_QUICKBOOKS_RETRY_FAILED_SYNC",flowType:"AUTOLAUNCHED",
      inputs:[{name:"syncType",type:"text",required:true},{name:"supplierId",type:"text"},{name:"purchaseId",type:"text"},{name:"paymentId",type:"text"},{name:"returnId",type:"text"},{name:"integrationId",type:"text",required:true},{name:"expenseAccountId",type:"text"},{name:"paymentAccountId",type:"text"}],outputs:["retryTarget"],
      resources:[outputVariable("syncType","Text",{availableInput:true}),outputVariable("supplierId","Text",{availableInput:true}),outputVariable("purchaseId","Text",{availableInput:true}),outputVariable("paymentId","Text",{availableInput:true}),outputVariable("returnId","Text",{availableInput:true}),outputVariable("integrationId","Text",{availableInput:true}),outputVariable("expenseAccountId","Text",{availableInput:true}),outputVariable("paymentAccountId","Text",{availableInput:true}),outputVariable("retryTarget")],
      actions:[
        {id:"choose_retry",label:"Choose Failed Sync Type",apiName:"choose_retry",key:"CONDITION",
          outcomes:[
            {id:"vendors",label:"Vendors",condition:{match:"all",conditions:[{field:"variables.syncType",operator:"equals",value:"vendors"}]},branch:["retry_vendor"]},
            {id:"purchases",label:"Purchases",condition:{match:"all",conditions:[{field:"variables.syncType",operator:"equals",value:"purchases"}]},branch:["retry_purchase"]},
            {id:"payments",label:"Payments",condition:{match:"all",conditions:[{field:"variables.syncType",operator:"equals",value:"payments"}]},branch:["retry_payment"]},
            {id:"credits",label:"Credits",condition:{match:"all",conditions:[{field:"variables.syncType",operator:"equals",value:"credits"}]},branch:["retry_credit"]}],
          defaultLabel:"Invalid",defaultBranch:[]},
        {id:"retry_vendor",label:"Retry Vendor Sync",apiName:"retry_vendor",key:"RUN_SUBFLOW",subflowApiName:"GPT_QUICKBOOKS_SYNC_VENDORS",inputMappings:{supplierId:{path:"variables.supplierId"},integrationId:{path:"variables.integrationId"}}},
        {id:"retry_purchase",label:"Retry Purchase Sync",apiName:"retry_purchase",key:"RUN_SUBFLOW",subflowApiName:"GPT_QUICKBOOKS_SYNC_PURCHASES",inputMappings:{purchaseId:{path:"variables.purchaseId"},integrationId:{path:"variables.integrationId"},expenseAccountId:{path:"variables.expenseAccountId"}}},
        {id:"retry_payment",label:"Retry Supplier Payment Sync",apiName:"retry_payment",key:"RUN_SUBFLOW",subflowApiName:"GPT_QUICKBOOKS_SYNC_SUPPLIER_PAYMENTS",inputMappings:{paymentId:{path:"variables.paymentId"},integrationId:{path:"variables.integrationId"},paymentAccountId:{path:"variables.paymentAccountId"}}},
        {id:"retry_credit",label:"Retry Supplier Credit Sync",apiName:"retry_credit",key:"RUN_SUBFLOW",subflowApiName:"GPT_QUICKBOOKS_SYNC_SUPPLIER_CREDITS",inputMappings:{returnId:{path:"variables.returnId"},integrationId:{path:"variables.integrationId"},expenseAccountId:{path:"variables.expenseAccountId"}}},
        assignment("set_retry_target","Set Retry Target","retryTarget","text",{path:"variables.syncType"})
      ]}
  },
  {
    systemKey:"flow:GPT_QUICKBOOKS_TEST_CONNECTION",name:"GPT - QuickBooks - Test Connection",triggerKey:"manual",
    action:{type:"workflow",systemGenerated:true,systemKey:"flow:GPT_QUICKBOOKS_TEST_CONNECTION",scope:"system",capabilityType:"workflow",capabilityKey:"GPT_QUICKBOOKS_TEST_CONNECTION",apiName:"GPT_QUICKBOOKS_TEST_CONNECTION",flowType:"AUTOLAUNCHED",
      inputs:[],outputs:["connected","companyName","companyId"],
      resources:[outputVariable("connected","Boolean"),outputVariable("companyName"),outputVariable("companyId")],
      actions:[
        {id:"test_connection",label:"Get QuickBooks Company Info",apiName:"test_connection",key:"ONE_HTTP_REQUEST",providerKey:"quickbooks",method:"GET",endpoint:"/v3/company/{{realmId}}/companyinfo/{{realmId}}"},
        {id:"connection_ok",label:"Connection Successful?",apiName:"connection_ok",key:"CONDITION",outcomes:[{id:"yes",label:"Connected",condition:{match:"all",conditions:[{field:"steps.test_connection.success",operator:"equals",value:true}]},branch:["set_connected","set_company_name","set_company_id"]}],defaultLabel:"Failed",defaultBranch:["set_not_connected"]},
        assignment("set_connected","Set Connected","connected","boolean",true),assignment("set_company_name","Set Company Name","companyName","text",{path:"steps.test_connection.data.CompanyInfo.CompanyName"}),assignment("set_company_id","Set Company ID","companyId","text",{path:"steps.test_connection.data.CompanyInfo.Id"}),assignment("set_not_connected","Set Not Connected","connected","boolean",false)
      ]}
  }
]);

function titleCase(value = "") {
  return String(value)
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

export function systemWorkflowDefinitions() {
  return [...CUSTOMER_CREDIT_SYSTEM_WORKFLOWS, ...TILL_SYSTEM_WORKFLOWS, ...PLATFORM_SYSTEM_WORKFLOWS, ...PACKAGE_RUNTIME_FLOWS];
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
