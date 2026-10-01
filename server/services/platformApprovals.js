import { evaluateCondition } from "./platformConditions.js";
import { executeWorkflowActions } from "./platformWorkflow.js";

function cfg(value) {
  if (!value) return {};
  if (typeof value === "string") { try { return JSON.parse(value); } catch { return {}; } }
  return value;
}

async function runOutcomeActions({ db, request, process, actions, req, event }) {
  if (!Array.isArray(actions) || !actions.length) return [];
  const object = await db("SELECT * FROM platform_objects WHERE id=$1 AND company_id=$2", [request.object_id, request.company_id]);
  const objectRow = object.rows[0] || { id: request.object_id };
  let record = null;
  if (objectRow.source_table && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(objectRow.source_table)) {
    const found = await db(`SELECT * FROM "${objectRow.source_table}" WHERE id=$1 AND company_id=$2 LIMIT 1`, [request.record_id, request.company_id]).catch(() => ({ rows: [] }));
    record = found.rows[0] || null;
  }
  return executeWorkflowActions({
    actions,
    db,
    companyId: request.company_id,
    object: objectRow,
    objectId: request.object_id,
    recordId: request.record_id,
    record: record || { id: request.record_id },
    req,
    trigger: { type: event, approvalRequestId: request.id, processId: process.id },
  });
}

async function resolveStepAssignees({ db, request, step, record = {} }) {
  const type = String(step.assignment_type || "role").toLowerCase();
  const config = cfg(step.assignment_config);
  let ids = [];
  if (type === "user" && config.userId) ids = [config.userId];
  else if (type === "submitter") ids = request.submitted_by ? [request.submitted_by] : [];
  else if (type === "record_user" && config.field) {
    const value = record?.[config.field];
    ids = value ? [value] : [];
  } else if (type === "group" && config.groupId) {
    const members = await db(`SELECT u.id FROM platform_approval_group_members gm JOIN users u ON u.id=gm.user_id WHERE gm.group_id=$1 AND u.company_id=$2 AND u.active=TRUE ORDER BY u.created_at,u.id`, [config.groupId, request.company_id]);
    ids = members.rows.map(row => row.id);
  } else {
    const users = await db(`SELECT u.id FROM users u WHERE u.company_id=$1 AND u.role_id=$2 AND u.active=TRUE AND ($3::uuid IS NULL OR u.id<>$3) ORDER BY u.created_at,u.id`, [request.company_id, step.role_id, request.submitted_by || null]);
    ids = users.rows.map(row => row.id);
  }
  if (!ids.length) return [];
  const delegated = [];
  for (const id of ids) {
    const d = await db(`SELECT delegate_user_id FROM platform_approval_delegations WHERE company_id=$1 AND user_id=$2 AND active=TRUE AND (starts_at IS NULL OR starts_at<=NOW()) AND (ends_at IS NULL OR ends_at>=NOW()) ORDER BY created_at DESC LIMIT 1`, [request.company_id,id]);
    delegated.push(d.rows[0]?.delegate_user_id || id);
  }
  return [...new Set(delegated.map(String))];
}

async function loadApprovalRecord({ db, request }) {
  const object = await db("SELECT source_table FROM platform_objects WHERE id=$1 AND company_id=$2", [request.object_id,request.company_id]);
  const table=object.rows[0]?.source_table;
  if (!table || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) return {};
  const found=await db(`SELECT * FROM "${table}" WHERE id=$1 AND company_id=$2 LIMIT 1`,[request.record_id,request.company_id]).catch(()=>({rows:[]}));
  return found.rows[0]||{};
}

