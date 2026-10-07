import express from "express";
import { buildPlatformObjectQuery, validatePlatformReportDefinition } from "../services/reportableSources.js";
import { loadPlatformReportContext } from "../services/platformReportSecurity.js";
import { reportCapabilities } from "../services/reportAnalyticsDefinition.js";
import { executeAnalyticsDefinition } from "../services/reportExecution.js";
import { reconstructHistoricalRows, validateHistoricalTrendForObject } from "../services/reportHistoricalTrend.js";
import { normalizeFolder, normalizeSubscription, subscriptionConditionMatches, subscriptionIsDue } from "../services/analyticsManagement.js";
import { normalizeReportType } from "../services/reportTypeDefinition.js";
import { normalizeHistoricalTrend, normalizePreviewPreference, normalizeReportExport, normalizeReportTypeExperience } from "../services/reportExperience.js";
import { buildDetailsCsv, buildFormattedXlsx } from "../services/reportExport.js";
import { normalizeAdvancedReportDefinition } from "../services/reportAnalyticsDefinition.js";
import { resolveAnalyticsPrincipalAccess } from "../services/analyticsSecurity.js";
import { claimDueReportSubscriptions } from "../services/reportSubscriptionScheduler.js";
import { loadReportSubscriptionExecutionUser, resolveReportSubscriptionRecipients } from "../services/reportSubscriptionDelivery.js";

function customReportVisibility(user, report) {
  return String(report.created_by) === String(user.id) || report.mapped === true;
}

