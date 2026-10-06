import express from "express";
import { executeSystemWorkflow } from "../services/systemWorkflowRuntime.js";

// Dashboard composition/metrics are metadata-owned. This compatibility endpoint
// delegates to the active dashboard summary Flow and contains no business query.
export default function createDashboardRouter({ authenticate, authorize, db }) {
  const router = express.Router();
  router.get("/dashboard/summary", authenticate, authorize("dashboard.view"), async (req, res) => {
    try {
      const execution = await executeSystemWorkflow({ db, companyId:req.user.companyId, userId:req.user.id || null, systemKey:"flow:dashboard.summary", req, input:{}, storeId:req.user.storeId || null, source:{ type:"api", method:req.method, path:req.path, capability:"DASHBOARD_SUMMARY" } });
      res.json({ success:true, data:execution.result || {} });
    } catch (error) {
      res.status(error?.status || 500).json({ success:false, code:error?.code || "DASHBOARD_FLOW_FAILED", message:error?.status ? error.message : "Unable to execute dashboard Flow" });
    }
  });
  return router;
}
