export const FLOW_CAPABILITIES = Object.freeze({
  screen:{start:'invoked',screens:true,waits:false},
  record:{start:'record',screens:false,waits:false},
  schedule:{start:'schedule',screens:false,waits:true},
  platform_event:{start:'platform_event',screens:false,waits:true},
  autolaunched:{start:'invoked',screens:false,waits:true},
  automation_event:{start:'automation_event',screens:false,waits:true},
  user_provisioning:{start:'user_provisioning',screens:true,waits:false},
  contact_request:{start:'contact_request',screens:true,waits:false},
  cart_async:{start:'invoked',screens:false,waits:true},
  recommendation_strategy:{start:'invoked',screens:false,waits:false},
  autolaunched_orchestration:{start:'invoked',screens:false,waits:true},
  record_orchestration:{start:'record',screens:false,waits:true},
  evaluation:{start:'invoked',screens:false,waits:false},
  cms_orchestration:{start:'invoked',screens:false,waits:true},
  individual_linking:{start:'invoked',screens:true,waits:false},
  autolaunched_approval:{start:'invoked',screens:false,waits:true},
  record_approval:{start:'record',screens:false,waits:true},
  identity_registration:{start:'identity_provider',screens:false,waits:false},
})

export function flowElementAllowed(flowKey, elementKey) {
  const capability = FLOW_CAPABILITIES[flowKey] || {}
  if (elementKey === 'screen') return capability.screens === true
  if (['wait_conditions','wait_amount','wait_date'].includes(elementKey)) return capability.waits === true
  if (elementKey === 'rollback') return capability.screens === true
  return true
}
