import express from "express";
import {
  findAvailableAppointmentSlots,
  holdAppointmentSlot,
  releaseAppointmentHold,
  confirmAppointmentFromHold,
  listPaymentRequestProviders,
} from "../services/oneAssistant.js";

function errorResponse(res, error) {
  const status = error?.code === "SLOT_UNAVAILABLE" ? 409 : error?.code === "HOLD_EXPIRED" ? 410 : 400;
  return res.status(status).json({ success:false, code:error?.code||"ONEASSISTANT_ERROR", message:error?.message||"Unable to process appointment request" });
}

export default function createOneAssistantRouter({ pool, authenticate, authorize }) {
  const router=express.Router();

  router.get("/appointments/services", authenticate, authorize("appointments.view"), async (req,res)=>{
    const result=await pool.query("SELECT * FROM appointment_services WHERE company_id=$1 ORDER BY active DESC,name",[req.user.companyId]);
    res.json({success:true,data:result.rows});
  });

  router.post("/appointments/services", authenticate, authorize("appointments.configure"), async (req,res)=>{
    const {name,description,durationMinutes=30,price=0,currency="GBP",paymentPolicy="NO_ADVANCE",depositValue=0,active=true}=req.body||{};
    if(!String(name||"").trim()) return res.status(400).json({success:false,message:"Service name is required"});
    const result=await pool.query(
      `INSERT INTO appointment_services(company_id,name,description,duration_minutes,price,currency,payment_policy,deposit_value,active)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.companyId,String(name).trim(),description||null,Number(durationMinutes)||30,Number(price)||0,String(currency||"GBP").toUpperCase(),paymentPolicy,Number(depositValue)||0,active===true]
    );
    res.status(201).json({success:true,data:result.rows[0]});
  });

  router.get("/appointments/resources", authenticate, authorize("appointments.view"), async (req,res)=>{
    const result=await pool.query("SELECT * FROM appointment_resources WHERE company_id=$1 ORDER BY active DESC,name",[req.user.companyId]);
    res.json({success:true,data:result.rows});
  });

  router.post("/appointments/resources", authenticate, authorize("appointments.configure"), async (req,res)=>{
    const {name,storeId=null,userId=null,resourceType="STAFF",timezone=null,serviceIds=[]}=req.body||{};
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const result=await client.query(
        `INSERT INTO appointment_resources(company_id,store_id,user_id,name,resource_type,timezone)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.user.companyId,storeId,userId,String(name||"").trim(),resourceType,timezone]
      );
      for(const serviceId of serviceIds){
        await client.query(
          `INSERT INTO appointment_resource_services(company_id,resource_id,service_id)
           VALUES($1,$2,$3) ON CONFLICT(resource_id,service_id) DO UPDATE SET active=true`,
          [req.user.companyId,result.rows[0].id,serviceId]
        );
      }
      await client.query("COMMIT");
      res.status(201).json({success:true,data:result.rows[0]});
    }catch(error){await client.query("ROLLBACK");errorResponse(res,error);}finally{client.release();}
  });

  router.get("/appointments", authenticate, authorize("appointments.view"), async (req,res)=>{
    const {from,to,status}=req.query;
    const values=[req.user.companyId]; const where=["a.company_id=$1"];
    if(from){values.push(from);where.push(`a.starts_at >= $${values.length}`);}
    if(to){values.push(to);where.push(`a.starts_at < $${values.length}`);}
    if(status){values.push(status);where.push(`a.status = $${values.length}`);}
    const result=await pool.query(
      `SELECT a.*,s.name AS service_name,r.name AS resource_name
         FROM appointments a
         JOIN appointment_services s ON s.id=a.service_id
         JOIN appointment_resources r ON r.id=a.resource_id
        WHERE ${where.join(" AND ")} ORDER BY a.starts_at`,values
    );
    res.json({success:true,data:result.rows});
  });

  router.get("/appointments/availability", authenticate, authorize("appointments.view"), async (req,res)=>{
    try{
      const slots=await findAvailableAppointmentSlots(pool.query.bind(pool),{
        companyId:req.user.companyId,serviceId:req.query.serviceId,resourceId:req.query.resourceId||null,
        from:req.query.from,to:req.query.to,limit:req.query.limit||4
      });
      res.json({success:true,data:slots});
    }catch(error){errorResponse(res,error);}
  });

  router.post("/appointments/holds", authenticate, authorize("appointments.manage"), async (req,res)=>{
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const hold=await holdAppointmentSlot(client,{companyId:req.user.companyId,...req.body});
      await client.query("COMMIT");
      res.status(201).json({success:true,data:hold});
    }catch(error){await client.query("ROLLBACK");errorResponse(res,error);}finally{client.release();}
  });

  router.delete("/appointments/holds/:id", authenticate, authorize("appointments.manage"), async (req,res)=>{
    try{
      const hold=await releaseAppointmentHold(pool.query.bind(pool),{companyId:req.user.companyId,holdId:req.params.id,reason:req.body?.reason||"manual"});
      res.json({success:true,data:hold});
    }catch(error){errorResponse(res,error);}
  });

  router.post("/appointments/holds/:id/confirm", authenticate, authorize("appointments.manage"), async (req,res)=>{
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const appointment=await confirmAppointmentFromHold(client,{companyId:req.user.companyId,holdId:req.params.id,createdBy:req.user.id,...req.body});
      await client.query("COMMIT");
      res.status(201).json({success:true,data:appointment});
    }catch(error){await client.query("ROLLBACK");errorResponse(res,error);}finally{client.release();}
  });

  router.patch("/appointments/:id", authenticate, authorize("appointments.manage"), async (req,res)=>{
    const {status,notes,customerName,customerPhone,customerEmail}=req.body||{};
    const result=await pool.query(
      `UPDATE appointments SET
         status=COALESCE($3,status),notes=COALESCE($4,notes),customer_name=COALESCE($5,customer_name),
         customer_phone=COALESCE($6,customer_phone),customer_email=COALESCE($7,customer_email),updated_at=NOW()
       WHERE id=$1 AND company_id=$2 RETURNING *`,
      [req.params.id,req.user.companyId,status||null,notes??null,customerName??null,customerPhone??null,customerEmail??null]
    );
    if(!result.rows[0]) return res.status(404).json({success:false,message:"Appointment not found"});
    res.json({success:true,data:result.rows[0]});
  });

  router.get("/appointments/payment-providers", authenticate, authorize("appointments.payment"), async (req,res)=>{
    try{
      const providers=await listPaymentRequestProviders(pool.query.bind(pool),req.user.companyId);
      res.json({success:true,data:providers});
    }catch(error){errorResponse(res,error);}
  });

  return router;
}
