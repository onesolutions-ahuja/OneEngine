import { createConnectorActionExecutor } from "./connectorFramework.js";

const REQUIRED_PERMISSION = "communications.send";

async function actorHasPermission(db, req, code) {
  const roleId = req?.user?.roleId || null;
  if (!roleId) return true;
  const result = await db(
    "SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=$1 AND p.code=$2 LIMIT 1",
    [roleId, code]
  );
  return result.rows.length > 0;
}

async function resolveConnection(db, companyId, action) {
  if (action.connectionId) return String(action.connectionId);
  const capability = String(action.capability || action.connectorCapability || "").trim();
  if (!capability) return null;
  const result = await db(
    `SELECT c.id,p.manifest
       FROM integration_connections c
       JOIN package_registry p ON p.package_key=c.connector_package_key AND p.active=TRUE
      WHERE c.company_id=$1 AND c.enabled=TRUE AND c.connector_definition_id IS NOT NULL
      ORDER BY c.fallback_order,c.updated_at DESC`,
    [companyId]
  );
  for (const row of result.rows || []) {
    let manifest=row.manifest||{};
    if (typeof manifest==="string") { try { manifest=JSON.parse(manifest); } catch { manifest={}; } }
    const capabilities=Array.isArray(manifest?.connectorApp?.capabilities) ? manifest.connectorApp.capabilities : [];
    if (capabilities.some((item)=>String(typeof item==="string"?item:item?.key||"")===capability)) return row.id;
  }
  return null;
}

async function sendInApp({ db, companyId, userId, action, req }) {
  const recipient=action.recipientUserId || action.recipient || action.to || userId || req?.user?.id || null;
  const message=String(action.message || action.body || "").trim();
  if (!recipient || !message) return { status:"FAILED", code:"INVALID_ACTION_PAYLOAD", retryable:false };
  await db(
    "INSERT INTO platform_notifications (company_id,user_id,title,message,metadata) VALUES ($1,$2,$3,$4,$5::jsonb)",
    [companyId,recipient,action.title || action.subject || null,message,JSON.stringify({source:"registered_action"})]
  );
  return { status:"SUCCESS" };
}

export async function executeRegisteredAction({ db, action, req, companyId, userId }) {
  if (!db || !companyId) return { status:"UNAVAILABLE", code:"COMPANY_CONTEXT_REQUIRED", retryable:false };
  if (!(await actorHasPermission(db, req, REQUIRED_PERMISSION))) {
    return { status:"UNAVAILABLE", code:"PERMISSION_DENIED", retryable:false };
  }
  const type=String(action?.type || action?.key || "").toUpperCase();
  if (type==="SEND_IN_APP_NOTIFICATION") return sendInApp({db,companyId,userId,action,req});

  const capability=String(action?.capability || action?.connectorCapability || "").trim();
  const operation=String(action?.operation || capability).trim();
  if (!capability || !operation) {
    return { status:"UNAVAILABLE", code:"CONNECTOR_CAPABILITY_REQUIRED", retryable:false };
  }
  const connectionId=await resolveConnection(db,companyId,action);
  if (!connectionId) return { status:"UNAVAILABLE", code:"CONNECTOR_UNAVAILABLE", retryable:false };
  try {
    const execute=createConnectorActionExecutor({db});
    const result=await execute({
      companyId,
      connectionId,
      operation,
      input: action.input && typeof action.input==="object" ? action.input : action,
      actorUserId:userId || req?.user?.id || null,
    });
    return { status:"SUCCESS", result };
  } catch (error) {
    return { status:"FAILED", code:error?.code || "CONNECTOR_ACTION_FAILED", retryable:error?.retryable===true, error:{message:String(error?.message || error).slice(0,500)} };
  }
}
