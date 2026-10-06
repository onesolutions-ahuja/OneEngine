import express from "express";
import { executeSystemWorkflow } from "../services/systemWorkflowRuntime.js";

export default function createEanLookupRouter({ authenticate, db }) {
  const router = express.Router();
  router.get("/ean-lookup/:ean", authenticate, async (req, res) => {
    const barcode=String(req.params.ean||"").trim();
    if(!/^([0-9]{8}|[0-9]{12,14})$/.test(barcode)) return res.status(400).json({success:false,message:"EAN must contain 8, 12, 13 or 14 digits"});
    try {
      const execution=await executeSystemWorkflow({db,companyId:req.user.companyId,userId:req.user.id||null,systemKey:"flow:global_product.lookup",req,input:{barcode},storeId:req.user.storeId||null,source:{type:"api",method:req.method,path:req.path,capability:"GLOBAL_PRODUCT_LOOKUP"}});
      return res.json({success:true,data:execution.result});
    } catch(error){return res.status(error?.status||500).json({success:false,code:error?.code||"LOOKUP_FAILED",message:error?.status?error.message:"Unable to execute product lookup Flow"});}
  });
  return router;
}
