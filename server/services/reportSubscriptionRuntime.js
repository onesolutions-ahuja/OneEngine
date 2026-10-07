import { normalizeSubscription, subscriptionConditionMatches } from "./analyticsManagement.js";
import { resolveAnalyticsPrincipalAccess } from "./analyticsSecurity.js";
import { executeAnalyticsDefinition } from "./reportExecution.js";
import { buildPlatformObjectQuery, validatePlatformReportDefinition } from "./reportableSources.js";
import { loadPlatformReportContext } from "./platformReportSecurity.js";
import { normalizeReportType } from "./reportTypeDefinition.js";
import { getWorkflowActionDefinition } from "./platformWorkflow.js";
import { buildDetailsCsv, buildFormattedXlsx } from "./reportExport.js";
import {
  filterReportSubscriptionRecipientsByAccess,
  loadReportSubscriptionExecutionUser,
  resolveReportSubscriptionRecipients,
} from "./reportSubscriptionDelivery.js";
import { normalizeAdvancedReportDefinition } from "./reportAnalyticsDefinition.js";

async function userHasPermission(db, user, permission) {
  if (!user?.role_id && !user?.roleId) return false;
  const roleId = user.role_id || user.roleId;
  const result = await db(
    `SELECT 1 FROM role_permissions rp
      JOIN permissions p ON p.id=rp.permission_id
      WHERE rp.role_id=$1 AND p.code=$2 LIMIT 1`,
    [roleId, permission]
  );
  return result.rows.length > 0;
}



async function resolveReportTypeContext(db, req, reportTypeId) {
  if (!reportTypeId) return null;
  const result = await db("SELECT * FROM custom_report_types WHERE id=$1 AND company_id=$2 AND active=TRUE", [reportTypeId, req.user.companyId]);
  const row = result.rows[0];
  if (!row) throw new Error("Custom report type is unavailable");
  const definition = normalizeReportType({ ...(row.definition || {}), id: row.id });
  const status = String(definition.experience?.status || definition.status || row.status || "IN_DEVELOPMENT").toUpperCase();
  if (status !== "DEPLOYED" && !(await userHasPermission(db, { role_id:req.user.roleId }, "platform.metadata.manage"))) {
    throw new Error("Custom report type is not deployed");
  }
  const context = await loadPlatformReportContext(db, req, definition.primaryObjectId, definition.relationships);
  const relationshipConfig = new Map((definition.relationships || []).map((entry) => [String(entry.relationshipId), entry]));
  const relationships = (context.relationships || [])
    .filter((relationship) => relationshipConfig.has(String(relationship.id)))
    .map((relationship) => ({ ...relationship, reportJoinType: relationshipConfig.get(String(relationship.id)).joinType }));
  const experience = definition.experience || {};
  const layoutMap = new Map((experience.fieldLayout || []).map((entry) => [String(entry.fieldKey), entry]));
  const visibilityMap = new Map((definition.fieldVisibility || []).map((entry) => [String(entry.fieldKey), entry]));
  const fields = (context.fields || []).filter((field) => {
    const layout = layoutMap.get(String(field.api_name));
    const visibility = visibilityMap.get(String(field.api_name));
    return layout?.visible !== false && visibility?.visible !== false;
  });
  return { definition, context: { ...context, fields, relationships } };
}

async function executeSavedReport(db, report, executionUser) {
  const definition = normalizeAdvancedReportDefinition({ ...(report.definition || {}), dataSource:"platform_object" });
  if (definition.format === "joined") throw new Error("Joined reports do not support subscriptions");
  if (definition.historicalTrend?.enabled === true) throw new Error("Historical trend reports do not support subscriptions");
  const storeResult = await db(
    `SELECT us.store_id
       FROM user_stores us JOIN stores s ON s.id=us.store_id
      WHERE us.user_id=$1 AND us.active=TRUE AND s.company_id=$2 AND s.active=TRUE
      ORDER BY s.name,us.store_id LIMIT 1`,
    [executionUser.id, executionUser.company_id]
  );
  const req = { user: {
    id: executionUser.id,
    companyId: executionUser.company_id,
    roleId: executionUser.role_id,
    username: executionUser.username,
    full_name: executionUser.full_name,
    storeId: storeResult.rows?.[0]?.store_id || null,
  } };

  const executeBase = async (baseDefinition) => {
    const reportType = await resolveReportTypeContext(db, req, baseDefinition.reportTypeId || baseDefinition.report_type_id || null);
    const context = reportType?.context || await loadPlatformReportContext(db, req, baseDefinition.objectId);
    const validated = validatePlatformReportDefinition(
      { ...baseDefinition, dataSource:"platform_object" },
      context.object,
      context.fields,
      context.relationships
    );
    const built = buildPlatformObjectQuery(validated, context.object, context.fields, executionUser.company_id, 1000, {
      storeId: req.user.storeId,
      visibilitySql: context.visibilitySql,
      visibilityParams: context.visibilityParams,
    }, context.relationships);
    const result = await db(built.sql, built.params);
    return {
      columns: validated.fields.map((key) => {
        const direct = context.fields.find((field) => field.api_name === key);
        const related = (context.relationships || []).flatMap((relationship) =>
          (relationship.fields || []).map((field) => ({
            ...field,
            key: `${relationship.relationship_key}.${field.api_name}`,
          }))
        ).find((field) => field.key === key);
        return { key, label: direct?.label || related?.label || key };
      }),
      rows: result.rows,
    };
  };
  return executeAnalyticsDefinition(definition, executeBase);
}

