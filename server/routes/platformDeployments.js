import express from "express";
import { exportDashboardMetadataManifest, exportPlatformMetadataManifest } from "../services/platformMetadataPromotion.js";
import { deployMetadata, planMetadataDeployment, rollbackMetadataDeployment } from "../services/platformMetadataDeployment.js";

export default function createPlatformDeploymentsRouter({ authenticate, authorize, db, writeAudit }) {
  const router = express.Router();
  const gated = [authenticate, authorize("oneengine.manage")];

  router.post("/platform/metadata/export", ...gated, async (req, res) => {
    try {
      const objectKeys = req.body?.objectKeys || [];
      const dashboardKeys = req.body?.dashboardKeys || [];
      const [platformData, dashboardData] = await Promise.all([
        objectKeys.length ? exportPlatformMetadataManifest(db, { companyId: req.user.companyId, objectKeys }) : null,
        dashboardKeys.length ? exportDashboardMetadataManifest(db, { companyId: req.user.companyId, dashboardKeys }) : null,
      ]);
      if (!platformData && !dashboardData) throw new Error("Select at least one Platform object or dashboard key to export");
      const data = platformData ? {
        ...platformData,
        manifest: { ...platformData.manifest, dashboards: dashboardData?.manifest.dashboards || [] },
        warnings: [...(platformData.warnings || []), ...(dashboardData?.warnings || [])],
      } : dashboardData;
      await writeAudit?.object({ companyId: req.user.companyId, userId: req.user.id, actorUsername: req.user.username, action: "metadata.export", entityType: "metadata_package", result: "success", metadata: { package: req.body?.packageKey || "metadata-export", objectCount: data.manifest.objects?.length || 0, dashboardCount: data.manifest.dashboards?.length || 0 } });
      res.json({ success: true, data });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
  });

  router.post("/platform/deployments/dry-run", ...gated, async (req, res) => {
    try {
      const data = await planMetadataDeployment(db, { companyId: req.user.companyId, manifest: req.body?.manifest });
      await writeAudit?.object({ companyId: req.user.companyId, userId: req.user.id, action: "metadata.deployment.dry_run", entityType: "metadata_package", result: data.valid ? "success" : "failure", metadata: { package: req.body?.packageKey || "metadata-deployment", conflicts: data.conflicts } });
      res.json({ success: true, data: { ...data, changed: false } });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
  });

  router.post("/platform/deployments", ...gated, async (req, res) => {
    try {
      const data = await deployMetadata(db, { companyId: req.user.companyId, manifest: req.body?.manifest, packageKey: req.body?.packageKey, packageVersion: req.body?.packageVersion, sourceCompanyId: req.body?.sourceCompanyId, userId: req.user.id, writeAudit });
      res.status(201).json({ success: true, data });
    } catch (error) { res.status(409).json({ success: false, message: error.message }); }
  });

  router.get("/platform/deployments", ...gated, async (req, res) => {
    try {
      const result = await db("SELECT id,source_company_id,company_id,package_key,package_version,status,deployed_by,summary,created_at,completed_at FROM platform_deployments WHERE company_id=$1 ORDER BY created_at DESC LIMIT 200", [req.user.companyId]);
      res.json({ success: true, data: result.rows });
    } catch (error) { res.status(500).json({ success: false, message: "Unable to load deployment history" }); }
  });

  router.get("/platform/deployments/:id", ...gated, async (req, res) => {
    try {
      const deployment = await db("SELECT * FROM platform_deployments WHERE id=$1 AND company_id=$2", [req.params.id, req.user.companyId]);
      if (!deployment.rows?.length) return res.status(404).json({ success: false, message: "Deployment not found" });
      const items = await db("SELECT id,metadata_type,metadata_key,operation,reversible,error FROM platform_deployment_items WHERE deployment_id=$1 ORDER BY metadata_type,metadata_key", [req.params.id]);
      res.json({ success: true, data: { ...deployment.rows[0], items: items.rows || [] } });
    } catch (error) { res.status(500).json({ success: false, message: "Unable to load deployment detail" }); }
  });

  router.post("/platform/deployments/:id/rollback", ...gated, async (req, res) => {
    try {
      const data = await rollbackMetadataDeployment(db, { companyId: req.user.companyId, deploymentId: req.params.id, userId: req.user.id, writeAudit });
      res.json({ success: true, data });
    } catch (error) { res.status(409).json({ success: false, message: error.message }); }
  });

  return router;
}
