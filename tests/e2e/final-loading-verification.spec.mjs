import { test, expect } from "@playwright/test";
import { loginIfConfigured, watchRuntimeFailures } from "./helpers.mjs";
const ROUTES=[["dashboard","dashboard"],["till","till"],["sales","sales"],["products","products"],["categories","categories"],["global-products","global-products"],["purchases","purchases"],["suppliers","suppliers"],["customers","customers"],["gift-cards","gift-cards"],["employees","employees"],["stores","stores"],["supplier-returns","supplier-returns"],["online-orders","online-orders"],["own-delivery","own-delivery"],["reports","reports"],["custom-reports","custom-reports"],["integrations","integrations"],["accounting","accounting"],["google-connect","google-connect"],["kiosk","kiosk"],["kiosk-display","kiosk-display"],["kiosk-devices","kiosk-devices"],["audit-log","audit-log"],["profile","profile"],["licensing","licensing"],["app-releases","app-releases"],["workspace","workspace"],["settings/company","settings","company"],["developer/objects","developer","objects"],["developer/workflow-builder","developer","workflow-builder"],["developer/gptbuilder","developer","gptbuilder"],["developer/gptappbuilder","developer","gptappbuilder"],["developer/canvas-ux-test","developer","canvas-ux-test"],["developer/approval-builder","developer","approval-builder"],["developer/gpt-page-builder","developer","gpt-page-builder"],["developer/page-builder","developer","page-builder"],["developer/dashboard-builder","developer","dashboard-builder"],["developer/report-types","developer","report-types"],["developer/report-builder","developer","report-builder"],["developer/workflow-runs","developer","workflow-runs"],["developer/work-items","developer","work-items"],["developer/platform-apps","developer","platform-apps"],["developer/deployments","developer","deployments"],["developer/notifications","developer","notifications"],["developer/value-sets","developer","value-sets"],["developer/debug","developer","debug"]];
const FATAL=/Resolving client context|Checking OneEngine permissions|OneEngine service is unavailable|This app is not available in this workspace|Application error|Something went wrong|Unable to load this page|This screen could not be displayed/i;
const LOADING=/Loading(?:\s+[A-Za-z &]+)?…|Loading\.\.\.|Please wait/i;
test.beforeAll(()=>{if(!(process.env.ONEPOS_E2E_USERNAME&&process.env.ONEPOS_E2E_PASSWORD))throw new Error("Final loading verification requires authenticated QA credentials; skipping is not allowed.")});
async function settle(page,route,app,section=""){const m=page.locator("[data-oneengine-route]").first();await expect(m,route+" route identity").toHaveAttribute("data-oneengine-route",app,{timeout:10000});if(section)await expect(m,route+" section identity").toHaveAttribute("data-oneengine-section",section,{timeout:10000});await page.waitForTimeout(1000);for(let i=0;i<2;i++){const b=await page.locator("body").innerText();expect(FATAL.test(b),route+" fatal").toBe(false);expect(LOADING.test(b),route+" stuck loading").toBe(false);if(!i)await page.waitForTimeout(750)}}
async function authFetch(page,path){return page.evaluate(async({path,base})=>{const t=sessionStorage.getItem("onepos_token")||localStorage.getItem("onepos_token");const r=await fetch(base.replace(/\/$/,"")+path,{headers:t?{Authorization:"Bearer "+t}:{}});let body=null;try{body=await r.json()}catch{}return{ok:r.ok,status:r.status,body}}, {path,base:process.env.ONEPOS_E2E_API_BASE_URL||"https://oneengine-6gas.onrender.com"})}

const DEVELOPER_ROUTES=[
  ["developer/objects","objects"],
  ["developer/workflow-builder","gptbuilder"],
  ["developer/builder-2","gptbuilder"],
  ["developer/gptbuilder","gptbuilder"],
  ["developer/gptappbuilder","gptappbuilder"],
  ["developer/canvas-ux-test","canvas-ux-test"],
  ["developer/approval-builder","approval-builder"],
  ["developer/gpt-page-builder","gpt-page-builder"],
  ["developer/page-builder","page-builder"],
  ["developer/dashboard-builder","dashboard-builder"],
  ["developer/report-types","report-types"],
  ["developer/report-builder","report-builder"],
  ["developer/workflow-runs","workflow-runs"],
  ["developer/work-items","work-items"],
  ["developer/platform-apps","gptappbuilder"],
  ["developer/deployments","deployments"],
  ["developer/notifications","notifications"],
  ["developer/value-sets","value-sets"],
  ["developer/debug","debug"],
];
for(const [route,section] of DEVELOPER_ROUTES){
  test("developer direct route: "+route,async({page,baseURL})=>{
    const failures=watchRuntimeFailures(page);
    expect(await loginIfConfigured(page),"authenticated login must run").toBe(true);
    failures.length=0;
    await page.goto(new URL(route,baseURL).href,{waitUntil:"domcontentloaded",timeout:30000});
    const marker=page.locator("[data-oneengine-route]").first();
    await expect(marker,route+" route identity").toHaveAttribute("data-oneengine-route","developer",{timeout:10000});
    await expect(marker,route+" section identity").toHaveAttribute("data-oneengine-section",section,{timeout:10000});
    await page.waitForTimeout(1000);
    const body=await page.locator("body").innerText();
    expect(FATAL.test(body),route+" fatal").toBe(false);
    await expect(page.locator(".route-loading"),route+" route shell loading").toHaveCount(0);
    expect(failures,route+" runtime failures").toEqual([]);
  });
}

