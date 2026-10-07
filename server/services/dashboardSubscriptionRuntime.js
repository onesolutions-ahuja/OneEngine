import { normalizeDashboardSubscription } from "./analyticsManagement.js";
import { createDashboardExecution } from "./dashboardExecution.js";
import { getWorkflowActionDefinition } from "./platformWorkflow.js";
import { resolveReportSubscriptionRecipients } from "./reportSubscriptionDelivery.js";
import { dashboardAccessAtLeast, loadDashboardPrincipalContext, resolveDashboardAccess } from "./dashboardSecurity.js";
import { validateDashboardDefinition } from "./dashboardBuilder.js";
import { assertDashboardSubscriptionCompatible } from "./dashboardSubscriptionCompatibility.js";

async function userCanViewDashboard(db, dashboard, user) {
  const requestUser = { id:user.id, companyId:user.company_id, roleId:user.role_id };
  const principals = await loadDashboardPrincipalContext(db, requestUser);
  const level = await resolveDashboardAccess(db, dashboard, requestUser, principals);
  return dashboardAccessAtLeast(level, "VIEW");
}

async function loadFixedExecutionUser(db, dashboard) {
  if (String(dashboard.run_as_mode || "VIEWER").toUpperCase() !== "FIXED_USER" || !dashboard.run_as_user_id) {
    throw Object.assign(new Error("Dynamic dashboards cannot be delivered by subscription"), { retryable:false });
  }
  const result = await db(
    `SELECT u.id,u.company_id,u.role_id,u.username,u.full_name,u.email,u.active,
            (SELECT us.store_id FROM user_stores us JOIN stores s ON s.id=us.store_id
              WHERE us.user_id=u.id AND us.active=TRUE AND s.company_id=u.company_id AND s.active=TRUE
              ORDER BY s.name,us.store_id LIMIT 1) AS store_id
       FROM users u
      WHERE u.id=$1 AND u.company_id=$2 AND u.active=TRUE
      LIMIT 1`,
    [dashboard.run_as_user_id,dashboard.company_id]
  );
  const user=result.rows[0];
  if(!user)throw Object.assign(new Error("Dashboard fixed run-as user is unavailable"),{retryable:false});
  return user;
}

function dashboardEmailBody(dashboard, run) {
  const lines = [
    `Scheduled dashboard: ${dashboard.name}`,
    `Refreshed: ${new Date().toISOString()}`,
    "",
  ];
  for (const component of run.components || []) {
    const title = (dashboard.components || []).find((item)=>String(item.id)===String(component.id))?.title || component.type || "Component";
    if (component.error) {
      lines.push(`${title}: unavailable (${component.error})`);
      continue;
    }
    const rows = Array.isArray(component?.data?.rows) ? component.data.rows : [];
    if (rows.length) {
      const first = rows[0] || {};
      const preview = Object.entries(first).slice(0,3).map(([key,value])=>`${key}: ${value ?? "—"}`).join(" · ");
      lines.push(`${title}: ${preview || `${rows.length} row(s)`}`);
    } else if (component.type === "text") {
      lines.push(`${title}: ${component?.data?.content || ""}`);
    } else if (component.type === "image") {
      lines.push(`${title}: image component`);
    } else {
      lines.push(`${title}: no tabular result`);
    }
  }
  lines.push("", "Dashboard filters are not applied to subscription email delivery.");
  return lines.join("\n");
}

