import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const read=(path)=>readFile(new URL("../"+path,import.meta.url),"utf8");
const files=[
"server/routes/admin.js","server/routes/audit.js","server/routes/dashboardBuilder.js",
"server/services/dashboardExecution.js","server/services/dashboardSubscriptionRuntime.js",
"server/services/jarvis/tools/index.js","server/routes/reports.js"];
test("generic backend authorization has no customer-domain bypass",async()=>{
 for(const path of files)assert.equal((await read(path)).includes("canViewCompanyCustomers"),false,path);
});
test("dashboard and reports remain permission and metadata scoped",async()=>{
 const dashboard=await read("server/services/dashboardExecution.js");
 const reports=await read("server/routes/reports.js");
 assert.match(dashboard,/loadPlatformReportContext/);assert.match(dashboard,/canViewCompanyScope/);assert.match(dashboard,/canAccessStore/);
 assert.match(reports,/loadPlatformReportContext/);assert.match(reports,/resolveAnalyticsPrincipalAccess/);assert.match(reports,/hasSystemPermission/);
});
test("Jarvis tools authorize from declared tool metadata",async()=>{
 const source=await read("server/services/jarvis/tools/index.js");
 assert.match(source,/permissionAny/);assert.match(source,/context\?\.permissions/);assert.equal(/customer/i.test(source),false);
});