async function createWorkItems({ db, request, step }) {
  const record=await loadApprovalRecord({db,request});
  const assignees=await resolveStepAssignees({db,request,step,record});
  const stepConfig=cfg(step.config);
  const dueHours=Number(stepConfig.dueHours||stepConfig.due_hours||0);
  const targets=assignees.length?assignees:[null];
  const rows=[];
  for(const assigneeId of targets) {
    const result=await db(
      `INSERT INTO platform_approval_work_items(request_id,step_id,step_order,company_id,role_id,assigned_to,status,due_at)
       VALUES($1,$2,$3,$4,$5,$6,'pending',CASE WHEN $7::numeric>0 THEN NOW()+($7::text||' hours')::interval ELSE NULL END)
       ON CONFLICT DO NOTHING RETURNING *`,
      [request.id,step.id,step.step_order,request.company_id,step.role_id,assigneeId,dueHours]
    );
    if(result.rows[0]) rows.push(result.rows[0]);
  }
  return rows;
}
async function currentRequest({ db, requestId, companyId }) {
  const result = await db(
    `SELECT r.*,p.config AS process_config,p.name AS process_name,
            s.id AS step_id,s.role_id,s.step_order,s.label AS step_label,s.config AS step_config,s.assignment_type,s.assignment_config
       FROM platform_approval_requests r
       JOIN platform_approval_processes p ON p.id=r.process_id
       JOIN platform_approval_steps s ON s.process_id=r.process_id AND s.step_order=r.current_step
      WHERE r.id=$1 AND r.company_id=$2`,
    [requestId, companyId]
  );
  return result.rows[0] || null;
}

