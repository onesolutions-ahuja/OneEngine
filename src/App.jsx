import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { checkBackend } from './services/api'
import {
  Bluetooth,
  LockKeyhole,
  Search,
  SlidersHorizontal,
  Wifi,
  Bell,
  Volume2,
  Moon,
  Clock3,
  Settings2,
  CircleUserRound,
  Accessibility,
  Shield,
  Monitor,
  Image,
  BatteryCharging,
  Users,
  KeyRound,
  Globe2,
  Keyboard,
  MousePointer2,
  Printer,
  ChevronRight,
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


const settingsGroups = [
  [
    { key: 'wifi', label: 'Wi-Fi', icon: Wifi, tone: 'blue' },
    { key: 'bluetooth', label: 'Bluetooth', icon: Bluetooth, tone: 'blue' },
    { key: 'network', label: 'Network', icon: Globe2, tone: 'blue' },
  ],
  [
    { key: 'notifications', label: 'Notifications', icon: Bell, tone: 'red' },
    { key: 'sounds', label: 'Sounds', icon: Volume2, tone: 'pink' },
    { key: 'focus', label: 'Focus', icon: Moon, tone: 'purple' },
    { key: 'screen-time', label: 'Screen Time', icon: Clock3, tone: 'purple' },
  ],
  [
    { key: 'general', label: 'General', icon: Settings2, tone: 'gray' },
    { key: 'appearance', label: 'Appearance', icon: CircleUserRound, tone: 'black' },
    { key: 'accessibility', label: 'Accessibility', icon: Accessibility, tone: 'blue' },
    { key: 'control-center', label: 'Control Center', icon: SlidersHorizontal, tone: 'gray' },
    { key: 'privacy', label: 'Privacy & Security', icon: Shield, tone: 'blue' },
  ],
  [
    { key: 'desktop-dock', label: 'Desktop & Dock', icon: Monitor, tone: 'black' },
    { key: 'display', label: 'Display', icon: Monitor, tone: 'blue' },
    { key: 'wallpaper', label: 'Wallpaper', icon: Image, tone: 'cyan' },
    { key: 'energy', label: 'Energy Saver', icon: BatteryCharging, tone: 'orange' },
  ],
  [
    { key: 'users', label: 'Users & Groups', icon: Users, tone: 'blue' },
    { key: 'passwords', label: 'Passwords', icon: KeyRound, tone: 'gray' },
    { key: 'internet', label: 'Internet Accounts', icon: Globe2, tone: 'blue' },
  ],
  [
    { key: 'keyboard', label: 'Keyboard', icon: Keyboard, tone: 'gray' },
    { key: 'mouse', label: 'Mouse', icon: MousePointer2, tone: 'gray' },
    { key: 'printers', label: 'Printers & Scanners', icon: Printer, tone: 'gray' },
  ],
]

function SettingsPage() {
  const [active, setActive] = useState('appearance')
  const [query, setQuery] = useState('')

  const visibleGroups = settingsGroups
    .map((group) => group.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())))
    .filter((group) => group.length)

  const current = settingsGroups.flat().find((item) => item.key === active)

  return (
    <section className="settings-page">
      <aside className="settings-sidebar">
        <div className="settings-window-title">Settings</div>
        <label className="settings-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
          />
        </label>

        <div className="settings-profile">
          <div className="settings-avatar">O</div>
          <div>
            <strong>One Solutions</strong>
            <span>User Account</span>
          </div>
        </div>

        <div className="settings-nav">
          {visibleGroups.map((group, groupIndex) => (
            <div className="settings-group" key={groupIndex}>
              {group.map(({ key, label, icon: Icon, tone }) => (
                <button
                  key={key}
                  type="button"
                  className={`settings-nav-item ${active === key ? 'is-active' : ''}`}
                  onClick={() => setActive(key)}
                >
                  <span className={`settings-nav-icon settings-nav-icon--${tone}`}>
                    <Icon size={16} strokeWidth={2.1} />
                  </span>
                  <span>{label}</span>
                  <ChevronRight size={14} className="settings-chevron" />
                </button>
              ))}
            </div>
          ))}
        </div>
      </aside>

      <div className="settings-content">
        <div className="settings-content-header">
          <h2>{current?.label ?? 'Settings'}</h2>
        </div>

        {active === 'appearance' ? (
          <div className="settings-content-body">
            <div className="settings-card">
              <div className="settings-row">
                <div>
                  <strong>Appearance</strong>
                  <p>Choose how One Solutions looks across your workspace.</p>
                </div>
                <div className="appearance-options">
                  <button className="appearance-tile appearance-tile--light" type="button"><span /></button>
                  <button className="appearance-tile appearance-tile--dark" type="button"><span /></button>
                  <button className="appearance-tile appearance-tile--auto" type="button"><span /></button>
                </div>
              </div>
              <div className="settings-row">
                <strong>Accent color</strong>
                <div className="accent-dots">
                  {['multi','blue','purple','pink','red','orange','yellow','green','gray'].map((name) => (
                    <button key={name} type="button" className={`accent-dot accent-dot--${name}`} aria-label={name} />
                  ))}
                </div>
              </div>
              <div className="settings-row">
                <strong>Sidebar icon size</strong>
                <select defaultValue="Medium"><option>Small</option><option>Medium</option><option>Large</option></select>
              </div>
              <div className="settings-row">
                <strong>Allow wallpaper tinting in windows</strong>
                <button type="button" className="mac-switch is-on"><span /></button>
              </div>
            </div>
          </div>
        ) : (
          <div className="settings-content-body">
            <div className="settings-card settings-placeholder">
              <span className={`settings-nav-icon settings-nav-icon--${current?.tone ?? 'gray'} settings-placeholder-icon`}>
                {current?.icon ? (() => { const Icon = current.icon; return <Icon size={28} /> })() : null}
              </span>
              <h3>{current?.label}</h3>
              <p>This section is ready for onePOS settings wiring.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function Desktop({ onLock }) {
  const [message, setMessage] = useState('Hello.')
  const [activeApp, setActiveApp] = useState('home')
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
    if (id === 'settings') {
      setActiveApp('settings')
      return
    }
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
            onClick={() => { setMessage('Hello.'); setActiveApp('home') }}
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

      {activeApp === 'settings' ? (
        <SettingsPage />
      ) : (
        <section className="hello-stage">
          <p className="eyebrow">SMART THEME</p>
          <h1>{message}</h1>
          <p className="hello-subtitle">
            Clean macOS-inspired UI foundation, built independently for onePOS.
          </p>
        </section>
      )}

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