test("complete authenticated routable-surface loading verification",async({page,baseURL})=>{const rf=watchRuntimeFailures(page),ctx=[],api=[];let loginServerTotal=null;page.on("response",r=>{const u=r.url();if(u.includes("/api/auth/login")){const m=/(?:^|,\s*)total;dur=([0-9.]+)/i.exec(r.headers()["server-timing"]||"");if(m)loginServerTotal=Number(m[1])}if(/\/api\/(auth\/bootstrap|auth\/me\/(stores|permissions)|platform\/developer\/acting-company)/.test(u))ctx.push(u);if(u.includes("/api/")&&r.status()>=400)api.push({status:r.status(),url:u})});expect(await loginIfConfigured(page),"authenticated login must run").toBe(true);ctx.length=0;api.length=0;rf.length=0;const timings=[];for(const [route,app,section=""] of ROUTES){const s=Date.now();await page.goto(new URL(route,baseURL).href,{waitUntil:"domcontentloaded",timeout:30000});await settle(page,route,app,section);timings.push({route,ms:Date.now()-s})}await page.goto(new URL("settings/company",baseURL).href,{waitUntil:"domcontentloaded"});await expect(page.locator(".settings-nav-item").first()).toBeVisible({timeout:10000});const settings=await page.locator(".settings-nav-item").evaluateAll(ns=>[...new Set(ns.map(n=>n.textContent?.trim()).filter(Boolean))]);for(const label of settings){await page.locator(".settings-nav-item").filter({hasText:label}).first().click();await expect(page.locator('.settings-page[data-oneengine-route="settings"]').first()).toBeVisible();await page.waitForTimeout(1000);const b=await page.locator("body").innerText();expect(FATAL.test(b),"settings "+label+" fatal").toBe(false);expect(LOADING.test(b),"settings "+label+" stuck").toBe(false)}const obj=await authFetch(page,"/api/platform/objects");expect(obj.ok,"object catalogue HTTP "+obj.status).toBe(true);const keys=[...new Set((Array.isArray(obj.body?.data)?obj.body.data:[]).map(r=>r.object_key||r.api_name||r.key).filter(Boolean))];for(const key of keys){const route="workspace/"+encodeURIComponent(key);await page.goto(new URL(route,baseURL).href,{waitUntil:"domcontentloaded",timeout:30000});const m=page.locator('[data-oneengine-route="workspace"]').first();await expect(m).toHaveAttribute("data-oneengine-object",String(key),{timeout:10000});await page.waitForTimeout(1000);const b=await page.locator("body").innerText();expect(FATAL.test(b),route+" fatal").toBe(false);expect(LOADING.test(b),route+" stuck").toBe(false)}const nav=await authFetch(page,"/api/platform/runtime/navigation-targets");expect(nav.ok,"navigation targets HTTP "+nav.status).toBe(true);const pages=Array.isArray(nav.body?.data?.customPages)?nav.body.data.customPages:[];for(const row of pages){const key=row.pageKey||row.page_key||row.key;if(!key)continue;const route="workspace/pages/"+encodeURIComponent(key);await page.goto(new URL(route,baseURL).href,{waitUntil:"domcontentloaded",timeout:30000});const m=page.locator('[data-oneengine-route="custom-page-runtime"]').first();await expect(m).toHaveAttribute("data-oneengine-page",String(key),{timeout:10000});await page.waitForTimeout(1000);const b=await page.locator("body").innerText();expect(FATAL.test(b),route+" fatal").toBe(false);expect(LOADING.test(b),route+" stuck").toBe(false)}expect(ctx,"no repeated context bootstrap").toEqual([]);expect(api,"no API 4xx/5xx").toEqual([]);expect(rf,"no runtime failures").toEqual([]);expect(timings.filter(x=>x.ms>7000),"no static route >7s").toEqual([]);expect(loginServerTotal).not.toBeNull();expect(loginServerTotal).toBeLessThanOrEqual(1500)});
test("public special routes resolve to intended runtime",async({page,baseURL})=>{for(const [route,app] of [["customer-display","customer-display"],["kiosk-runtime","kiosk-runtime"]]){const f=watchRuntimeFailures(page);await page.goto(new URL(route,baseURL).href,{waitUntil:"domcontentloaded",timeout:30000});await expect(page.locator("[data-oneengine-route]").first()).toHaveAttribute("data-oneengine-route",app,{timeout:10000});await page.waitForTimeout(1500);expect(FATAL.test(await page.locator("body").innerText()),route+" fatal").toBe(false);expect(f,route+" runtime failures").toEqual([])}});