export async function submitPlatformApproval({ db, object, fields, recordId, record, req }) {
  try {
    const processes = await db(
      "SELECT * FROM platform_approval_processes WHERE object_id=$1 AND company_id=$2 AND active=true ORDER BY id",
      [object.id, req.user.companyId]
    );
    const process = processes.rows.find((candidate) => evaluateCondition(candidate.conditions, fields, record));
    if (!process) return null;
    const existing = await db(
      "SELECT * FROM platform_approval_requests WHERE process_id=$1 AND record_id=$2 AND company_id=$3 AND status='pending' LIMIT 1",
      [process.id, recordId, req.user.companyId]
    );
    if (existing.rows.length) return existing.rows[0];

    const steps = await db("SELECT * FROM platform_approval_steps WHERE process_id=$1 ORDER BY step_order", [process.id]);
    if (!steps.rows.length) return null;

    const result = await db(
      `INSERT INTO platform_approval_requests
        (process_id,object_id,record_id,company_id,current_step,submitted_by,locked)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [process.id, object.id, recordId, req.user.companyId, steps.rows[0].step_order, req.user.id || null, cfg(process.config).lockRecord !== false]
    );
    const request = result.rows[0];
    await createWorkItems({ db, request, step: steps.rows[0] });
    await db(
      "INSERT INTO platform_approval_events(request_id,company_id,event_type,actor_user_id,metadata) VALUES($1,$2,'submitted',$3,$4::jsonb)",
      [request.id, request.company_id, req.user.id || null, JSON.stringify({ step: steps.rows[0].step_order })]
    );
    await runOutcomeActions({ db, request, process, actions: cfg(process.config).submissionActions, req, event: "approval.submitted" });
    return request;
  } catch (error) {
    if (error.code) throw error;
    console.warn("Platform approval metadata is unavailable; record saved without approval submission.", error);
    return null;
  }
}

export async function decidePlatformApproval({ db, requestId, decision, comment, req }) {
  if (!["approve", "reject"].includes(decision)) return { status: 400, message: "Decision must be approve or reject" };
  const current = await currentRequest({ db, requestId, companyId: req.user.companyId });
  if (!current || current.status !== "pending") return { status: 404, message: "Pending approval request not found" };

  const processConfig = cfg(current.process_config);
  if (decision === "reject" && processConfig.requireCommentOnReject !== false && !String(comment || "").trim()) {
    return { status: 400, message: "A rejection reason is required" };
  }

  const work = await db("SELECT * FROM platform_approval_work_items WHERE request_id=$1 AND step_order=$2 AND status='pending' AND (assigned_to=$3 OR (assigned_to IS NULL AND role_id=$4)) ORDER BY created_at LIMIT 1",[requestId,current.step_order,req.user.id||null,req.user.roleId||null]);
  const item=work.rows[0];
  if(!item) return {status:403,message:"This approval is assigned to another approver"};

  const stepConfig=cfg(current.step_config);
  const approvalRule=String(stepConfig.approvalRule||"FIRST_RESPONSE").toUpperCase();
  const prior = await db("SELECT id FROM platform_approval_actions WHERE request_id=$1 AND step_order=$2 AND actor_user_id=$3 LIMIT 1",[requestId,current.step_order,req.user.id||null]);
  if(prior.rows.length) return {status:409,message:"You have already decided this approval step"};

  await db(
    "INSERT INTO platform_approval_actions (request_id,step_order,actor_user_id,decision,comment) VALUES ($1,$2,$3,$4,$5)",
    [requestId, current.step_order, req.user.id || null, decision, String(comment || "").trim() || null]
  );
  await db(
    "UPDATE platform_approval_work_items SET assigned_to=COALESCE(assigned_to,$1),status=$2,completed_at=NOW(),decision=$3,comment=$4 WHERE id=$5",
    [req.user.id || null, decision === "approve" ? "approved" : "rejected", decision, String(comment || "").trim() || null, item.id]
  );

  const process={id:current.process_id,config:processConfig};
  if(decision==="approve" && approvalRule==="UNANIMOUS") {
    const remaining=await db("SELECT id FROM platform_approval_work_items WHERE request_id=$1 AND step_order=$2 AND status='pending'",[requestId,current.step_order]);
    if(remaining.rows.length) {
      await db("INSERT INTO platform_approval_events(request_id,company_id,event_type,actor_user_id,metadata) VALUES($1,$2,'approver_approved',$3,$4::jsonb)",[requestId,current.company_id,req.user.id||null,JSON.stringify({remaining:remaining.rows.length})]);
      return {status:200,data:{...current,waitingFor:remaining.rows.length}};
    }
  }
  if(decision==="reject" || (decision==="approve" && approvalRule==="FIRST_RESPONSE")) {
    await db("UPDATE platform_approval_work_items SET status='cancelled',completed_at=NOW() WHERE request_id=$1 AND step_order=$2 AND status='pending'",[requestId,current.step_order]);
  }
  if (decision === "reject") {
    const result = await db("UPDATE platform_approval_requests SET status='rejected',locked=false,resolved_at=NOW() WHERE id=$1 RETURNING *", [requestId]);
    await db("INSERT INTO platform_approval_events(request_id,company_id,event_type,actor_user_id,metadata) VALUES($1,$2,'rejected',$3,$4::jsonb)", [requestId,current.company_id,req.user.id||null,JSON.stringify({comment:String(comment||"").trim()||null})]);
    await runOutcomeActions({ db, request: result.rows[0], process, actions: processConfig.finalRejectionActions, req, event: "approval.rejected" });
    return { status: 200, data: result.rows[0] };
  }

  const next = await db("SELECT * FROM platform_approval_steps WHERE process_id=$1 AND step_order>$2 ORDER BY step_order LIMIT 1", [current.process_id, current.step_order]);
  if (next.rows.length) {
    const result = await db("UPDATE platform_approval_requests SET current_step=$1 WHERE id=$2 RETURNING *", [next.rows[0].step_order, requestId]);
    await createWorkItems({ db, request: result.rows[0], step: next.rows[0] });
    await db("INSERT INTO platform_approval_events(request_id,company_id,event_type,actor_user_id,metadata) VALUES($1,$2,'step_approved',$3,$4::jsonb)", [requestId,current.company_id,req.user.id||null,JSON.stringify({fromStep:current.step_order,toStep:next.rows[0].step_order})]);
    return { status: 200, data: result.rows[0] };
  }

  const result = await db("UPDATE platform_approval_requests SET status='approved',locked=false,resolved_at=NOW() WHERE id=$1 RETURNING *", [requestId]);
  await db("INSERT INTO platform_approval_events(request_id,company_id,event_type,actor_user_id,metadata) VALUES($1,$2,'approved',$3,'{}'::jsonb)", [requestId,current.company_id,req.user.id||null]);
  await runOutcomeActions({ db, request: result.rows[0], process, actions: processConfig.finalApprovalActions, req, event: "approval.approved" });
  return { status: 200, data: result.rows[0] };
}

export async function reassignPlatformApproval({ db, requestId, assigneeUserId, comment, req }) {
  const current = await currentRequest({ db, requestId, companyId: req.user.companyId });
  if (!current || current.status !== "pending") return { status: 404, message: "Pending approval request not found" };
  if (cfg(current.process_config).allowReassign === false) return { status: 403, message: "Reassignment is disabled for this approval process" };
  const itemResult = await db("SELECT * FROM platform_approval_work_items WHERE request_id=$1 AND step_order=$2 AND status='pending'", [requestId,current.step_order]);
  const item=itemResult.rows[0];
  if (!item) return { status:409,message:"Pending work item not found" };
  if (item.assigned_to && String(item.assigned_to)!==String(req.user.id)) return {status:403,message:"Only the current approver can reassign this work item"};
  if (!item.assigned_to && String(item.role_id)!==String(req.user.roleId)) return {status:403,message:"You are not eligible to reassign this work item"};
  const target=await db("SELECT id FROM users WHERE id=$1 AND company_id=$2 AND active=TRUE",[assigneeUserId,req.user.companyId]);
  if(!target.rows.length) return {status:400,message:"Choose an active user in this company"};
  await db("UPDATE platform_approval_work_items SET assigned_to=$1,reassigned_from=COALESCE(assigned_to,$2),reassigned_at=NOW() WHERE id=$3",[assigneeUserId,req.user.id||null,item.id]);
  await db("INSERT INTO platform_approval_events(request_id,company_id,event_type,actor_user_id,metadata) VALUES($1,$2,'reassigned',$3,$4::jsonb)",[requestId,current.company_id,req.user.id||null,JSON.stringify({to:assigneeUserId,comment:String(comment||"").trim()||null})]);
  return {status:200,data:{...item,assigned_to:assigneeUserId}};
}

export async function recallPlatformApproval({ db, requestId, comment, req }) {
  const current=await currentRequest({db,requestId,companyId:req.user.companyId});
  if(!current||current.status!=="pending") return {status:404,message:"Pending approval request not found"};
  if(String(current.submitted_by)!==String(req.user.id)) return {status:403,message:"Only the submitter can recall this approval"};
  const decided=await db("SELECT 1 FROM platform_approval_actions WHERE request_id=$1 LIMIT 1",[requestId]);
  if(decided.rows.length) return {status:409,message:"This approval can no longer be recalled because a decision has already been made"};
  const result=await db("UPDATE platform_approval_requests SET status='cancelled',locked=false,resolved_at=NOW() WHERE id=$1 RETURNING *",[requestId]);
  await db("UPDATE platform_approval_work_items SET status='cancelled',completed_at=NOW() WHERE request_id=$1 AND status='pending'",[requestId]);
  await db("INSERT INTO platform_approval_events(request_id,company_id,event_type,actor_user_id,metadata) VALUES($1,$2,'recalled',$3,$4::jsonb)",[requestId,current.company_id,req.user.id||null,JSON.stringify({comment:String(comment||"").trim()||null})]);
  return {status:200,data:result.rows[0]};
}

export async function isPlatformRecordLocked({db,companyId,objectId,recordId}) {
  const result=await db("SELECT id FROM platform_approval_requests WHERE company_id=$1 AND object_id=$2 AND record_id=$3 AND status='pending' AND locked=TRUE LIMIT 1",[companyId,objectId,recordId]);
  return Boolean(result.rows.length);
}
