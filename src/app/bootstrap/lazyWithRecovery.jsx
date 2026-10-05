import { Component, lazy } from 'react'

const CHUNK_RETRY_PARAM = '_oe_chunk_retry'
const CHUNK_LOAD_RE = /failed to fetch dynamically imported module|importing a module script failed|loading chunk .* failed|error loading dynamically imported module|module script/i

function isChunkLoadFailure(error) {
  return CHUNK_LOAD_RE.test(String(error?.message || error || ''))
}

function clearChunkRetryMarker() {
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has(CHUNK_RETRY_PARAM)) return
    url.searchParams.delete(CHUNK_RETRY_PARAM)
    window.history.replaceState(window.history.state, '', url.toString())
  } catch {}
}

function lazyWithRecovery(loader) {
  return lazy(async () => {
    try {
      const module = await loader()
      clearChunkRetryMarker()
      return module
    } catch (error) {
      if (isChunkLoadFailure(error)) {
        try {
          const url = new URL(window.location.href)
          if (!url.searchParams.has(CHUNK_RETRY_PARAM)) {
            url.searchParams.set(CHUNK_RETRY_PARAM, Date.now().toString())
            window.location.replace(url.toString())
            return new Promise(() => {})
          }
        } catch {}
      }
      throw error
    }
  })
}

class LazyLoadBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('Route render failed', error)
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  retry = () => {
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete(CHUNK_RETRY_PARAM)
      url.searchParams.set('_refresh', Date.now().toString())
      window.location.replace(url.toString())
    } catch {
      window.location.reload()
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    const chunkFailure = isChunkLoadFailure(this.state.error)
    const code = chunkFailure ? 'OEFL101' : 'OEFR101'
    const message = chunkFailure ? 'Unable to load this page.' : 'This screen could not be displayed.'
    return (
      <div className="route-loading" role="alert">
        <span>{message} <strong>Error {code}</strong></span>
        <button type="button" onClick={this.retry}>Retry</button>
      </div>
    )
  }
}


export { LazyLoadBoundary, lazyWithRecovery }
