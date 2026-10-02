export async function delegatedAdminContext(db,{companyId,userId}){
  const groups=await db(`SELECT g.id,g.name,g.allow_login_access
    FROM delegated_admin_groups g JOIN delegated_admin_members m ON m.group_id=g.id AND m.company_id=g.company_id
    WHERE g.company_id=$1 AND m.user_id=$2 AND g.active=TRUE`,[companyId,userId]);
  if(!groups.rows.length)return {delegated:false,groupIds:[],scopedRoleIds:[],assignableRoleIds:[]};
  const groupIds=groups.rows.map(g=>g.id);
  const scoped=await db(`WITH RECURSIVE roots AS (
      SELECT role_id FROM delegated_admin_role_scopes WHERE company_id=$1 AND group_id=ANY($2::uuid[])
    ), tree AS (
      SELECT r.id,r.parent_role_id FROM roles r JOIN roots x ON x.role_id=r.id WHERE r.company_id=$1
      UNION
      SELECT child.id,child.parent_role_id FROM roles child JOIN tree t ON child.parent_role_id=t.id WHERE child.company_id=$1
    ) SELECT DISTINCT id FROM tree`,[companyId,groupIds]);
  const assignable=await db("SELECT DISTINCT role_id FROM delegated_admin_assignable_roles WHERE company_id=$1 AND group_id=ANY($2::uuid[])",[companyId,groupIds]);
  return {delegated:true,groupIds,scopedRoleIds:scoped.rows.map(r=>String(r.id)),assignableRoleIds:assignable.rows.map(r=>String(r.role_id)),groups:groups.rows};
}

export async function delegatedUserAllowed(db,{companyId,actorUserId,targetUserId}){
  const ctx=await delegatedAdminContext(db,{companyId,userId:actorUserId});
  if(!ctx.delegated)return {allowed:true,context:ctx};
  const target=await db("SELECT role_id FROM users WHERE id=$1 AND company_id=$2",[targetUserId,companyId]);
  if(!target.rows.length)return {allowed:false,notFound:true,context:ctx};
  return {allowed:ctx.scopedRoleIds.includes(String(target.rows[0].role_id||"")),context:ctx};
}

export async function delegatedRoleAssignable(db,{companyId,actorUserId,roleId}){
  const ctx=await delegatedAdminContext(db,{companyId,userId:actorUserId});
  if(!ctx.delegated)return {allowed:true,context:ctx};
  return {allowed:ctx.assignableRoleIds.includes(String(roleId||"")),context:ctx};
}