export async function processDashboardSubscriptionDeliveryJob({
  db,
  payload = {},
  canViewCompanyScope,
  canAccessStore,
  hasPermission,
} = {}) {
  const result = await db(
    `SELECT ds.*,d.name,d.description,d.company_id AS dashboard_company_id,d.created_by,
            d.components,d.filters,d.global_filters,d.responsive_layouts,d.run_as_mode,d.run_as_user_id,
            d.access,d.default_assignments,d.archived_at
       FROM dashboard_subscriptions ds
       JOIN dashboards d ON d.id=ds.dashboard_id AND d.company_id=ds.company_id
      WHERE ds.id=$1 AND ds.company_id=$2 AND ds.active=TRUE
      LIMIT 1`,
    [payload.subscriptionId,payload.companyId || payload._companyId]
  );
  const row=result.rows[0];
  if(!row||row.archived_at)return {status:"SKIPPED",reason:"SUBSCRIPTION_UNAVAILABLE"};

  const subscription=normalizeDashboardSubscription(row.definition||{});
  const dashboard={
    id:row.dashboard_id,company_id:row.company_id,name:row.name,description:row.description,
    created_by:row.created_by,components:row.components||[],filters:row.filters||[],
    global_filters:row.global_filters||[],responsive_layouts:row.responsive_layouts||{},
    run_as_mode:row.run_as_mode,run_as_user_id:row.run_as_user_id,access:row.access||[],
    default_assignments:row.default_assignments||[],
  };

  await assertDashboardSubscriptionCompatible(db,dashboard);

  const executionUser=await loadFixedExecutionUser(db,dashboard);
  const executionReq={user:{
    id:executionUser.id,companyId:executionUser.company_id,roleId:executionUser.role_id,
    username:executionUser.username,full_name:executionUser.full_name,storeId:executionUser.store_id||null,
  }};
  const definition=validateDashboardDefinition({
    name:dashboard.name,description:dashboard.description,components:dashboard.components,
    filters:dashboard.filters,global_filters:dashboard.global_filters,responsive_layouts:dashboard.responsive_layouts,
    run_as_mode:"FIXED_USER",run_as_user_id:dashboard.run_as_user_id,access:dashboard.access,
    default_assignments:dashboard.default_assignments,
  });
  const executor=createDashboardExecution({db,canViewCompanyScope,canAccessStore,hasPermission});
  const run=await executor.runDashboardDefinition(executionReq,definition,{ignoreGlobalFilters:true});

  let recipients=await resolveReportSubscriptionRecipients(db,{
    companyId:row.company_id,principals:subscription.recipientPrincipals,
  });
  if(!recipients.length) {
    const owner=await db("SELECT id,company_id,role_id,username,full_name,email,active FROM users WHERE id=$1 AND company_id=$2 AND active=TRUE",[row.user_id,row.company_id]);
    recipients=owner.rows||[];
  }
  const allowed=[];
  for(const recipient of recipients)if(await userCanViewDashboard(db,dashboard,recipient))allowed.push(recipient);
  if(!allowed.length)throw Object.assign(new Error("No dashboard subscription recipients retain access"),{retryable:false});
  if(allowed.length>500)throw Object.assign(new Error("Dashboard subscription exceeds 500 recipients"),{retryable:false});

  const occurrenceKey=String(payload.occurrence||new Date().toISOString().slice(0,16));
  const body=dashboardEmailBody(dashboard,run);

  for(const recipient of allowed){
    if(!recipient.email)continue;
    const delivery=await db(
      `INSERT INTO dashboard_subscription_deliveries
        (company_id,subscription_id,occurrence_key,recipient_user_id,status)
       VALUES($1,$2,$3,$4,'PENDING')
       ON CONFLICT(subscription_id,occurrence_key,recipient_user_id)
       DO UPDATE SET updated_at=NOW()
       RETURNING id,status`,
      [row.company_id,row.id,occurrenceKey,recipient.id]
    );
    const ledger=delivery.rows[0];
    if(!ledger||ledger.status==="DELIVERED")continue;
    await db("UPDATE dashboard_subscription_deliveries SET status='RUNNING',last_error=NULL,updated_at=NOW() WHERE id=$1",[ledger.id]);
    try{
      const communication = getWorkflowActionDefinition("SEND_COMMUNICATION");
      if (!communication?.executor) throw Object.assign(new Error("Communication runtime is unavailable"), { retryable:false });
      const outcome=await communication.executor({
        db,
        companyId:row.company_id,
        req:{user:{id:executionUser.id,companyId:row.company_id,roleId:executionUser.role_id,storeId:executionUser.store_id||null}},
        action:{key:"SEND_COMMUNICATION",type:"SEND_COMMUNICATION",channel:"EMAIL",recipient:recipient.email,subject:`Scheduled dashboard: ${dashboard.name}`,message:body},
        record:null,
        previousRecord:null,
        object:null,
        workflowVariables:{variables:{},steps:{}},
      });
      if(!["SUCCESS","COMPLETED"].includes(String(outcome?.status || "").toUpperCase())){
        const error=new Error(outcome?.error?.message||outcome?.code||"Dashboard subscription email delivery failed");
        error.retryable=outcome?.retryable===true;
        throw error;
      }
      await db("UPDATE dashboard_subscription_deliveries SET status='DELIVERED',last_error=NULL,delivered_at=NOW(),updated_at=NOW() WHERE id=$1",[ledger.id]);
    }catch(error){
      await db("UPDATE dashboard_subscription_deliveries SET status='FAILED',last_error=$2,updated_at=NOW() WHERE id=$1",[ledger.id,String(error?.message||error).slice(0,1000)]);
      throw error;
    }
  }

  await db("UPDATE dashboard_subscriptions SET last_run_at=NOW(),last_delivery_at=NOW(),last_status='DELIVERED',updated_at=NOW() WHERE id=$1",[row.id]);
  return {status:"DELIVERED",recipientCount:allowed.length,componentCount:(run.components||[]).length};
}
