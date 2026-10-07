import { test, expect } from "@playwright/test";
import { loginIfConfigured, watchRuntimeFailures } from "./helpers.mjs";

const ROUTES=[
  ["dashboard","dashboard"],["till","till"],["sales","sales"],["products","products"],
  ["categories","categories"],["global-products","global-products"],["purchases","purchases"],
  ["suppliers","suppliers"],["customers","customers"],["gift-cards","gift-cards"],
  ["employees","employees"],["stores","stores"],["supplier-returns","supplier-returns"],
  ["online-orders","online-orders"],["own-delivery","own-delivery"],["reports","reports"],
  ["custom-reports","custom-reports"],["integrations","integrations"],["accounting","accounting"],
  ["google-connect","google-connect"],["kiosk-display","kiosk-display"],["kiosk-devices","kiosk-devices"],
  ["audit-log","audit-log"],["profile","profile"],["licensing","licensing"],
  ["app-releases","app-releases"],["workspace","workspace"],["settings/company","settings","company"],
];

const FATAL=/Resolving client context|Checking OneEngine permissions|OneEngine service is unavailable|This app is not available in this workspace|Application error|Something went wrong|Unable to load this page|This screen could not be displayed/i;

test.beforeAll(()=>{
  if(!(process.env.ONEPOS_E2E_USERNAME&&process.env.ONEPOS_E2E_PASSWORD)){
    throw new Error("Final loading verification requires authenticated QA credentials; skipping is not allowed.");
  }
});

async function settle(page,route,app,section=""){
  const marker=page.locator("[data-oneengine-route]").first();
  await expect(marker,route+" route identity").toHaveAttribute("data-oneengine-route",app,{timeout:10000});
  if(section) await expect(marker,route+" section identity").toHaveAttribute("data-oneengine-section",section,{timeout:10000});
  await page.waitForTimeout(750);
  const body=await page.locator("body").innerText();
  expect(FATAL.test(body),route+" fatal").toBe(false);
  await expect(page.locator(".route-loading"),route+" route shell loading").toHaveCount(0);
}

async function authFetch(page,path){
  return page.evaluate(async({path,base})=>{
    const token=sessionStorage.getItem("onepos_token")||localStorage.getItem("onepos_token");
    const response=await fetch(base.replace(/\/$/,"")+path,{headers:token?{Authorization:"Bearer "+token}:{}});
    let body=null;
    try{ body=await response.json(); }catch{}
    return {ok:response.ok,status:response.status,body};
  },{path,base:process.env.ONEPOS_E2E_API_BASE_URL||"https://oneengine-6gas.onrender.com"});
}

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
    await settle(page,route,"developer",section);
    expect(failures,route+" runtime failures").toEqual([]);
  });
}

for(const [route,app,section=""] of ROUTES){
  test("authenticated route surface: "+route,async({page,baseURL})=>{
    const failures=watchRuntimeFailures(page);
    const api=[];
    const context=[];
    page.on("response",(response)=>{
      const url=response.url();
      if(/\/api\/(auth\/bootstrap|auth\/me\/(stores|permissions)|platform\/developer\/acting-company)/.test(url)) context.push(url);
      if(url.includes("/api/")&&response.status()>=400) api.push({status:response.status(),url});
    });
    expect(await loginIfConfigured(page),"authenticated login must run").toBe(true);
    failures.length=0;
    api.length=0;
    context.length=0;
    const started=Date.now();
    await page.goto(new URL(route,baseURL).href,{waitUntil:"domcontentloaded",timeout:30000});
    await settle(page,route,app,section);
    const elapsed=Date.now()-started;
    expect(elapsed,route+" must load within 7 seconds").toBeLessThanOrEqual(7000);
    expect(context,route+" must not repeat context bootstrap").toEqual([]);
    expect(api,route+" API failures").toEqual([]);
    expect(failures,route+" runtime failures").toEqual([]);
  });
}

test("settings catalogue and every visible settings section load",async({page,baseURL})=>{
  test.setTimeout(120000);
  const failures=watchRuntimeFailures(page);
  expect(await loginIfConfigured(page),"authenticated login must run").toBe(true);
  failures.length=0;
  await page.goto(new URL("settings/company",baseURL).href,{waitUntil:"domcontentloaded",timeout:30000});
  await settle(page,"settings/company","settings","company");
  const items=page.locator(".settings-nav-item");
  await expect(items.first(),"Settings catalogue must render navigation").toBeVisible({timeout:15000});
  const labels=await items.evaluateAll(nodes=>[...new Set(nodes.map(node=>node.textContent?.trim()).filter(Boolean))]);
  expect(labels.length,"Settings catalogue must expose at least one visible section").toBeGreaterThan(0);
  for(const label of labels){
    await page.locator(".settings-nav-item").filter({hasText:label}).first().click();
    await expect(page.locator('.settings-page[data-oneengine-route="settings"]').first()).toBeVisible({timeout:10000});
    await page.waitForTimeout(500);
    const body=await page.locator("body").innerText();
    expect(FATAL.test(body),"settings "+label+" fatal").toBe(false);
    await expect(page.locator(".route-loading"),"settings "+label+" route shell loading").toHaveCount(0);
  }
  expect(failures,"settings runtime failures").toEqual([]);
});

