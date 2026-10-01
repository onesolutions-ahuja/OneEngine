import express from "express";
import {
  findAvailableAppointmentSlots,
  holdAppointmentSlot,
  releaseAppointmentHold,
  confirmAppointmentFromHold,
  listPaymentRequestProviders,
  resolveAppointmentPublicLink,
  selectPublicAppointmentSlot,
} from "../services/oneAssistant.js";


function errorResponse(res, error) {
  const status = error?.code === "SLOT_UNAVAILABLE" ? 409 : error?.code === "HOLD_EXPIRED" ? 410 : 400;
  return res.status(status).json({ success:false, code:error?.code||"ONEASSISTANT_ERROR", message:error?.message||"Unable to process appointment request" });
}

export default function createOneAssistantRouter({ pool, authenticate, authorize }) {
  const router=express.Router();


  router.get("/public/assistant/book/:token", async (req,res)=>{
    try{
      const link=await resolveAppointmentPublicLink(pool.query.bind(pool),req.params.token,{purpose:"BOOK_SLOT"});
      if(!link) return res.status(410).json({success:false,code:"BOOKING_LINK_EXPIRED",message:"This booking link is invalid or has expired"});
      const services=await pool.query(
        "SELECT id,name,description,duration_minutes,price,currency,payment_policy,deposit_value FROM appointment_services WHERE company_id=$1 AND active=true ORDER BY name",
        [link.company_id]
      );
      let slots=[];
      const serviceId=req.query.serviceId||link.service_id||null;
      if(serviceId){
        const from=req.query.from||new Date().toISOString();
        const to=req.query.to||new Date(Date.now()+14*86400000).toISOString();
        slots=await findAvailableAppointmentSlots(pool.query.bind(pool),{
          companyId:link.company_id,serviceId,resourceId:req.query.resourceId||null,from,to,limit:req.query.limit||20
        });
      }
      res.json({
        success:true,
        data:{
          bookingCase:{id:link.booking_case_id,channel:link.channel,status:link.case_status},
          services:services.rows,
          selectedServiceId:serviceId,
          slots,
          expiresAt:link.expires_at
        }
      });
    }catch(error){errorResponse(res,error);}
  });

  router.post("/public/assistant/book/:token/select", async (req,res)=>{
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const link=await resolveAppointmentPublicLink(client.query.bind(client),req.params.token,{purpose:"BOOK_SLOT"});
      if(!link){await client.query("ROLLBACK");return res.status(410).json({success:false,code:"BOOKING_LINK_EXPIRED",message:"This booking link is invalid or has expired"});}
      const {serviceId,resourceId,startsAt,endsAt}=req.body||{};
      if(!serviceId||!resourceId||!startsAt||!endsAt){await client.query("ROLLBACK");return res.status(400).json({success:false,message:"serviceId, resourceId, startsAt and endsAt are required"});}
      const selected=await selectPublicAppointmentSlot(client,{publicLink:link,serviceId,resourceId,startsAt,endsAt,holdMinutes:req.body?.holdMinutes||10});
      await client.query("COMMIT");
      res.json({
        success:true,
        data:{
          bookingCaseId:link.booking_case_id,
          hold:selected.hold,
          appointment:selected.appointment||null,
          amountDue:selected.amount,
          currency:selected.service.currency,
          requiresPayment:selected.amount>0,
          paymentRequest:selected.paymentRequest
        }
      });
    }catch(error){await client.query("ROLLBACK");errorResponse(res,error);}finally{client.release();}
  });

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
    const {name,storeId=null,userId=null,resourceType="STAFF",timezone=null,serviceIds=[],availability=null}=req.body||{};
    if(!String(name||"").trim()) return res.status(400).json({success:false,message:"Resource name is required"});
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const result=await client.query(
        `INSERT INTO appointment_resources(company_id,store_id,user_id,name,resource_type,timezone)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.user.companyId,storeId,userId,String(name).trim(),resourceType,timezone]
      );
      for(const serviceId of serviceIds){
        await client.query(
          `INSERT INTO appointment_resource_services(company_id,resource_id,service_id)
           VALUES($1,$2,$3) ON CONFLICT(resource_id,service_id) DO UPDATE SET active=true`,
          [req.user.companyId,result.rows[0].id,serviceId]
        );
      }
      if(availability && Array.isArray(availability.weekdays)){
        const startTime=String(availability.startTime||"09:00");
        const endTime=String(availability.endTime||"17:00");
        const interval=Math.max(5,Number(availability.slotIntervalMinutes)||15);
        for(const weekday of availability.weekdays){
          const day=Number(weekday);
          if(!Number.isInteger(day)||day<0||day>6) continue;
          await client.query(
            `INSERT INTO appointment_availability_rules(company_id,resource_id,weekday,start_time,end_time,slot_interval_minutes)
             VALUES($1,$2,$3,$4,$5,$6)`,
            [req.user.companyId,result.rows[0].id,day,startTime,endTime,interval]
          );
        }
      }
      await client.query("COMMIT");
      res.status(201).json({success:true,data:result.rows[0]});
    }catch(error){await client.query("ROLLBACK");errorResponse(res,error);}finally{client.release();}
  });

  router.get("/appointments/availability-rules", authenticate, authorize("appointments.view"), async (req,res)=>{
    const values=[req.user.companyId];
    let sql="SELECT ar.*,r.name AS resource_name FROM appointment_availability_rules ar JOIN appointment_resources r ON r.id=ar.resource_id WHERE ar.company_id=$1";
    if(req.query.resourceId){values.push(req.query.resourceId);sql+=" AND ar.resource_id=$2";}
    sql+=" ORDER BY r.name,ar.weekday,ar.start_time";
    const result=await pool.query(sql,values);
    res.json({success:true,data:result.rows});
  });

  router.put("/appointments/resources/:id/availability", authenticate, authorize("appointments.configure"), async (req,res)=>{
    const {weekdays=[],startTime="09:00",endTime="17:00",slotIntervalMinutes=15}=req.body||{};
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const owned=await client.query("SELECT id FROM appointment_resources WHERE id=$1 AND company_id=$2 LIMIT 1",[req.params.id,req.user.companyId]);
      if(!owned.rows[0]){await client.query("ROLLBACK");return res.status(404).json({success:false,message:"Resource not found"});}
      await client.query("DELETE FROM appointment_availability_rules WHERE company_id=$1 AND resource_id=$2",[req.user.companyId,req.params.id]);
      for(const weekday of weekdays){
        const day=Number(weekday);
        if(!Number.isInteger(day)||day<0||day>6) continue;
        await client.query(
          `INSERT INTO appointment_availability_rules(company_id,resource_id,weekday,start_time,end_time,slot_interval_minutes)
           VALUES($1,$2,$3,$4,$5,$6)`,
          [req.user.companyId,req.params.id,day,String(startTime),String(endTime),Math.max(5,Number(slotIntervalMinutes)||15)]
        );
      }
      await client.query("COMMIT");
      res.json({success:true});
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
