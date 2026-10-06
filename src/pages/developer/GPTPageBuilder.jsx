import { useState } from 'react'
import CustomPageBuilder from '../settings/Platform/CustomPageBuilder.jsx'

/*
 * GPT Page Builder is a PAGE COMPOSER, not a workflow graph.
 *
 * It deliberately reuses the same metadata-driven CustomPageBuilder and
 * CustomPageRenderer stack used by runtime pages so the builder canvas shows
 * real registered components at their real size. No ReactFlow nodes, edges,
 * handles, or workflow-only canvas semantics belong here.
 */
export default function GPTPageBuilder() {
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  return (
    <div className="gptpb-real-page-builder">
      {error ? <div className="onebuilder-error">{error}</div> : null}
      {message ? <div className="onebuilder-message">{message}</div> : null}
      <CustomPageBuilder
        context="developer"
        onMessage={(value) => {
          setError('')
          setMessage(value || '')
        }}
        onError={(value) => {
          setMessage('')
          setError(value || '')
        }}
      />
    </div>
  )
}