export default function createReportsRouter({ authenticate, authorize, db }) {
  const { canAccessStore, canViewCompanyCustomers, hasPermission: hasSystemPermission } = arguments[0];
  const router = express.Router();

  function scopedReportParams(req) {
    return [req.user.companyId, req.user.storeId, req.query.dateFrom || null, req.query.dateTo || null];
  }

  async function platformReportContext(req, objectId, relationshipPlan = null) {
    return loadPlatformReportContext(db, req, objectId, relationshipPlan);
  }


  async function executeCustomDefinition(req, definition, { preview = false } = {}) {
    const normalized = normalizeAdvancedReportDefinition({
      ...definition,
      dataSource: "platform_object",
    });
    if (!normalized.objectId) throw new Error("Select a report object");
    const executeBase = async (baseDefinition) => {
      const reportType = await resolveCustomReportType(req, baseDefinition.reportTypeId || baseDefinition.report_type_id || null);
      const context = reportType?.context || await platformReportContext(req, baseDefinition.objectId);
      const validated = validatePlatformReportDefinition(
        { ...baseDefinition, dataSource: "platform_object" },
        context.object,
        context.fields,
        context.relationships
      );
      const trend = validateHistoricalTrendForObject(validated.historicalTrend || {}, context.object, context.fields);
      const built = buildPlatformObjectQuery(validated, context.object, context.fields, req.user.companyId, preview ? 100 : 1000, {
        storeId: req.user.storeId,
        visibilitySql: context.visibilitySql,
        visibilityParams: context.visibilityParams,
        includeRecordId: trend.enabled === true,
      }, context.relationships);
      const result = await db(built.sql, built.params);
      const rows = trend.enabled === true
        ? await reconstructHistoricalRows({ db, companyId:req.user.companyId, objectId:context.object.id, currentRows:result.rows, trend })
        : result.rows;
      const allFields = [
        ...(context.fields || []),
        ...(context.relationships || []).flatMap((relationship) =>
          (relationship.fields || []).map((field) => ({
            ...field,
            key: `${relationship.relationship_key}.${field.api_name}`,
          }))
        ),
      ];
      return {
        columns: validated.fields.map((key) => {
          const field = allFields.find((candidate) => String(candidate.key || candidate.api_name) === String(key));
          return { key, label: field?.label || key };
        }),
        rows,
      };
    };
    return executeAnalyticsDefinition(normalized, executeBase, { preview });
  }

  const canManageReports = async (req) => (
    hasSystemPermission ? hasSystemPermission(req, "reports.custom.manage") : false
  );

  const canManageReportTypes = async (req) => (
    hasSystemPermission ? hasSystemPermission(req, "platform.metadata.manage") : false
  );

  const reportTypeIsVisible = async (req, row) => {
    const status = String(
      row?.definition?.experience?.status
      || row?.definition?.status
      || row?.status
      || "IN_DEVELOPMENT"
    ).toUpperCase();
    return status === "DEPLOYED" || (await canManageReportTypes(req));
  };

  async function visibleFolder(req, folderId, minimum = "VIEW") {
    if (!folderId) return null;
    const result = await db("SELECT * FROM report_folders WHERE id=$1 AND company_id=$2", [folderId, req.user.companyId]);
    const folder = result.rows[0];
    if (!folder) return null;
    return await resolveAnalyticsPrincipalAccess(db, folder.access, folder.created_by, req.user, minimum) ? folder : null;
  }

  async function filterReportsByFolderAccess(req, rows = []) {
    if (await canManageReports(req)) return rows;
    const cache = new Map();
    const visible = [];
    for (const row of rows) {
      if (!row.folder_id) {
        visible.push(row);
        continue;
      }
      const key = String(row.folder_id);
      if (!cache.has(key)) cache.set(key, Boolean(await visibleFolder(req, row.folder_id, "VIEW")));
      if (cache.get(key)) visible.push(row);
    }
    return visible;
  }

  router.get("/reports/custom/capabilities", authenticate, authorize("reports.custom.view"), (_req, res) => {
    res.json({ success: true, data: reportCapabilities() });
  });

  router.get("/reports/custom/report-types", authenticate, authorize("reports.custom.view", "platform.metadata.manage"), async (req, res) => {
    try {
      const manage = await canManageReportTypes(req);
      const result = await db(`SELECT * FROM custom_report_types WHERE company_id=$1 ${manage ? "" : "AND active=TRUE"} ORDER BY active DESC,lower(label)`, [req.user.companyId]);
      const visible = [];
      for (const row of result.rows || []) if (manage || (row.active === true && await reportTypeIsVisible(req, row))) visible.push(row);
      res.json({ success: true, data: visible });
    } catch (error) { res.status(500).json({ success: false, message: "Unable to load report types" }); }
  });

  router.post("/reports/custom/report-types", authenticate, authorize("platform.metadata.manage"), async (req, res) => {
    try {
      const definition = normalizeReportType({ ...req.body, experience: normalizeReportTypeExperience(req.body?.experience || req.body) });
      const object = await db("SELECT id FROM platform_objects WHERE id=$1 AND active=TRUE AND (company_id IS NULL OR company_id=$2)", [definition.primaryObjectId, req.user.companyId]);
      if (!object.rows[0]) return res.status(400).json({ success: false, message: "Primary object is unavailable" });
      const result = await db(
        `INSERT INTO custom_report_types(company_id,created_by,type_key,label,description,primary_object_id,definition,active)
         VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING *`,
        [req.user.companyId, req.user.id, definition.key, definition.label, definition.description, definition.primaryObjectId, JSON.stringify(definition), definition.active]
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) { res.status(400).json({ success: false, message: error.message || "Unable to create report type" }); }
  });

  router.put("/reports/custom/report-types/:id", authenticate, authorize("platform.metadata.manage"), async (req, res) => {
    try {
      const definition = normalizeReportType({ ...req.body, id: req.params.id, experience: normalizeReportTypeExperience(req.body?.experience || req.body) });
      const object = await db("SELECT id FROM platform_objects WHERE id=$1 AND active=TRUE AND (company_id IS NULL OR company_id=$2)", [definition.primaryObjectId, req.user.companyId]);
      if (!object.rows[0]) return res.status(400).json({ success: false, message: "Primary object is unavailable" });
      const result = await db(
        `UPDATE custom_report_types SET type_key=$3,label=$4,description=$5,primary_object_id=$6,definition=$7::jsonb,active=$8,updated_at=NOW()
         WHERE id=$1 AND company_id=$2 RETURNING *`,
        [req.params.id, req.user.companyId, definition.key, definition.label, definition.description, definition.primaryObjectId, JSON.stringify(definition), definition.active]
      );
      if (!result.rows[0]) return res.status(404).json({ success: false, message: "Report type not found" });
      res.json({ success: true, data: result.rows[0] });
    } catch (error) { res.status(400).json({ success: false, message: error.message || "Unable to update report type" }); }
  });

  router.delete("/reports/custom/report-types/:id", authenticate, authorize("platform.metadata.manage"), async (req, res) => {
    try {
      const existing = await db("SELECT id,label FROM custom_report_types WHERE id=$1 AND company_id=$2", [req.params.id, req.user.companyId]);
      if (!existing.rows[0]) return res.status(404).json({ success: false, message: "Report type not found" });
      const usage = await db("SELECT COUNT(*)::int AS count FROM custom_reports WHERE company_id=$1 AND report_type_id=$2 AND archived_at IS NULL", [req.user.companyId, req.params.id]);
      if (Number(usage.rows[0]?.count || 0) > 0) {
        return res.status(409).json({ success: false, code: "REPORT_TYPE_IN_USE", message: "This report type is used by one or more saved reports. Reassign or archive those reports before deleting it." });
      }
      await db("DELETE FROM custom_report_types WHERE id=$1 AND company_id=$2", [req.params.id, req.user.companyId]);
      res.json({ success: true, data: { id: req.params.id } });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message || "Unable to delete report type" });
    }
  });

  router.get("/reports/custom/folders", authenticate, authorize("reports.custom.view"), async (req, res) => {
    try {
      const result = await db("SELECT * FROM report_folders WHERE company_id=$1 ORDER BY lower(name)", [req.user.companyId]);
      const visible = [];
      for (const folder of result.rows || []) {
        if (await resolveAnalyticsPrincipalAccess(db, folder.access, folder.created_by, req.user, "VIEW")) visible.push(folder);
      }
      res.json({ success: true, data: visible });
    } catch (error) { res.status(500).json({ success: false, message: "Unable to load report folders" }); }
  });

  router.post("/reports/custom/folders", authenticate, authorize("reports.custom.manage"), async (req, res) => {
    try {
      const folder = normalizeFolder(req.body);
      const result = await db(
        "INSERT INTO report_folders(company_id,created_by,name,description,visibility,access) VALUES($1,$2,$3,$4,$5,$6::jsonb) RETURNING *",
        [req.user.companyId, req.user.id, folder.name, folder.description, folder.visibility, JSON.stringify(folder.access)]
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) { res.status(400).json({ success: false, message: error.message || "Unable to create report folder" }); }
  });

  router.put("/reports/custom/folders/:id", authenticate, authorize("reports.custom.manage"), async (req, res) => {
    try {
      if (!(await visibleFolder(req, req.params.id, "MANAGE"))) return res.status(404).json({ success: false, message: "Report folder not found" });
      const folder = normalizeFolder(req.body);
      const result = await db(
        "UPDATE report_folders SET name=$3,description=$4,visibility=$5,access=$6::jsonb,updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *",
        [req.params.id, req.user.companyId, folder.name, folder.description, folder.visibility, JSON.stringify(folder.access)]
      );
      res.json({ success: true, data: result.rows[0] });
    } catch (error) { res.status(400).json({ success: false, message: error.message || "Unable to update report folder" }); }
  });

  router.get("/reports/custom/navigation", authenticate, authorize("reports.custom.view"), async (req, res) => {
    try {
      const result = await db(
        `SELECT cr.id,cr.name,cr.folder_id,rup.favourite,rup.last_viewed_at,rup.view_count
         FROM custom_reports cr
         LEFT JOIN report_user_preferences rup ON rup.report_id=cr.id AND rup.user_id=$2
         WHERE cr.company_id=$1 AND cr.archived_at IS NULL
           AND (cr.created_by=$2 OR EXISTS(SELECT 1 FROM custom_report_users cru WHERE cru.report_id=cr.id AND cru.user_id=$2) OR $3)
         ORDER BY COALESCE(rup.last_viewed_at,cr.updated_at) DESC`,
        [req.user.companyId, req.user.id, await canManageReports(req)]
      );
      const visibleRows = await filterReportsByFolderAccess(req, result.rows || []);
      res.json({ success: true, data: { favourites: visibleRows.filter((row) => row.favourite === true), recent: visibleRows.filter((row) => row.last_viewed_at).slice(0,20) } });
    } catch (error) { res.status(500).json({ success: false, message: "Unable to load report navigation" }); }
  });

  router.get("/reports/custom/metadata", authenticate, authorize("reports.custom.view"), async (req, res) => {
    try {
      const manage = await canManageReports(req);
      const [stores, users, roles, publicGroups, reports, reportTypes, platformObjects] = await Promise.all([
        db("SELECT id,name FROM stores WHERE company_id=$1 AND active=true ORDER BY name", [req.user.companyId]),
        db("SELECT id,username,full_name FROM users WHERE company_id=$1 AND active=true ORDER BY full_name,username", [req.user.companyId]),
        db("SELECT id,name FROM roles WHERE company_id=$1 ORDER BY name", [req.user.companyId]),
        db("SELECT id,name FROM platform_public_groups WHERE company_id=$1 ORDER BY name", [req.user.companyId]),
        db(`SELECT cr.id,cr.name,cr.description,cr.definition,cr.created_by,cr.folder_id,cr.report_type_id,
              COALESCE(array_agg(cru.user_id) FILTER (WHERE cru.user_id IS NOT NULL),'{}') AS user_ids,u.full_name AS created_by_name
            FROM custom_reports cr LEFT JOIN users u ON u.id=cr.created_by LEFT JOIN custom_report_users cru ON cru.report_id=cr.id
            WHERE cr.company_id=$1 AND cr.archived_at IS NULL AND ($2 OR cr.created_by=$3 OR EXISTS(SELECT 1 FROM custom_report_users x WHERE x.report_id=cr.id AND x.user_id=$3))
            GROUP BY cr.id,u.full_name ORDER BY cr.updated_at DESC`, [req.user.companyId, manage, req.user.id]),
        db("SELECT * FROM custom_report_types WHERE company_id=$1 AND active=TRUE ORDER BY lower(label)", [req.user.companyId]),
        db("SELECT o.id,o.object_key,o.label,o.source_table,o.company_id,COALESCE(o.config,'{}'::jsonb) || COALESCE(s.config,'{}'::jsonb) AS config FROM platform_objects o LEFT JOIN platform_object_settings s ON s.object_id=o.id AND s.company_id=$1 WHERE o.active=true AND o.source_table IS NOT NULL AND (o.company_id IS NULL OR o.company_id=$1) ORDER BY o.label", [req.user.companyId]),
      ]);
      res.json({ success: true, data: {
        fields: [],
        filters: [],
        stores: stores.rows,
        users: users.rows,
        roles: manage ? roles.rows : [],
        publicGroups: manage ? publicGroups.rows : [],
        reports: await filterReportsByFolderAccess(req, reports.rows || []),
        reportTypes: await (async () => {
          const visible = [];
          for (const row of reportTypes.rows || []) if (await reportTypeIsVisible(req, row)) visible.push(row);
          return visible;
        })(),
        sources: [],
        platformObjects: platformObjects.rows,
        capabilities: reportCapabilities(),
        canManage: manage,
      } });
    } catch (error) { console.error("Custom report metadata error:", error); res.status(500).json({ success:false,message:"Unable to load custom report metadata" }); }
  });

  router.get("/reports/custom", authenticate, authorize("reports.custom.view"), async (req, res) => {
    try {
      const manage = await canManageReports(req);
      const result = await db(
        `SELECT cr.id,cr.name,cr.description,cr.definition,cr.created_by,cr.updated_at,cr.folder_id,cr.report_type_id,
          COALESCE(array_agg(cru.user_id) FILTER (WHERE cru.user_id IS NOT NULL),'{}') AS user_ids,u.full_name AS created_by_name
         FROM custom_reports cr LEFT JOIN users u ON u.id=cr.created_by LEFT JOIN custom_report_users cru ON cru.report_id=cr.id
         WHERE cr.company_id=$1 AND cr.archived_at IS NULL AND ($2 OR cr.created_by=$3 OR EXISTS(SELECT 1 FROM custom_report_users x WHERE x.report_id=cr.id AND x.user_id=$3))
         GROUP BY cr.id,u.full_name ORDER BY cr.updated_at DESC`,
        [req.user.companyId, manage, req.user.id]
      );
      res.json({ success:true,data:await filterReportsByFolderAccess(req,result.rows||[]) });
    } catch (error) { res.status(500).json({ success:false,message:"Unable to load custom reports" }); }
  });

  router.get("/reports/custom/platform-objects/:objectId/metadata", authenticate, authorize("reports.custom.view"), async (req, res) => {
    try {
      const reportType = req.query.reportTypeId ? await resolveCustomReportType(req, req.query.reportTypeId) : null;
      const context = reportType?.context || await platformReportContext(req,req.params.objectId);
      if(!context.object||!context.object.source_table)return res.status(404).json({success:false,message:"Report object not found"});
      const fields=context.fields.map((field)=>({...field,key:field.api_name,type:field.field_type}));
      res.json({success:true,data:{object:context.object,fields,relationships:context.relationships.map(({fields:relatedFields,...relationship})=>({...relationship,fields:relatedFields.map((field)=>({...field,key:`${relationship.relationship_key}.${field.api_name}`,type:field.field_type}))}))}});
    } catch (error) { res.status(400).json({success:false,message:error.message||"Unable to load report object metadata"}); }
  });

  router.post("/reports/custom/preview", authenticate, authorize("reports.custom.view"), async (req, res) => {
    try {
      const previewPreference=normalizePreviewPreference(req.body?.previewPreference||{});
      const definition=normalizeAdvancedReportDefinition({...req.body,rowLimit:Math.min(Number(req.body?.rowLimit||previewPreference.sampleLimit),previewPreference.sampleLimit)});
      const data=await executeCustomDefinition(req,definition,{preview:true});
      res.json({success:true,data});
    } catch(error){res.status(400).json({success:false,message:error.message||"Unable to preview custom report"});}
  });

  router.post("/reports/custom/subscriptions/run-due", authenticate, authorize("reports.custom.manage"), async (req,res)=>{
    try {
      const jobs=await claimDueReportSubscriptions({db,now:new Date(),companyId:req.user.companyId});
      res.json({success:true,data:jobs.map((job)=>({id:job.id,kind:job.kind,status:job.status||"PENDING"}))});
    } catch(error){res.status(500).json({success:false,message:error.message||"Unable to queue due subscriptions"});}
  });

  router.get("/reports/custom/:id/export", authenticate, authorize("reports.custom.view"), async (req,res)=>{
    try {
      const report=await reportById(req,req.params.id);
      if(!report)return res.status(404).json({success:false,message:"Custom report not found"});
      const definition=normalizeAdvancedReportDefinition(report.definition||{});
      if(definition.historicalTrend?.enabled===true)return res.status(400).json({success:false,message:"Historical Trending reports do not support export"});
      const exportConfig=normalizeReportExport({view:req.query.view,format:req.query.format},definition.format||"tabular");
      const data=await executeCustomDefinition(req,definition);
      const payload={report:{id:report.id,name:report.name,description:report.description,format:definition.format||"tabular"},columns:data.columns||[],rows:data.rows||[],totals:data.totals||{},groups:data.groups||[],rowGroups:data.rowGroups||definition.rowGroups||[],columnGroups:data.columnGroups||definition.columnGroups||[],filters:definition.filters||[]};
      const filename=String(report.name||"report").replace(/[^A-Za-z0-9_-]+/g,"_").slice(0,80)||"report";
      if(exportConfig.view==="FORMATTED"){const buffer=await buildFormattedXlsx(payload);res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");res.setHeader("Content-Disposition",`attachment; filename="${filename}.xlsx"`);return res.send(Buffer.from(buffer));}
      const csv=buildDetailsCsv(payload);res.setHeader("Content-Type","text/csv; charset=utf-8");res.setHeader("Content-Disposition",`attachment; filename="${filename}.csv"`);return res.send(`\uFEFF${csv}`);
    } catch(error){res.status(400).json({success:false,message:error.message||"Unable to export report"});}
  });

  router.get("/reports/custom/:id/history/compare", authenticate, authorize("reports.custom.view"), async (req,res)=>{
    try {
      const report=await reportById(req,req.params.id);
      if(!report)return res.status(404).json({success:false,message:"Custom report not found"});
      const requestedTrend=req.query?.trend?normalizeHistoricalTrend(JSON.parse(String(req.query.trend))):normalizeHistoricalTrend(report.definition?.historicalTrend||{});
      const data=await executeCustomDefinition(req,{...(report.definition||{}),historicalTrend:requestedTrend});
      res.json({success:true,data});
    } catch(error){res.status(400).json({success:false,message:error.message||"Unable to compare historical report data"});}
  });

  router.get("/reports/custom/:id/history", authenticate, authorize("reports.custom.view"), async (req,res)=>{
    try {
      const report=await reportById(req,req.params.id);
      if(!report)return res.status(404).json({success:false,message:"Custom report not found"});
      const result=await db("SELECT id,captured_at,period_key,summary,row_count FROM report_snapshots WHERE report_id=$1 AND company_id=$2 ORDER BY captured_at DESC LIMIT 100",[req.params.id,req.user.companyId]);
      res.json({success:true,data:result.rows});
    } catch(error){res.status(500).json({success:false,message:"Unable to load report history"});}
  });

  router.get("/reports/custom/:id/subscriptions", authenticate, authorize("reports.custom.view"), async (req,res)=>{
    const report=await reportById(req,req.params.id);
    if(!report)return res.status(404).json({success:false,message:"Custom report not found"});
    const result=await db("SELECT * FROM report_subscriptions WHERE report_id=$1 AND company_id=$2 AND user_id=$3 ORDER BY created_at DESC",[req.params.id,req.user.companyId,req.user.id]);
    res.json({success:true,data:result.rows});
  });

  router.post("/reports/custom/:id/subscriptions", authenticate, authorize("reports.custom.view"), async (req,res)=>{
    try {
      const report=await reportById(req,req.params.id);
      if(!report)return res.status(404).json({success:false,message:"Custom report not found"});
      const reportDefinition=normalizeAdvancedReportDefinition(report.definition||{});
      if(reportDefinition.format==="joined")return res.status(400).json({success:false,message:"Joined reports do not support subscriptions"});
      if(reportDefinition.historicalTrend?.enabled===true)return res.status(400).json({success:false,message:"Historical trend reports do not support subscriptions"});
      const definition=normalizeSubscription(req.body);
      const executionUser=await loadReportSubscriptionExecutionUser(db,{companyId:req.user.companyId,ownerUserId:req.user.id,runAsUserId:definition.runAsUserId});
      const executionReq=Object.create(req);
      executionReq.user={...req.user,id:executionUser.id,companyId:executionUser.company_id,roleId:executionUser.role_id,username:executionUser.username,full_name:executionUser.full_name};
      if(hasSystemPermission&&!(await hasSystemPermission(executionReq,"reports.custom.view")))return res.status(400).json({success:false,message:"Running user does not have reports.custom.view"});
      if(!(await reportById(executionReq,req.params.id)))return res.status(400).json({success:false,message:"Running user cannot access this report"});
      const resolvedRecipients=await resolveReportSubscriptionRecipients(db,{companyId:req.user.companyId,principals:definition.recipientPrincipals});
      for(const recipient of resolvedRecipients){
        const recipientReq=Object.create(req);
        recipientReq.user={...req.user,id:recipient.id,companyId:recipient.company_id,roleId:recipient.role_id,username:recipient.username,full_name:recipient.full_name};
        if(hasSystemPermission&&!(await hasSystemPermission(recipientReq,"reports.custom.view")))return res.status(400).json({success:false,message:"One or more recipients do not have reports.custom.view"});
        if(!(await reportById(recipientReq,req.params.id)))return res.status(400).json({success:false,message:"One or more recipients cannot access this report"});
      }
      const result=await db("INSERT INTO report_subscriptions(company_id,report_id,user_id,definition,active) VALUES($1,$2,$3,$4::jsonb,$5) RETURNING *",[req.user.companyId,req.params.id,req.user.id,JSON.stringify(definition),definition.active]);
      res.status(201).json({success:true,data:result.rows[0]});
    } catch(error){res.status(400).json({success:false,message:error.message||"Unable to create subscription"});}
  });

  router.delete("/reports/custom/:id/subscriptions/:subscriptionId", authenticate, authorize("reports.custom.view"), async (req,res)=>{
    await db("DELETE FROM report_subscriptions WHERE id=$1 AND report_id=$2 AND company_id=$3 AND user_id=$4",[req.params.subscriptionId,req.params.id,req.user.companyId,req.user.id]);
    res.json({success:true});
  });

  router.put("/reports/custom/:id/favourite", authenticate, authorize("reports.custom.view"), async (req,res)=>{
    try {
      const report=await reportById(req,req.params.id);
      if(!report)return res.status(404).json({success:false,message:"Custom report not found"});
      await db(`INSERT INTO report_user_preferences(company_id,user_id,report_id,favourite,last_viewed_at,view_count)
        VALUES($1,$2,$3,$4,NOW(),1)
        ON CONFLICT(user_id,report_id) DO UPDATE SET favourite=EXCLUDED.favourite`,
        [req.user.companyId,req.user.id,req.params.id,req.body?.favourite===true]);
      res.json({success:true});
    } catch(error){res.status(400).json({success:false,message:"Unable to update favourite"});}
  });

  router.put("/reports/custom/:id/folder", authenticate, authorize("reports.custom.edit"), async (req,res)=>{
    try {
      const report=await reportById(req,req.params.id);
      if(!report)return res.status(404).json({success:false,message:"Custom report not found"});
      if(String(report.created_by)!==String(req.user.id)&&!(await canManageReports(req)))return res.status(403).json({success:false,message:"You cannot move this report"});
      const folderId=req.body?.folderId||null;
      if(folderId&&!(await visibleFolder(req,folderId,"EDIT")))return res.status(400).json({success:false,message:"Report folder is not available"});
      await db("UPDATE custom_reports SET folder_id=$3,updated_at=NOW() WHERE id=$1 AND company_id=$2",[req.params.id,req.user.companyId,folderId]);
      res.json({success:true});
    } catch(error){res.status(400).json({success:false,message:error.message||"Unable to move report"});}
  });

  router.get("/reports/custom/:id", authenticate, authorize("reports.custom.view"), async (req,res)=>{
    try{const report=await reportById(req,req.params.id);if(!report)return res.status(404).json({success:false,message:"Custom report not found"});res.json({success:true,data:report});}
    catch(error){res.status(500).json({success:false,message:"Unable to load custom report"});}
  });

  router.post("/reports/custom", authenticate, authorize("reports.custom.create"), async (req,res)=>{
    try {
      const name=String(req.body?.name||"").trim();
      if(!name||name.length>150)return res.status(400).json({success:false,message:"A report name up to 150 characters is required"});
      const reportType=await resolveCustomReportType(req,req.body?.reportTypeId||req.body?.report_type_id||null);
      const sourceInput=reportType?{...req.body,dataSource:"platform_object",objectId:reportType.definition.primaryObjectId,reportTypeId:reportType.row.id}:req.body;
      const definition=normalizeAdvancedReportDefinition({...sourceInput,dataSource:"platform_object"});
      if(!definition.objectId)return res.status(400).json({success:false,message:"Select a report object or report type"});
      {const context=reportType?.context||await platformReportContext(req,definition.objectId);validatePlatformReportDefinition(definition,context.object,context.fields,context.relationships);}
      const stores=[];
      const result=await db("INSERT INTO custom_reports(company_id,created_by,name,description,data_source,report_type_id,definition) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *",
        [req.user.companyId,req.user.id,name,String(req.body.description||"").slice(0,500),definition.dataSource||"platform_object",reportType?.row?.id||null,JSON.stringify({...definition,reportTypeId:reportType?.row?.id||null,storeIds:stores})]);
      res.status(201).json({success:true,data:result.rows[0]});
    } catch(error){res.status(400).json({success:false,message:error.message||"Unable to create custom report"});}
  });

  router.put("/reports/custom/:id", authenticate, authorize("reports.custom.edit"), async (req,res)=>{
    try {
      const report=await reportById(req,req.params.id);
      if(!report)return res.status(404).json({success:false,message:"Custom report not found"});
      if(String(report.created_by)!==String(req.user.id)&&!(await canManageReports(req)))return res.status(403).json({success:false,message:"Only the owner or a report manager can edit this report"});
      const name=String(req.body?.name||report.name).trim();
      const reportType=await resolveCustomReportType(req,req.body?.reportTypeId||req.body?.report_type_id||report.report_type_id||null);
      const sourceInput=reportType?{...req.body,dataSource:"platform_object",objectId:reportType.definition.primaryObjectId,reportTypeId:reportType.row.id}:req.body;
      const definition=normalizeAdvancedReportDefinition({...sourceInput,dataSource:"platform_object"});
      if(!definition.objectId)return res.status(400).json({success:false,message:"Select a report object or report type"});
      {const context=reportType?.context||await platformReportContext(req,definition.objectId);validatePlatformReportDefinition(definition,context.object,context.fields,context.relationships);}
      const stores=[];
      const result=await db("UPDATE custom_reports SET name=$3,description=$4,data_source=$5,report_type_id=$6,definition=$7::jsonb,updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *",
        [req.params.id,req.user.companyId,name,String(req.body.description||report.description||"").slice(0,500),definition.dataSource||"platform_object",reportType?.row?.id||null,JSON.stringify({...definition,reportTypeId:reportType?.row?.id||null,storeIds:stores})]);
      res.json({success:true,data:result.rows[0]});
    } catch(error){res.status(400).json({success:false,message:error.message||"Unable to update custom report"});}
  });

  router.delete("/reports/custom/:id", authenticate, authorize("reports.custom.edit"), async (req,res)=>{
    try{const report=await reportById(req,req.params.id);if(!report)return res.status(404).json({success:false,message:"Custom report not found"});if(String(report.created_by)!==String(req.user.id)&&!(await canManageReports(req)))return res.status(403).json({success:false,message:"You cannot archive this report"});await db("UPDATE custom_reports SET archived_at=NOW(),updated_at=NOW() WHERE id=$1 AND company_id=$2",[req.params.id,req.user.companyId]);res.json({success:true,data:{id:req.params.id}});}
    catch(error){res.status(500).json({success:false,message:"Unable to archive custom report"});}
  });

  router.post("/reports/custom/:id/duplicate", authenticate, authorize("reports.custom.create"), async (req,res)=>{
    try{const report=await reportById(req,req.params.id);if(!report)return res.status(404).json({success:false,message:"Custom report not found"});const result=await db("INSERT INTO custom_reports(company_id,created_by,name,description,data_source,report_type_id,definition) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *",[req.user.companyId,req.user.id,`${report.name} (copy)`.slice(0,150),report.description,report.data_source,report.report_type_id||null,JSON.stringify(report.definition)]);res.status(201).json({success:true,data:result.rows[0]});}
    catch(error){res.status(500).json({success:false,message:"Unable to duplicate custom report"});}
  });

  router.put("/reports/custom/:id/users", authenticate, authorize("reports.custom.share"), async (req,res)=>{
    try{const report=await reportById(req,req.params.id);if(!report)return res.status(404).json({success:false,message:"Custom report not found"});if(String(report.created_by)!==String(req.user.id)&&!(await canManageReports(req)))return res.status(403).json({success:false,message:"You cannot share this report"});const userIds=validateUuidList(req.body?.userIds,"user");const valid=await db("SELECT id FROM users WHERE company_id=$1 AND active=true AND id=ANY($2::uuid[])",[req.user.companyId,userIds]);if(valid.rows.length!==userIds.length)return res.status(400).json({success:false,message:"One or more users were not found"});await db("DELETE FROM custom_report_users WHERE report_id=$1",[req.params.id]);for(const userId of userIds)await db("INSERT INTO custom_report_users(report_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[req.params.id,userId]);res.json({success:true,data:{userIds}});}
    catch(error){res.status(400).json({success:false,message:error.message||"Unable to map report users"});}
  });

  router.post("/reports/custom/:id/run", authenticate, authorize("reports.custom.view"), async (req,res)=>{
    try {
      const report=await reportById(req,req.params.id);
      if(!report)return res.status(404).json({success:false,message:"Custom report not found"});
      const definition=report.definition||{};
      const data=await executeCustomDefinition(req,definition);
      await recordReportView(req,req.params.id);
      const normalized=normalizeAdvancedReportDefinition(definition);
      if(normalized.snapshot===true&&normalized.historicalTrend?.enabled!==true){
        await db("INSERT INTO report_snapshots(company_id,report_id,period_key,summary,row_count) VALUES($1,$2,$3,$4::jsonb,$5)",
          [req.user.companyId,req.params.id,String(normalized.snapshotPeriod||new Date().toISOString().slice(0,10)),JSON.stringify(data.totals||{}),(data.rows||[]).length]);
      }
      res.json({success:true,data});
    } catch(error){res.status(400).json({success:false,message:error.message||"Unable to run custom report"});}
  });

  return router;
}
