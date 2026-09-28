import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { checkBackend } from './services/api'
import {
  Bluetooth,
  LockKeyhole,
  Search,
  SlidersHorizontal,
  Wifi,
} from 'lucide-react'

const dockItems = [
  { id: 'finder', label: 'Finder', src: 'https://rdvnui.com/assets/Finder-BnFYQNS_.png', scaled: true },
  { id: 'settings', label: 'Settings', src: 'https://rdvnui.com/assets/Settings-BIHCu_gi.png', scaled: true },
  { id: 'launchpad', label: 'Launchpad', src: 'https://rdvnui.com/assets/Launchpad-wwI6e3wv.png', scaled: true },
  { id: 'jarvis', label: 'Jarvis', src: 'https://rdvnui.com/assets/siri-icon-DMUdF73Y.png', scaled: true },
  { id: 'maps', label: 'Maps', src: 'https://rdvnui.com/assets/Maps-C7aNhhUR.png', scaled: true },
  { id: 'notes', label: 'Notes', src: 'https://rdvnui.com/assets/Notes-fm-2Meh1.png', scaled: true },
]

const trashItem = {
  id: 'trash',
  label: 'Trash',
  src: 'https://rdvnui.com/assets/Trash%20Full-BoE_wJYh.png',
  scaled: false,
}

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

  return (
    <div className="dock-zone">
      <motion.div
        className="dock"
        onMouseMove={(event) => mouseX.set(event.pageX)}
        onMouseLeave={() => mouseX.set(Number.POSITIVE_INFINITY)}
        aria-label="Smart Theme dock"
      >
        {dockItems.map((item) => (
          <DockItem
            key={item.id}
            item={item}
            mouseX={mouseX}
            onActivate={() => onItemOpen?.(item.id)}
          />
        ))}
        <div className="dock-separator" aria-hidden="true" />
        <DockItem
          item={trashItem}
          mouseX={mouseX}
          onActivate={() => onItemOpen?.(trashItem.id)}
        />
      </motion.div>
    </div>
  )
}

function DockItem({ item, mouseX, onActivate }) {
  const ref = useRef(null)

  const distance = useTransform(mouseX, (value) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 }
    return value - bounds.x - bounds.width / 2
  })

  const widthTarget = useTransform(distance, [-150, 0, 150], [40, 100, 40])
  const width = useSpring(widthTarget, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  })

  return (
    <motion.button
      ref={ref}
      type="button"
      className="dock-item"
      style={{ width }}
      onClick={onActivate}
      aria-label={item.label}
    >
      <span className="dock-icon-wrap">
        <img
          className={item.scaled ? 'dock-image dock-image--scaled' : 'dock-image'}
          src={item.src}
          alt=""
          draggable="false"
        />
      </span>
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
    const item = dockItems.find((entry) => entry.id === id) ?? (id === trashItem.id ? trashItem : null)
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
          <button type="button" className="status-button" aria-label="Assistant">
            <img
              className="siri-image"
              src="https://rdvnui.com/assets/siri-icon-DMUdF73Y.png"
              alt=""
              draggable="false"
            />
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

  useEffect(() => {
    checkBackend()
      .then(() => document.documentElement.setAttribute('data-onepos-backend', 'connected'))
      .catch(() => document.documentElement.setAttribute('data-onepos-backend', 'offline'))
  }, [])
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
