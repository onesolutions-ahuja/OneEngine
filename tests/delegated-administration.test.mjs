import test from 'node:test'
import assert from 'node:assert/strict'
import { delegatedAdminContext, delegatedRoleAssignable, delegatedUserAllowed } from '../server/services/delegatedAdministration.js'

test('non-delegated users retain ordinary RBAC scope',async()=>{
  const db=async(sql)=>{
    if(sql.includes('delegated_admin_groups'))return {rows:[]}
    throw new Error('unexpected query')
  }
  const context=await delegatedAdminContext(db,{companyId:'c',userId:'u'})
  assert.equal(context.delegated,false)
  assert.equal((await delegatedRoleAssignable(db,{companyId:'c',actorUserId:'u',roleId:'r'})).allowed,true)
})

test('delegated admin can manage only scoped users and assignable roles',async()=>{
  const db=async(sql,params)=>{
    if(sql.includes('FROM delegated_admin_groups'))return {rows:[{id:'g1',name:'Store Admins'}]}
    if(sql.includes('WITH RECURSIVE roots'))return {rows:[{id:'r1'},{id:'r2'}]}
    if(sql.includes('delegated_admin_assignable_roles'))return {rows:[{role_id:'r2'}]}
    if(sql.includes('SELECT role_id FROM users'))return {rows:[{role_id:params[0]==='inside'?'r1':'r9'}]}
    throw new Error('unexpected query '+sql)
  }
  assert.equal((await delegatedUserAllowed(db,{companyId:'c',actorUserId:'admin',targetUserId:'inside'})).allowed,true)
  assert.equal((await delegatedUserAllowed(db,{companyId:'c',actorUserId:'admin',targetUserId:'outside'})).allowed,false)
  assert.equal((await delegatedRoleAssignable(db,{companyId:'c',actorUserId:'admin',roleId:'r2'})).allowed,true)
  assert.equal((await delegatedRoleAssignable(db,{companyId:'c',actorUserId:'admin',roleId:'r1'})).allowed,false)
})
