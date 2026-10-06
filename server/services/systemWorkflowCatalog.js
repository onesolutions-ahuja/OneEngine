import { readFileSync } from "node:fs";

const definitions = Object.freeze(JSON.parse(readFileSync(new URL("../metadata/system-workflows.json", import.meta.url), "utf8")));

export function systemWorkflowDefinitions() {
  return Array.isArray(definitions) ? definitions : [];
}

export async function ensureSystemWorkflowCatalog({ db, companyId, userId = null }) {
  if (!db || typeof db !== "function" || !companyId) return { created:0, existing:0, removed:0, total:0 };
  const catalog=systemWorkflowDefinitions();
  const current=await db(
    `SELECT id,action,user_modified FROM platform_rules
      WHERE company_id=$1 AND action->>'systemGenerated'='true' AND action->>'systemKey' IS NOT NULL`,
    [companyId]
  );
  const byKey=new Map((current.rows||[]).map((row)=>[String(row.action?.systemKey||""),row]));
  const valid=catalog.map((definition)=>String(definition.systemKey||definition.action?.systemKey||"")).filter(Boolean);
  const stale=await db(
    `DELETE FROM platform_rules
      WHERE company_id=$1 AND action->>'systemGenerated'='true' AND action->>'systemKey' IS NOT NULL
        AND COALESCE(user_modified,FALSE)=FALSE
        AND NOT ((action->>'systemKey')=ANY($2::text[]))
      RETURNING id`,
    [companyId,valid]
  );
  let created=0;
  for(const definition of catalog){
    const key=String(definition.systemKey||definition.action?.systemKey||"");
    if(!key) continue;
    const row=byKey.get(key);
    if(row){
      if(row.user_modified!==true) await db(
        `UPDATE platform_rules SET name=$1,trigger_key=$2,conditions=$3::jsonb,action=$4::jsonb,
          active=TRUE,lifecycle_status='ACTIVE',updated_at=NOW()
          WHERE id=$5 AND company_id=$6 AND COALESCE(user_modified,FALSE)=FALSE`,
        [definition.name,definition.triggerKey||"manual",JSON.stringify(definition.conditions||[]),JSON.stringify(definition.action||{}),row.id,companyId]
      );
      continue;
    }
    await db(
      `INSERT INTO platform_rules
        (object_id,name,trigger_key,conditions,action,active,lifecycle_status,version,active_version,company_id,created_by,managed,package_required,user_modified)
       VALUES(NULL,$1,$2,$3::jsonb,$4::jsonb,TRUE,'ACTIVE',1,1,$5,$6,TRUE,FALSE,FALSE)`,
      [definition.name,definition.triggerKey||"manual",JSON.stringify(definition.conditions||[]),JSON.stringify(definition.action||{}),companyId,userId]
    );
    created+=1;
  }
  return {created,existing:Math.max(0,byKey.size-(stale.rowCount||0)),removed:stale.rowCount||0,total:catalog.length};
}
