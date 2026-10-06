import express from "express";
import crypto from "crypto";
import { loadWhatsAppConfig, maskWhatsAppConfiguration, decryptSecret } from "../services/onlineOrders/platformConfig.js";
import { COMMUNICATION_EVENTS, recordCommunicationEvent } from "../services/communicationCore.js";

function safeStringEqual(left,right){const a=Buffer.from(String(left||""),"utf8");const b=Buffer.from(String(right||""),"utf8");return a.length===b.length&&a.length>0&&crypto.timingSafeEqual(a,b);}
function parseBody(body){if(Buffer.isBuffer(body))return {raw:body,json:JSON.parse(body.toString("utf8"))};const json=body&&typeof body==="object"?body:{};return {raw:Buffer.from(JSON.stringify(json)),json};}
function verifySignature(raw,header,secret){const supplied=String(header||"");if(!supplied.startsWith("sha256=")||!secret)return false;const expected=`sha256=${crypto.createHmac("sha256",secret).update(raw).digest("hex")}`;return safeStringEqual(supplied,expected);}
function messageText(message){if(message?.type==="text")return String(message.text?.body||"").trim();if(message?.type==="button")return String(message.button?.text||message.button?.payload||"").trim();if(message?.type==="interactive")return String(message.interactive?.button_reply?.title||message.interactive?.list_reply?.title||message.interactive?.button_reply?.id||message.interactive?.list_reply?.id||"").trim();return "";}
const metadataRequired=(message)=>(_req,res)=>res.status(410).json({success:false,code:"METADATA_ACTION_REQUIRED",message});

export default function createWhatsAppSettingsRouter({db,authenticate,authorize}){
  const router=express.Router();
  router.get("/whatsapp/settings",authenticate,async(req,res)=>{
    try{const {enabled,configuration}=await loadWhatsAppConfig(db,req.user.companyId);return res.json({success:true,data:{enabled,configuration:maskWhatsAppConfiguration(configuration)}});}
    catch(error){console.error("WhatsApp settings load error:",error.message);return res.status(500).json({success:false,message:"Unable to load WhatsApp settings"});}
  });
  router.put("/whatsapp/settings",authenticate,authorize("settings.manage"),metadataRequired("WhatsApp configuration writes execute through Integration metadata Actions/Flows."));
  for(const path of ["/whatsapp/test-connection","/whatsapp/test-invoice","/whatsapp/test-send","/whatsapp/test-message","/whatsapp/resend-invoice"]){
    router.post(path,authenticate,authorize("settings.manage"),metadataRequired("WhatsApp business actions execute through metadata Actions/Flows and generic communication/HTTP primitives."));
  }
  // WhatsApp delivery status is exposed from generic communication events without secrets.\n  router.get("/whatsapp/delivery-history",authenticate,authorize("settings.manage"),async(req,res)=>{
    try{const limit=Math.min(Math.max(Number(req.query.limit)||20,1),100);const result=await db(`SELECT * FROM platform_communication_events WHERE company_id=$1 AND channel='WHATSAPP' ORDER BY created_at DESC LIMIT $2`,[req.user.companyId,limit]);return res.json({success:true,data:result.rows||[]});}
    catch(error){return res.status(500).json({success:false,message:"Unable to load WhatsApp delivery history"});}
  });
  router.get("/whatsapp/webhook",async(req,res)=>{
    try{
      const mode=String(req.query["hub.mode"]||""),challenge=String(req.query["hub.challenge"]||""),verifyToken=String(req.query["hub.verify_token"]||"");
      if(mode!=="subscribe"||!challenge||!verifyToken)return res.sendStatus(400);
      const result=await db("SELECT configuration FROM integrations WHERE provider='whatsapp' AND active=true");
      const matched=(result.rows||[]).some(row=>{const stored=decryptSecret(row.configuration?.webhook_verify_token);return stored&&safeStringEqual(stored,verifyToken);});
      const envToken=String(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN||"").trim();
      if(!matched&&!(envToken&&safeStringEqual(envToken,verifyToken)))return res.sendStatus(403);
      return res.status(200).type("text/plain").send(challenge);
    }catch(error){console.error("WhatsApp webhook verification error:",error.message);return res.sendStatus(500);}
  });
  router.post("/whatsapp/webhook",async(req,res)=>{
    try{
      const {raw,json}=parseBody(req.body);
      if(json?.object!=="whatsapp_business_account")return res.status(200).json({success:true,ignored:true});
      const entries=Array.isArray(json.entry)?json.entry:[];
      const changes=entries.flatMap(entry=>Array.isArray(entry?.changes)?entry.changes:[]).map(change=>change?.value).filter(Boolean);
      const phoneNumberId=changes.map(v=>String(v?.metadata?.phone_number_id||"").trim()).find(Boolean)||"";
      const businessAccountId=entries.map(e=>String(e?.id||"").trim()).find(Boolean)||"";
      if(!phoneNumberId&&!businessAccountId)return res.status(200).json({success:true,ignored:true});
      const match=await db(`SELECT company_id,configuration FROM integrations WHERE provider='whatsapp' AND active=true AND (($1<>'' AND configuration->>'phone_number_id'=$1) OR ($2<>'' AND configuration->>'business_account_id'=$2)) ORDER BY id LIMIT 1`,[phoneNumberId,businessAccountId]);
      const integration=match.rows?.[0];if(!integration)return res.status(200).json({success:true,ignored:true});
      const secret=decryptSecret(integration.configuration?.app_secret)||String(process.env.WHATSAPP_APP_SECRET||"").trim();
      if(!secret)return res.status(503).json({success:false,message:"WhatsApp webhook signing is not configured"});
      if(!verifySignature(raw,req.get("x-hub-signature-256"),secret))return res.status(401).json({success:false,message:"Invalid webhook signature"});
      let processed=0;
      for(const value of changes){
        for(const status of Array.isArray(value?.statuses)?value.statuses:[]){
          if(!status?.id)continue;
          await recordCommunicationEvent({db,companyId:integration.company_id,channel:"WHATSAPP",eventType:String(status.status||"").toLowerCase()==="failed"?COMMUNICATION_EVENTS.FAILED:COMMUNICATION_EVENTS.DELIVERED,direction:"OUTBOUND",provider:"whatsapp",providerMessageId:`status:${status.id}:${status.status||"unknown"}`,communicationId:status.id,metadata:{providerStatus:status.status||null,providerErrors:status.errors||[]}});
          processed++;
        }
        for(const message of Array.isArray(value?.messages)?value.messages:[]){
          if(!message?.id)continue;
          const body=messageText(message);
          await recordCommunicationEvent({db,companyId:integration.company_id,channel:"WHATSAPP",eventType:COMMUNICATION_EVENTS.RECEIVED,direction:"INBOUND",provider:"whatsapp",providerMessageId:message.id,sender:message.from?String(message.from):null,body,metadata:{messageType:message.type||"unknown",phoneNumberId,businessAccountId,rawMessage:message}});
          processed++;
        }
      }
      return res.status(200).json({success:true,processed});
    }catch(error){console.error("WhatsApp webhook adapter error:",error.message);return res.status(500).json({success:false,message:"Unable to process WhatsApp webhook"});}
  });
  return router;
}
