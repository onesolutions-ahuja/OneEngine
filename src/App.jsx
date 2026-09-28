import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  CloudSun,
  Folder,
  LockKeyhole,
  MessageCircle,
  Music2,
  Search,
  Settings,
} from 'lucide-react'

const dockItems = [
  { id: 'finder', label: 'Files', icon: Folder, tint: 'blue' },
  { id: 'search', label: 'Search', icon: Search, tint: 'cyan' },
  { id: 'messages', label: 'Messages', icon: MessageCircle, tint: 'green' },
  { id: 'weather', label: 'Weather', icon: CloudSun, tint: 'sky' },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays, tint: 'red' },
  { id: 'music', label: 'Music', icon: Music2, tint: 'pink' },
  { id: 'settings', label: 'Settings', icon: Settings, tint: 'silver' },
]

function useClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  return now
}

function Dock({ onItemOpen }) {
  const [bouncing, setBouncing] = useState(null)
  const dockRef = useRef(null)
  const itemRefs = useRef([])
  const frameRef = useRef(null)

  const applyMagnification = (clientX) => {
    const dock = dockRef.current
    if (!dock) return

    const dockRect = dock.getBoundingClientRect()

    itemRefs.current.forEach((item) => {
      if (!item) return

      const center = dockRect.left + item.offsetLeft + item.offsetWidth / 2
      const signedDistance = center - clientX
      const distance = Math.abs(signedDistance)
      const radius = 128
      const normalized = Math.max(0, 1 - distance / radius)
      const influence = normalized * normalized * (3 - 2 * normalized)

      const scale = 1 + influence * 0.66
      const lift = influence * 21
      const push = Math.sign(signedDistance || 1) * influence * 18

      item.style.setProperty('--dock-scale', scale.toFixed(3))
      item.style.setProperty('--dock-lift', `${lift.toFixed(2)}px`)
      item.style.setProperty('--dock-push', `${push.toFixed(2)}px`)
    })
  }

  const resetMagnification = () => {
    itemRefs.current.forEach((item) => {
      if (!item) return
      item.style.setProperty('--dock-scale', '1')
      item.style.setProperty('--dock-lift', '0px')
      item.style.setProperty('--dock-push', '0px')
    })
  }

  const handlePointerMove = (event) => {
    const clientX = event.clientX
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => applyMagnification(clientX))
  }

  const handlePointerLeave = () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    resetMagnification()
  }

  useEffect(() => {
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  const activate = (id) => {
    setBouncing(id)
    window.setTimeout(() => setBouncing(null), 360)
    onItemOpen?.(id)
  }

  return (
    <div className="dock-zone">
      <div
        className="dock"
        ref={dockRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        aria-label="Smart Theme dock"
      >
        {dockItems.map(({ id, label, icon: Icon, tint }, index) => (
          <DockItem
            key={id}
            label={label}
            Icon={Icon}
            tint={tint}
            bouncing={bouncing === id}
            setRef={(node) => {
              itemRefs.current[index] = node
            }}
            onActivate={() => activate(id)}
          />
        ))}
      </div>
    </div>
  )
}

function DockItem({ label, Icon, tint, bouncing, setRef, onActivate }) {
  return (
    <button
      ref={setRef}
      type="button"
      className={`dock-item ${bouncing ? 'is-bouncing' : ''}`}
      onClick={onActivate}
      aria-label={label}
    >
      <span className="dock-tooltip">{label}</span>
      <span className={`dock-icon dock-icon--${tint}`}>
        <Icon size={30} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="dock-dot" aria-hidden="true" />
    </button>
  )
}

function LockScreen({ onUnlock }) {
  const now = useClock()
  const time = useMemo(
    () =>
      new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(now),
    [now],
  )
  const date = useMemo(
    () =>
      new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(now),
    [now],
  )

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Enter' || event.key === ' ') onUnlock()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onUnlock])

  return (
    <main className="screen lock-screen">
      <div className="wallpaper wallpaper--lock" />
      <div className="lock-vignette" />
      <section className="lock-content" aria-label="Lock screen">
        <div className="lock-date">{date}</div>
        <div className="lock-time">{time}</div>

        <button type="button" className="profile-button" onClick={onUnlock}>
          <span className="profile-avatar">S</span>
          <span className="profile-name">Smart Theme</span>
          <span className="unlock-hint">Click to unlock</span>
        </button>
      </section>

      <button type="button" className="lock-action" onClick={onUnlock}>
        <LockKeyhole size={17} />
        Unlock
      </button>
    </main>
  )
}

function Desktop({ onLock }) {
  const [message, setMessage] = useState('Hello.')
  const now = useClock()

  const dateTime = useMemo(
    () =>
      new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(now),
    [now],
  )

  const openItem = (id) => {
    const item = dockItems.find((entry) => entry.id === id)
    setMessage(`${item?.label ?? 'App'} clicked — component wiring comes next.`)
  }

  return (
    <main className="screen desktop-screen">
      <div className="wallpaper wallpaper--desktop" />

      <header className="demo-menubar">
        <button type="button" className="brand-chip" onClick={() => setMessage('Hello.')}>
          Smart Theme
        </button>
        <div className="menubar-spacer" />
        <button type="button" className="menubar-button" onClick={onLock}>
          <LockKeyhole size={14} />
          Lock
        </button>
        <span className="menubar-time">{dateTime}</span>
      </header>

      <section className="hello-stage">
        <p className="eyebrow">SMART THEME</p>
        <h1>{message}</h1>
        <p className="hello-subtitle">
          Clean macOS-inspired UI foundation, built independently for onePOS.
        </p>
      </section>

      <Dock onItemOpen={openItem} />
    </main>
  )
}

export default function App() {
  const [locked, setLocked] = useState(true)
  const [transitioning, setTransitioning] = useState(false)

  const unlock = () => {
    if (transitioning) return
    setTransitioning(true)
    window.setTimeout(() => {
      setLocked(false)
      setTransitioning(false)
    }, 320)
  }

  const lock = () => {
    if (transitioning) return
    setTransitioning(true)
    window.setTimeout(() => {
      setLocked(true)
      setTransitioning(false)
    }, 260)
  }

  return (
    <div className={`app-shell ${transitioning ? 'is-transitioning' : ''}`}>
      {locked ? <LockScreen onUnlock={unlock} /> : <Desktop onLock={lock} />}
    </div>
  )
}
