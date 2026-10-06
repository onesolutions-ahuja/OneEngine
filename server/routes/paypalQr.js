import express from "express";
import { getPaymentAttempt } from "../services/paymentAttempts.js";

const metadataRequired = (_req,res) => res.status(410).json({
  success:false,
  code:"METADATA_ACTION_REQUIRED",
  message:"Payment mutations execute through metadata Actions/Flows and generic payment/connector primitives.",
});

export default function createPaypalQrRouter({ authenticate, authorize, db }) {
  const router=express.Router();
  const scopedUser=(req)=>({companyId:req.user.companyId,storeId:req.user.storeId,tillId:req.user.tillId||null});
  router.post("/paypal-qr/attempts",authenticate,authorize("sale.create"),metadataRequired);
  router.get("/paypal-qr/attempts/:id",authenticate,authorize("sale.view","sale.create"),async(req,res)=>{
    const scope=scopedUser(req);
    const attempt=await getPaymentAttempt(db,{companyId:scope.companyId,attemptId:req.params.id,storeId:scope.storeId,tillId:scope.tillId});
    if(!attempt)return res.status(404).json({success:false,message:"Payment attempt not found"});
    res.json({success:true,data:attempt});
  });
  router.post("/paypal-qr/attempts/:id/cancel",authenticate,authorize("sale.create"),metadataRequired);
  return router;
}
