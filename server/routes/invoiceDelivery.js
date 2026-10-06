import express from "express";
import { maskSmsInvoiceConfiguration, maskEmailInvoiceConfiguration, loadInvoiceChannelConfig } from "../services/onlineOrders/platformConfig.js";

const CHANNELS = Object.freeze({
  sms: { provider: "sms_invoice", mask: maskSmsInvoiceConfiguration, label: "SMS" },
  email: { provider: "email_invoice", mask: maskEmailInvoiceConfiguration, label: "Email" },
});
const metadataRequired = (message) => (_req, res) => res.status(410).json({ success:false, code:"METADATA_ACTION_REQUIRED", message });

export default function createInvoiceDeliveryRouter({ db, authenticate, authorize }) {
  const router = express.Router();
  router.get("/invoice-delivery/:channel/settings", authenticate, authorize("settings.manage"), async (req,res)=>{
    const channel=CHANNELS[req.params.channel];
    if(!channel) return res.status(404).json({success:false,message:"Unknown delivery channel."});
    try {
      const {enabled,configuration}=await loadInvoiceChannelConfig(db,req.user.companyId,channel.provider);
      return res.json({success:true,data:{enabled,configuration:channel.mask(configuration)}});
    } catch(error) {
      console.error(`Invoice delivery ${channel.label} settings error:`,error.message);
      return res.status(500).json({success:false,message:`Unable to load ${channel.label} settings.`});
    }
  });
  router.put("/invoice-delivery/:channel/settings", authenticate, authorize("settings.manage"), metadataRequired("Delivery configuration writes are executed through Integration metadata Actions/Flows."));
  router.post("/invoice-delivery/:channel/test-connection", authenticate, authorize("settings.manage"), metadataRequired("Connection tests execute through connector metadata Actions/Flows."));
  router.post("/invoice-delivery/:channel/test-send", authenticate, authorize("settings.manage"), metadataRequired("Test delivery executes through metadata Actions/Flows and generic communication primitives."));
  router.post("/invoice-delivery/:channel/resend", authenticate, authorize("settings.manage","sale.refund"), metadataRequired("Invoice resend executes through metadata Actions/Flows and generic communication primitives."));
  return router;
}