test("workspace object routes load for every metadata object",async({page,baseURL})=>{
  test.setTimeout(180000);
  const failures=watchRuntimeFailures(page);
  expect(await loginIfConfigured(page),"authenticated login must run").toBe(true);
  failures.length=0;
  const objects=await authFetch(page,"/api/platform/objects");
  expect(objects.ok,"object catalogue HTTP "+objects.status).toBe(true);
  const keys=[...new Set((Array.isArray(objects.body?.data)?objects.body.data:[]).map(row=>row.object_key||row.api_name||row.key).filter(Boolean))];
  for(const key of keys){
    const route="workspace/"+encodeURIComponent(key);
    await page.goto(new URL(route,baseURL).href,{waitUntil:"domcontentloaded",timeout:30000});
    const marker=page.locator('[data-oneengine-route="workspace"]').first();
    await expect(marker,route+" route identity").toHaveAttribute("data-oneengine-object",String(key),{timeout:10000});
    await page.waitForTimeout(300);
    const body=await page.locator("body").innerText();
    expect(FATAL.test(body),route+" fatal").toBe(false);
    await expect(page.locator(".route-loading"),route+" route shell loading").toHaveCount(0);
  }
  expect(failures,"workspace object runtime failures").toEqual([]);
});

test("custom page runtime routes load for every metadata page",async({page,baseURL})=>{
  test.setTimeout(180000);
  const failures=watchRuntimeFailures(page);
  expect(await loginIfConfigured(page),"authenticated login must run").toBe(true);
  failures.length=0;
  const navigation=await authFetch(page,"/api/platform/runtime/navigation-targets");
  expect(navigation.ok,"navigation targets HTTP "+navigation.status).toBe(true);
  const pages=Array.isArray(navigation.body?.data?.customPages)?navigation.body.data.customPages:[];
  for(const row of pages){
    const key=row.pageKey||row.page_key||row.key;
    if(!key) continue;
    const route="workspace/pages/"+encodeURIComponent(key);
    await page.goto(new URL(route,baseURL).href,{waitUntil:"domcontentloaded",timeout:30000});
    const marker=page.locator('[data-oneengine-route="custom-page-runtime"]').first();
    await expect(marker,route+" page identity").toHaveAttribute("data-oneengine-page",String(key),{timeout:10000});
    await page.waitForTimeout(300);
    const body=await page.locator("body").innerText();
    expect(FATAL.test(body),route+" fatal").toBe(false);
    await expect(page.locator(".route-loading"),route+" route shell loading").toHaveCount(0);
  }
  expect(failures,"custom page runtime failures").toEqual([]);
});

test("login server timing stays within target",async({page})=>{
  const username=process.env.ONEPOS_E2E_USERNAME||"";
  const password=process.env.ONEPOS_E2E_PASSWORD||"";
  const apiBase=String(process.env.ONEPOS_E2E_API_BASE_URL||"https://oneengine-6gas.onrender.com").replace(/\/$/,"");
  const response=await page.request.post(apiBase+"/api/auth/login",{data:{email:username,password}});
  expect(response.ok(),"login HTTP "+response.status()).toBe(true);
  const match=/(?:^|,\s*)total;dur=([0-9.]+)/i.exec(response.headers()["server-timing"]||"");
  const loginServerTotal=match?Number(match[1]):Number.NaN;
  expect(Number.isFinite(loginServerTotal),"login server timing header").toBe(true);
  expect(loginServerTotal,"login server time <= 1.5s").toBeLessThanOrEqual(1500);
});

test("public special routes resolve to intended runtime",async({page,baseURL})=>{
  for(const [route,app] of [["customer-display","customer-display"]]){
    const failures=watchRuntimeFailures(page);
    await page.goto(new URL(route,baseURL).href,{waitUntil:"domcontentloaded",timeout:30000});
    await expect(page.locator("[data-oneengine-route]").first()).toHaveAttribute("data-oneengine-route",app,{timeout:10000});
    await page.waitForTimeout(1000);
    expect(FATAL.test(await page.locator("body").innerText()),route+" fatal").toBe(false);
    expect(failures,route+" runtime failures").toEqual([]);
  }
});
