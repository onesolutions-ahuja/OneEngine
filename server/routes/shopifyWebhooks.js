import express from "express";
import { decryptCredentials } from "../services/integrationCredentials.js";
import { verifyShopifyWebhook } from "../services/shopifyAdapter.js";

const SHOP_DOMAIN_RE=/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.myshopify\.com$/i;

export default function createShopifyWebhooksRouter({db}){
 const router=express.Router();
 router.post("/shopify/webhooks",async(req,res)=>{
  const rawBody=Buffer.isBuffer(req.body)?req.body:null;
  if(!rawBody)return res.status(400).json({success:false,message:"Raw webhook body is required"});
  const shopDomain=String(req.get("x-shopify-shop-domain")||"").trim().toLowerCase();
  const topic=String(req.get("x-shopify-topic")||"").trim().toLowerCase();
  const deliveryId=String(req.get("x-shopify-webhook-id")||"").trim();
  const signature=req.get("x-shopify-hmac-sha256");
  if(!SHOP_DOMAIN_RE.test(shopDomain)||!topic||!deliveryId||deliveryId.length>200)return res.status(400).json({success:false,message:"Invalid Shopify webhook headers"});
  try{
   const connections=await db(`SELECT id,company_id,store_id,provider_account_id,credentials_encrypted FROM integration_connections WHERE LOWER(provider_name)='shopify' AND provider_account_id=$1 AND enabled=true AND connection_status='CONNECTED' ORDER BY updated_at DESC LIMIT 2`,[shopDomain]);
   if(connections.rows.length!==1)return res.status(401).json({success:false,message:"Shopify webhook is not authorized"});
   const connection=connections.rows[0],credentials=decryptCredentials(connection.credentials_encrypted)||{};
   const configuredShop=String(credentials.shopDomain||credentials.shop_domain||"").trim().toLowerCase();
   const signingSecret=credentials.webhookSecret||credentials.webhook_secret||credentials.clientSecret||credentials.client_secret;
   if(configuredShop!==shopDomain||!verifyShopifyWebhook(rawBody,signature,signingSecret))return res.status(401).json({success:false,message:"Shopify webhook signature is invalid"});
   let payload;try{payload=JSON.parse(rawBody.toString("utf8"));}catch{return res.status(400).json({success:false,message:"Shopify webhook body is invalid"});}
   if(!payload||typeof payload!=="object"||Array.isArray(payload))return res.status(400).json({success:false,message:"Shopify webhook body is invalid"});
   await db(`INSERT INTO platform_events (company_id,event_type,payload,metadata) VALUES ($1,$2,$3::jsonb,$4::jsonb)`,[connection.company_id,`connector.webhook.shopify.${topic.replaceAll("/",".")}`,JSON.stringify(payload),JSON.stringify({connectionId:connection.id,storeId:connection.store_id||null,deliveryId,eventId:String(req.get("x-shopify-event-id")||"").slice(0,200)||null})]);
   return res.status(200).json({success:true});
  }catch{return res.status(503).json({success:false,message:"Shopify webhook could not be accepted"});}
 });
 return router;
}
