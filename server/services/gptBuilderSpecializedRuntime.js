import { executeWorkflowActions } from "./platformWorkflow.js";

const cfg=(value)=>value&&typeof value==="object"?value:{};
export function compileApprovalDefinition(action={}){
  const elements=Array.isArray(action.gptBuilderElements)?action.gptBuilderElements:[];
  const stages=elements.filter(e=>e.key==="approval_stage");
  const steps=elements.filter(e=>["approval_step","approval_background_step"].includes(e.key));
  return { stages:stages.map(e=>({id:e.id,label:e.label,apiName:e.apiName,...cfg(e.config)})), steps:steps.map((e,index)=>({id:e.id,label:e.label,apiName:e.apiName,step_order:index+1,kind:e.key==="approval_background_step"?"background":"approval",...cfg(e.config)})) };
}
export async function materializeApprovalFlow({db,rule,companyId,userId=null}){
  const compiled=compileApprovalDefinition(rule?.action||{});
  if(!compiled.steps.length)return null;
  const objectId=rule.object_id||null;
  const process=await db(`INSERT INTO platform_approval_processes(company_id,object_id,name,active,conditions,config,created_by)
    VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)
    ON CONFLICT (company_id,name) DO UPDATE SET object_id=EXCLUDED.object_id,active=EXCLUDED.active,conditions=EXCLUDED.conditions,config=EXCLUDED.config,updated_at=NOW()
    RETURNING *`,[companyId,objectId,rule.name,rule.active===true,JSON.stringify(rule.conditions||[]),JSON.stringify({sourceFlowId:rule.id,stages:compiled.stages,lockRecord:true}),userId]);
  await db("DELETE FROM platform_approval_steps WHERE process_id=$1",[process.rows[0].id]);
  for(const step of compiled.steps){
    await db(`INSERT INTO platform_approval_steps(process_id,step_order,label,assignment_type,assignment_config,config)
      VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)`,[process.rows[0].id,step.step_order,step.label,step.assigneeType||step.assignmentType||"user",JSON.stringify({userId:step.assigneeId||null,groupId:step.assigneeId||null}),JSON.stringify(step)]);
  }
  return process.rows[0];
}

export function compileOrchestrationDefinition(action={}){
 const elements=Array.isArray(action.gptBuilderElements)?action.gptBuilderElements:[];
 return elements.filter(e=>["orchestration_stage","orchestration_interactive_step","orchestration_background_step"].includes(e.key)).map((e,index)=>({id:e.id,key:e.key,label:e.label,apiName:e.apiName,order:index+1,...cfg(e.config)}));
}
export async function executeOrchestrationFlow({db,rule,companyId,req,record,object,workflowVariables={},runId=null}){
 const definition=compileOrchestrationDefinition(rule?.action||{});
 const results=[];
 for(const item of definition){
   if(item.key==="orchestration_stage"){workflowVariables.variables=workflowVariables.variables||{};workflowVariables.variables.__orchestrationStage={id:item.id,label:item.label,apiName:item.apiName,order:item.order};results.push({status:"completed",stage:item.apiName});continue}
   if(item.key==="orchestration_interactive_step"){
     const action={id:item.id,key:"SCREEN",screen:{label:item.label,apiName:item.apiName,components:[]},allowBack:false,allowNext:true,allowFinish:true,showFooter:true};
     const value=await executeWorkflowActions({actions:[action],db,companyId,req,record,object,workflowVariables,runId,allActions:[action]});results.push(...value);if(value.some(v=>v?.status==="waiting"))break;continue;
   }
   if(item.key==="orchestration_background_step"){
     const action=item.stepType==="action"?{id:item.id,key:item.actionKey,...(item.actionInputs||{})}:{id:item.id,key:"RUN_SUBFLOW",workflowId:item.flowId||item.selectedFlow};
     const value=await executeWorkflowActions({actions:[action],db,companyId,req,record,object,workflowVariables,runId,allActions:[action]});results.push(...value);if(value.some(v=>["waiting","failed"].includes(v?.status)))break;
   }
 }
 return results;
}
