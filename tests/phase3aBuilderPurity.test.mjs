import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const read=(path)=>readFile(new URL("../"+path,import.meta.url),"utf8");

const BUILDER_FILES=[
  "src/pages/settings/OneBuilder.jsx",
  "src/pages/settings/ObjectsSettingsPane.jsx",
  "src/pages/settings/Platform/ActionWorkflowPicker.jsx",
  "src/pages/settings/Platform/PageBuilder.jsx",
  "src/pages/settings/Platform/CustomPageBuilder.jsx",
  "src/pages/settings/Platform/componentRegistry.js",
  "src/pages/developer/OneDeveloperPage.jsx",
  "src/pages/developer/GPTPageBuilder.jsx",
  "src/pages/developer/gptappbuilder/GPTAppBuilderPage.jsx",
  "src/pages/developer/gptappbuilder/platformMetadataResolver.js",
  "src/pages/developer/gptbuilder/GPTBuilderPage.jsx",
  "src/pages/developer/gptbuilder/GPTBuilderAction.jsx",
  "src/pages/developer/gptbuilder/GPTBuilderStartOptions.jsx",
  "src/pages/dashboard/DashboardBuilder.jsx",
  "src/components/dashboard/DashboardComponentProperties.jsx",
  "src/components/dashboard/platformDashboard.js",
  "src/pages/reports/CustomReportsAdmin.jsx",
  "server/services/dashboardBuilder.js"
];

test("Phase 3A retires the legacy workflow builder",async()=>{
  await assert.rejects(access(new URL("../src/pages/settings/Platform/WorkflowAdmin.jsx",import.meta.url)));
  for(const path of ["src/pages/settings/OneBuilder.jsx","src/pages/settings/ObjectsSettingsPane.jsx","src/pages/settings/Platform/ActionWorkflowPicker.jsx"]){
    const source=await read(path);
    assert.equal(source.includes("WorkflowAdmin"),false,path);
  }
  const oneBuilder=await read("src/pages/settings/OneBuilder.jsx");
  assert.match(oneBuilder,/GPTBuilderPage/);
});

test("Phase 3A builders contain no fixed business object/provider identifiers",async()=>{
  const forbidden=[
    /["'`]sales["'`]/i,/["'`]sale["'`]/i,/["'`]customer(?:s)?["'`]/i,
    /["'`]product(?:s)?["'`]/i,/["'`]supplier(?:s)?["'`]/i,/["'`]purchase(?:s)?["'`]/i,
    /["'`]inventory["'`]/i,/["'`](?:shopify|quickbooks|paypal|dojo|sumup|uber|deliveroo|whatsapp|brevo|mailjet)["'`]/i,
    /\bcustomer_id\b/i,/\bproduct_id\b/i,/\bsupplier_id\b/i,
  ];
  for(const path of BUILDER_FILES){
    const source=await read(path);
    for(const pattern of forbidden) assert.equal(pattern.test(source),false,`${path} contains ${pattern}`);
  }
});

test("Phase 3A Dashboard Builder obtains data-source fields from report metadata",async()=>{
  const props=await read("src/components/dashboard/DashboardComponentProperties.jsx");
  const builder=await read("src/pages/dashboard/DashboardBuilder.jsx");
  const server=await read("server/services/dashboardBuilder.js");
  assert.match(props,/response\.data\?\.sources/);
  assert.match(props,/selectedSource/);
  assert.equal(props.includes("DASHBOARD_SALES_FIELDS"),false);
  assert.equal(props.includes("DATE_FILTER_FIELDS"),false);
  assert.equal(builder.includes("DASHBOARD_SALES_FIELDS"),false);
  assert.equal(server.includes('dataSource: "sales"'),false);
  assert.equal(server.includes("report_total_sales"),false);
});

test("Phase 3A Report Builder chooses sources from server metadata",async()=>{
  const source=await read("src/pages/reports/CustomReportsAdmin.jsx");
  assert.match(source,/metadata\.sources/);
  assert.match(source,/\(metadata\.sources\|\|\[\]\)\.map/);
  assert.equal(source.includes('<option value="sales">'),false);
  assert.equal(source.includes('fields: ["date", "net_sales", "transactions"]'),false);
});

test("Phase 3A canonical GPT Builder exposes only platform-generic flow categories",async()=>{
  const source=await read("src/pages/developer/gptbuilder/GPTBuilderPage.jsx");
  for(const token of ["user_provisioning","contact_request","cart_async","recommendation_strategy","cms_orchestration","individual_object_linking","identity_registration"]){
    assert.equal(source.includes(token),false,token);
  }
  for(const token of ["record","screen","schedule","platform_event","autolaunched"]){
    assert.match(source,new RegExp(`key: ['"]${token}['"]`));
  }
});
