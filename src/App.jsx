import { Suspense, useEffect, useState } from 'react'
import { ensureActingCompanyContext, hasSession, logout } from './services/api'
import { readRoute } from './navigation/routes'
import { LazyLoadBoundary, lazyWithRecovery } from './navigation/lazyRuntime.jsx'
import { CompanyContextLoading, LockScreen } from './components/shell/LoginShell'
import DesktopShell from './components/shell/DesktopShell.jsx'

const CustomerDisplay = lazyWithRecovery(() => import('./pages/till/CustomerDisplay'))
const PublicAppointmentBookingPage = lazyWithRecovery(() => import('./pages/assistant/PublicAppointmentBookingPage'))
const ScreenFlowRuntimePage = lazyWithRecovery(() => import('./pages/flow/ScreenFlowRuntimePage'))
const OneKioskPage = lazyWithRecovery(() => import('./pages/kiosk/OneKioskPage'))
const OneKioskDisplayPage = lazyWithRecovery(() => import('./pages/kiosk/OneKioskDisplayPage'))

function PublicRuntime({ route }) {
  if (route.app === 'customer-display') {
    return (
      <LazyLoadBoundary>
        <Suspense fallback={<div className="route-loading" role="status">Loading display…</div>}>
          <CustomerDisplay />
        </Suspense>
      </LazyLoadBoundary>
    )
  }

  if (route.app === 'flow-runtime') {
    return (
      <LazyLoadBoundary>
        <Suspense fallback={<div className="route-loading" role="status">Loading flow…</div>}>
          <ScreenFlowRuntimePage sessionId={route.sessionId} />
        </Suspense>
      </LazyLoadBoundary>
    )
  }

  if (route.app === 'public-assistant-booking') {
    return (
      <LazyLoadBoundary>
        <Suspense fallback={<div className="route-loading" role="status">Loading booking…</div>}>
          <PublicAppointmentBookingPage token={route.token} />
        </Suspense>
      </LazyLoadBoundary>
    )
  }

  if (route.app === 'kiosk-runtime') {
    return (
      <LazyLoadBoundary>
        <Suspense fallback={<div className="route-loading" role="status">Loading kiosk…</div>}>
          <OneKioskPage publicMode />
        </Suspense>
      </LazyLoadBoundary>
    )
  }

  if (route.app === 'kiosk-display') {
    return (
      <LazyLoadBoundary>
        <Suspense fallback={<div className="route-loading" role="status">Loading collection display…</div>}>
          <OneKioskDisplayPage />
        </Suspense>
      </LazyLoadBoundary>
    )
  }

  return null
}

export default function App() {
  const route = readRoute()
  const publicRuntime = PublicRuntime({ route })
  if (publicRuntime) return publicRuntime

  const [locked, setLocked] = useState(() => !hasSession())
  const [sessionContextReady, setSessionContextReady] = useState(() => !hasSession())
  const [pendingUnlock, setPendingUnlock] = useState(false)
  const [transitioning, setTransitioning] = useState(false)

  useEffect(() => {
    if (!hasSession()) {
      setSessionContextReady(true)
      return
    }

    let live = true
    setSessionContextReady(false)
    const bootstrapTimeout = window.setTimeout(() => {
      if (live) setSessionContextReady(true)
    }, 15000)

    ensureActingCompanyContext()
      .catch(() => '')
      .finally(() => {
        window.clearTimeout(bootstrapTimeout)
        if (live) setSessionContextReady(true)
      })

    return () => {
      live = false
      window.clearTimeout(bootstrapTimeout)
    }
  }, [])

  const unlock = () => {
    if (transitioning || pendingUnlock) return
    setSessionContextReady(true)
    setPendingUnlock(true)
    setTransitioning(true)

    window.setTimeout(() => {
      setLocked(false)
      setPendingUnlock(false)
      setTransitioning(false)
    }, 180)
  }

  const lock = () => {
    if (transitioning) return
    setTransitioning(true)
    window.setTimeout(() => {
      setLocked(true)
      setTransitioning(false)
    }, 260)
  }

  const signOut = () => {
    logout()
    setLocked(true)
  }

  return (
    <div className={`app-shell ${transitioning ? 'is-transitioning' : ''}`}>
      {locked ? (
        pendingUnlock && !sessionContextReady
          ? <CompanyContextLoading />
          : <LockScreen onUnlock={unlock} onSignOut={signOut} preparing={pendingUnlock && !sessionContextReady} />
      ) : !sessionContextReady ? (
        <CompanyContextLoading />
      ) : (
        <DesktopShell onLock={lock} onSignOut={signOut} />
      )}
    </div>
  )
}