async function canUserAccessReport(db, report, user) {
  if (!user?.id || String(user.company_id) !== String(report.company_id)) return false;
  if (await userHasPermission(db, user, "reports.custom.manage")) return true;
  if (String(report.created_by) === String(user.id)) return true;
  const mapped = await db("SELECT 1 FROM custom_report_users WHERE report_id=$1 AND user_id=$2 LIMIT 1", [report.id, user.id]);
  if (!mapped.rows.length) return false;
  if (!report.folder_id) return true;
  const folderResult = await db("SELECT * FROM report_folders WHERE id=$1 AND company_id=$2", [report.folder_id, report.company_id]);
  const folder = folderResult.rows[0];
  if (!folder) return false;
  return resolveAnalyticsPrincipalAccess(db, folder.access, folder.created_by, {
    id: user.id,
    companyId: user.company_id,
    roleId: user.role_id,
  }, "VIEW");
}

function reportSummaryText(report, data) {
  const rowCount = Array.isArray(data?.rows) ? data.rows.length : 0;
  return `${report.name}\n\nScheduled report completed.\nRows: ${rowCount}`;
}

export async function processReportSubscriptionDeliveryJob({ db, payload = {} } = {}) {
  const result = await db(
    `SELECT rs.*,cr.name AS report_name,cr.created_by,cr.folder_id,cr.company_id AS report_company_id,
            cr.definition AS report_definition,cr.archived_at
       FROM report_subscriptions rs
       JOIN custom_reports cr ON cr.id=rs.report_id AND cr.company_id=rs.company_id
      WHERE rs.id=$1 AND rs.company_id=$2 AND rs.active=TRUE
      LIMIT 1`,
    [payload.subscriptionId, payload.companyId || payload._companyId]
  );
  const row = result.rows[0];
  if (!row || row.archived_at) return { status:"SKIPPED", reason:"SUBSCRIPTION_UNAVAILABLE" };
  const subscription = normalizeSubscription(row.definition || {});
  const report = {
    id: row.report_id,
    company_id: row.company_id,
    created_by: row.created_by,
    folder_id: row.folder_id,
    name: row.report_name,
    definition: row.report_definition,
  };
  const executionUser = await loadReportSubscriptionExecutionUser(db, {
    companyId: row.company_id,
    ownerUserId: row.user_id,
    runAsUserId: subscription.runAsUserId,
  });
  if (!(await userHasPermission(db, executionUser, "reports.custom.view"))) {
    throw Object.assign(new Error("Subscription running user no longer has reports.custom.view"), { retryable:false });
  }
  if (!(await canUserAccessReport(db, report, executionUser))) {
    throw Object.assign(new Error("Subscription running user no longer has access to the report"), { retryable:false });
  }

  const data = await executeSavedReport(db, report, executionUser);
  if (!subscriptionConditionMatches(subscription, data)) {
    await db("UPDATE report_subscriptions SET last_run_at=NOW(),last_status='SKIPPED',updated_at=NOW() WHERE id=$1", [row.id]);
    return { status:"SKIPPED", matched:false };
  }

  let recipients = await resolveReportSubscriptionRecipients(db, {
    companyId: row.company_id,
    principals: subscription.recipientPrincipals,
  });
  if (!recipients.length) recipients = [executionUser];
  recipients = await filterReportSubscriptionRecipientsByAccess(recipients, (user) => canUserAccessReport(db, report, user));
  if (!recipients.length) {
    throw Object.assign(new Error("No subscription recipients retain access to this report"), { retryable:false });
  }

  const body = reportSummaryText(report, data);
  let attachments = [];
  if (subscription.delivery.includes("EMAIL") && subscription.attachment?.enabled === true) {
    const payloadForExport = {
      report: {
        id: report.id,
        name: report.name,
        description: "",
        format: report.definition?.format || "tabular",
      },
      columns: data.columns || [],
      rows: data.rows || [],
      totals: data.totals || {},
      groups: data.groups || [],
      rowGroups: data.rowGroups || report.definition?.rowGroups || [],
      columnGroups: data.columnGroups || report.definition?.columnGroups || [],
      filters: report.definition?.filters || [],
    };
    const safeName = String(report.name || "report").replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 80) || "report";
    if (subscription.attachment.view === "DETAILS") {
      const csv = buildDetailsCsv(payloadForExport);
      attachments = [{
        filename: `${safeName}.csv`,
        contentType: "text/csv; charset=utf-8",
        contentBase64: Buffer.from(`\uFEFF${csv}`, "utf8").toString("base64"),
      }];
    } else {
      const workbook = await buildFormattedXlsx(payloadForExport);
      attachments = [{
        filename: `${safeName}.xlsx`,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        contentBase64: Buffer.from(workbook).toString("base64"),
      }];
    }
  }
  const occurrenceKey = String(payload.occurrence || new Date().toISOString().slice(0,16));
  async function deliveryNeeded(recipientId, channel) {
    const result = await db(
      `INSERT INTO report_subscription_deliveries
        (company_id,subscription_id,occurrence_key,recipient_user_id,channel,status)
       VALUES($1,$2,$3,$4,$5,'PENDING')
       ON CONFLICT(subscription_id,occurrence_key,recipient_user_id,channel)
       DO UPDATE SET updated_at=NOW()
       RETURNING id,status`,
      [row.company_id, row.id, occurrenceKey, recipientId, channel]
    );
    const delivery = result.rows[0];
    if (!delivery) return null;
    if (delivery.status === "DELIVERED") return null;
    await db(
      "UPDATE report_subscription_deliveries SET status='RUNNING',last_error=NULL,updated_at=NOW() WHERE id=$1",
      [delivery.id]
    );
    return delivery.id;
  }
  async function completeDelivery(deliveryId) {
    if (!deliveryId) return;
    await db(
      "UPDATE report_subscription_deliveries SET status='DELIVERED',last_error=NULL,delivered_at=NOW(),updated_at=NOW() WHERE id=$1",
      [deliveryId]
    );
  }
  async function failDelivery(deliveryId, error) {
    if (!deliveryId) return;
    await db(
      "UPDATE report_subscription_deliveries SET status='FAILED',last_error=$2,updated_at=NOW() WHERE id=$1",
      [deliveryId, String(error?.message || error || "Delivery failed").slice(0,1000)]
    );
  }

  for (const recipient of recipients) {
    if (subscription.delivery.includes("IN_APP")) {
      const deliveryId = await deliveryNeeded(recipient.id, "IN_APP");
      if (deliveryId) {
        try {
          await db(
            `INSERT INTO platform_notifications(company_id,user_id,title,message,status,delivery_status,metadata)
             VALUES($1,$2,$3,$4,'UNREAD','DELIVERED',$5::jsonb)`,
            [row.company_id, recipient.id, report.name, body, JSON.stringify({ source:"report_subscription", subscriptionId:row.id, reportId:report.id, occurrence:occurrenceKey })]
          );
          await completeDelivery(deliveryId);
        } catch (error) {
          await failDelivery(deliveryId, error);
          throw error;
        }
      }
    }
    if (subscription.delivery.includes("EMAIL") && recipient.email) {
      const deliveryId = await deliveryNeeded(recipient.id, "EMAIL");
      if (deliveryId) {
        try {
          const communication = getWorkflowActionDefinition("SEND_COMMUNICATION");
      if (!communication?.executor) throw Object.assign(new Error("Communication runtime is unavailable"), { retryable:false });
      const outcome = await communication.executor({
        db,
        companyId: row.company_id,
        req: { user: { id: executionUser.id, companyId: row.company_id, roleId: executionUser.role_id } },
        action: {
          key: "SEND_COMMUNICATION",
          type: "SEND_COMMUNICATION",
          channel: "EMAIL",
          recipient: recipient.email,
          subject: `Scheduled report: ${report.name}`,
          message: body,
          attachments,
        },
        record: null,
        previousRecord: null,
        object: null,
        workflowVariables: { variables: {}, steps: {} },
      });
          if (!["SUCCESS","COMPLETED"].includes(String(outcome?.status || "").toUpperCase())) {
            const error = new Error(outcome?.error?.message || outcome?.code || "Report subscription email delivery failed");
            error.retryable = outcome?.retryable === true;
            throw error;
          }
          await completeDelivery(deliveryId);
        } catch (error) {
          await failDelivery(deliveryId, error);
          throw error;
        }
      }
    }
  }

  await db("UPDATE report_subscriptions SET last_run_at=NOW(),last_delivery_at=NOW(),last_status='DELIVERED',updated_at=NOW() WHERE id=$1", [row.id]);
  return { status:"DELIVERED", matched:true, recipientCount:recipients.length, rowCount:(data.rows || []).length };
}
