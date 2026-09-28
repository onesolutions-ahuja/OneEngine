import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import {
  CalendarDays,
  CloudSun,
  Folder,
  Bluetooth,
  LockKeyhole,
  MessageCircle,
  Music2,
  Search,
  Settings,
  SlidersHorizontal,
  Wifi,
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
  const mouseX = useMotionValue(Number.POSITIVE_INFINITY)
  const [bouncing, setBouncing] = useState(null)

  const activate = (id) => {
    setBouncing(id)
    window.setTimeout(() => setBouncing(null), 300)
    onItemOpen?.(id)
  }

  return (
    <div className="dock-zone">
      <motion.div
        className="dock"
        onMouseMove={(event) => mouseX.set(event.pageX)}
        onMouseLeave={() => mouseX.set(Number.POSITIVE_INFINITY)}
        aria-label="Smart Theme dock"
      >
        {dockItems.map(({ id, label, icon: Icon, tint }) => (
          <DockItem
            key={id}
            label={label}
            Icon={Icon}
            tint={tint}
            mouseX={mouseX}
            bouncing={bouncing === id}
            onActivate={() => activate(id)}
          />
        ))}
      </motion.div>
    </div>
  )
}

function DockItem({ label, Icon, tint, mouseX, bouncing, onActivate }) {
  const ref = useRef(null)

  const distance = useTransform(mouseX, (value) => {
    const bounds = ref.current?.getBoundingClientRect()
    if (!bounds) return Number.POSITIVE_INFINITY
    return value - bounds.x - bounds.width / 2
  })

  const targetWidth = useTransform(distance, [-150, 0, 150], [46, 98, 46])
  const width = useSpring(targetWidth, {
    mass: 0.08,
    stiffness: 220,
    damping: 18,
  })

  const targetLift = useTransform(distance, [-150, 0, 150], [0, -17, 0])
  const y = useSpring(targetLift, {
    mass: 0.08,
    stiffness: 220,
    damping: 18,
  })

  const targetScale = useTransform(distance, [-150, 0, 150], [1, 1.24, 1])
  const scale = useSpring(targetScale, {
    mass: 0.08,
    stiffness: 220,
    damping: 18,
  })

  return (
    <motion.button
      ref={ref}
      type="button"
      className={`dock-item ${bouncing ? 'is-bouncing' : ''}`}
      style={{ width }}
      onClick={onActivate}
      aria-label={label}
    >
      <span className="dock-tooltip">{label}</span>
      <motion.span
        className={`dock-icon dock-icon--${tint}`}
        style={{ y, scale }}
      >
        <Icon size={30} strokeWidth={1.8} aria-hidden="true" />
      </motion.span>
      <span className="dock-dot" aria-hidden="true" />
    </motion.button>
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
        <div className="menubar-left">
          <button
            type="button"
            className="brand-chip one-brand"
            onClick={() => setMessage('Hello.')}
            aria-label="One Solutions"
          >
            <span className="one-logo-mark" aria-hidden="true">O</span>
            <span className="one-logo-text" aria-hidden="true">ne</span>
          </button>

          <button type="button" className="menu-text menu-text--strong">Finder</button>
          <button type="button" className="menu-text">File</button>
          <button type="button" className="menu-text">Edit</button>
          <button type="button" className="menu-text">View</button>
          <button type="button" className="menu-text">Go</button>
          <button type="button" className="menu-text">Window</button>
          <button type="button" className="menu-text">Help</button>
        </div>

        <div className="menubar-spacer" />

        <div className="menubar-right">
          <button type="button" className="status-button" aria-label="Search">
            <Search size={18} strokeWidth={2.1} />
          </button>
          <button type="button" className="status-button" aria-label="Wi-Fi">
            <Wifi size={17} strokeWidth={2.1} />
          </button>
          <button type="button" className="status-button" aria-label="Bluetooth">
            <Bluetooth size={17} strokeWidth={2.1} />
          </button>
          <button type="button" className="status-button" aria-label="Control Center">
            <SlidersHorizontal size={18} strokeWidth={2.2} />
          </button>
          <button type="button" className="status-button assistant-orb" aria-label="Assistant">
            <span aria-hidden="true" />
          </button>
          <button type="button" className="menubar-time-button">
            {dateTime}
          </button>
        </div>
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
