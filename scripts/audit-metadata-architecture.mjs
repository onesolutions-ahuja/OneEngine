import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const roots=["server","src"].map((x)=>path.join(ROOT,x));
const walk=(dir)=>fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).flatMap((e)=>{const full=path.join(dir,e.name);return e.isDirectory()?walk(full):/\.(?:js|jsx|mjs|ts|tsx)$/.test(e.name)?[full]:[];}):[];
const rel=(file)=>path.relative(ROOT,file).replaceAll("\\","/");
const files=roots.flatMap(walk).filter((file)=>{
  const name=rel(file);
  if (/(?:^|\/)(?:test|tests|scripts|migrations)(?:\/|$)/.test(name) || name.endsWith(".test.js") || name.endsWith(".test.mjs")) return false;
  if (name.startsWith("server/src/marketing/")) return false;
  return true;
});
const businessTables=["sales","sale_items","payments","payment_attempts","payment_methods","refunds","customers","customer_ledger","customer_loyalty_ledger","gift_card_ledger","gift_cards","layaways","products","product_variants","product_bundles","product_store_pricing","product_supplier_costs","inventory_ledger","inventory_movements","inventory_levels","inventory_batches","suppliers","purchases","purchase_items","purchase_ledger","supplier_invoices","supplier_payments","online_orders","online_order_items","online_order_events"];
const businessObjectKeys=["sale","sale_item","payment","refund","customer","gift_card","layaway","product","product_variant","inventory","inventory_movement","supplier","purchase","purchase_receipt","online_order"];
const businessApiRoots=["sales","products","customers","suppliers","purchases","inventory","returns","exchanges","payments","payment","self-checkout","kiosk","online-orders","online_orders","ean","global-product","global_product","gift","loyalty","layaway","invoice","secure-invoice"];
const businessBindingKeys=["initialObjectKey","objectKey","object_key","dataSource","data_source","sourceObject","source_object","entityType","entity_type"];
const businessFieldTokens=["sale_id","customer_id","product_id","supplier_id","purchase_id","payment_id","refund_id","till_id","invoice_id","receipt_number","sale_number"];
const providerTokens=["paypal","quickbooks","uber_eats","deliveroo","just_eat","shopify","woocommerce","magento","prestashop"];
const findings=[];
for(const file of files){
  const name=rel(file);
  const text=fs.readFileSync(file,"utf8");
  const schemaDefinition=name.startsWith("server/database/");
  if(!schemaDefinition) for(const table of businessTables){const rx=new RegExp("\\b(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM|FROM|JOIN)\\s+(?:[a-zA-Z_]+\\.)?"+table+"\\b","i");if(rx.test(text))findings.push({rule:"DIRECT_BUSINESS_SQL",file:name,table});}
  if(name.startsWith("src/")){
    for(const key of businessObjectKeys){const rx=new RegExp("/api/platform/(?:runtime/)?objects/"+key+"(?:/|[\\\'\\\"?])","i");if(rx.test(text))findings.push({rule:"HARDCODED_BUSINESS_OBJECT_ROUTE",file:name,objectKey:key});}
    for(const root of businessApiRoots){const rx=new RegExp("/api/"+root+"(?:/|[\\\'\\\"?])","i");if(rx.test(text))findings.push({rule:"HARDCODED_BUSINESS_API_ROUTE",file:name,apiRoot:root});}
    if(/\/api\/settings(?:\/|[\'\"?>])/.test(text))findings.push({rule:"HARDCODED_SETTINGS_API",file:name});
    if(/\bpatchCompanySettings\b|\bpatchSettings\b/.test(text))findings.push({rule:"DIRECT_SETTINGS_FIELD_WIRING",file:name});
  }
  if(!schemaDefinition && /\bCALL_FUNCTION\b|\bRUN_ASSISTANT_SUBFLOW\b/.test(text))findings.push({rule:"LEGACY_EXECUTOR_REFERENCE",file:name});
  if(!schemaDefinition){
    const businessSymbol=/\b(?:function|class|const|let|var)\s+[A-Za-z_$][\w$]*(?:Sale|Customer|Product|Purchase|Supplier|Invoice|Receipt|Till|Kiosk|Loyalty|Refund|Payment|OnlineOrder)[A-Za-z0-9_$]*/g;
    for(const match of code.matchAll(businessSymbol)) findings.push({rule:"BUSINESS_SPECIFIC_EXECUTABLE_SYMBOL",file:name,token:match[0].replace(/^(?:function|class|const|let|var)\s+/,"")});
  }

  if(/dataSource\s*:\s*["\']sales["\']|dataSource\s*===?\s*["\']sales["\']/i.test(text))findings.push({rule:"HARDCODED_SALES_DATASOURCE",file:name});
  if(/\bDASHBOARD_SALES_FIELDS\b|\bbuildCustomSalesQuery\b/.test(text))findings.push({rule:"LEGACY_SALES_RUNTIME_SYMBOL",file:name});
  const code=text.replace(/\/\*[\s\S]*?\*\//g," ").replace(/(^|[^:])\/\/.*$/gm,"$1 ");
  if(name.startsWith("src/")){
    for(const key of businessBindingKeys){for(const objectKey of businessObjectKeys){const rx=new RegExp("\\b"+key+"\\b\\s*(?:=|:)\\s*[\\\'\\\"]"+objectKey+"[\\\'\\\"]","i");if(rx.test(code))findings.push({rule:"HARDCODED_BUSINESS_BINDING",file:name,token:key+":"+objectKey});}}
    for(const token of businessFieldTokens){const escaped=token.replace(/[.*+?^$()|[\]\\]/g,"\\$&");const rx=new RegExp("[\\\'\\\"]"+escaped+"[\\\'\\\"]\\s*(?:[:,]|\\])|\\b"+escaped+"\\b\\s*[:=]","i");if(rx.test(code))findings.push({rule:"HARDCODED_BUSINESS_FIELD_MAPPING",file:name,token});}
  }
  if(!schemaDefinition) for(const token of providerTokens){const escaped=token.replace(/[.*+?^$()|[\]\\]/g,"\\$&");const rx=new RegExp("([\\\'\\\"])"+".*?\\b"+escaped+"\\b.*?\\1","i");if(rx.test(code))findings.push({rule:"HARDCODED_PROVIDER_LITERAL",file:name,token});}
}
const unique=[...new Map(findings.map((x)=>[JSON.stringify(x),x])).values()].sort((a,b)=>a.file.localeCompare(b.file)||a.rule.localeCompare(b.rule)||String(a.token||a.table||"").localeCompare(String(b.token||b.table||"")));
const report={generatedAt:new Date().toISOString(),scannedFiles:files.length,violations:unique.length,exemptionCount:0,findings:unique};
fs.mkdirSync(path.join(ROOT,"artifacts"),{recursive:true});
fs.writeFileSync(path.join(ROOT,"artifacts","metadata-architecture-audit.json"),JSON.stringify(report,null,2)+"\n");
if(unique.length){console.error("Metadata architecture audit failed with "+unique.length+" violation(s); zero business-runtime exemptions are permitted.");for(const item of unique)console.error("- "+item.rule+": "+item.file+(item.table?" ["+item.table+"]":"")+(item.objectKey?" ["+item.objectKey+"]":"")+(item.apiRoot?" ["+item.apiRoot+"]":"")+(item.token?" ["+item.token+"]":""));process.exit(1);}
console.log("Metadata architecture audit passed across "+report.scannedFiles+" runtime source files with zero exemptions.");
