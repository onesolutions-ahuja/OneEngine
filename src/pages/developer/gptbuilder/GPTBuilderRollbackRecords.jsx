import { useEffect } from 'react'

export function rollbackRecordsConfigErrors() {
  return []
}

export function rollbackRecordsRuntimeAction(instance) {
  return {
    id: instance.id,
    key: 'ROLLBACK_RECORDS',
    label: instance.label,
    apiName: instance.apiName,
    description: instance.description || '',
  }
}

export default function GPTBuilderRollbackRecords({ onConfiguredChange }) {
  useEffect(() => { onConfiguredChange?.(true, []) }, [onConfiguredChange])
  return <div className="gptb-gr">
    <section>
      <h3>Roll Back Records</h3>
      <p className="gptb-help-text">Rolls back pending record changes made in the current Screen Flow transaction.</p>
    </section>
  </div>
}
