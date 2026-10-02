import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import JarvisOrb, { ORB_STATES } from '../jarvis/JarvisOrb'
import JarvisPanel from '../jarvis/JarvisPanel'
import { ChevronDown, ChevronUp } from 'lucide-react'

const dockAsset = (name) => `${import.meta.env.BASE_URL || '/'}icons/dock/${name}.svg`

export const dockItems = [
  { id: 'launchpad', label: 'Launcher', src: dockAsset('launcher') },
  { id: 'dashboard', label: 'Dashboard', src: dockAsset('dashboard') },
  { id: 'store', label: 'oneStore', src: dockAsset('store') },
  { id: 'builder', label: 'OneDeveloper', src: dockAsset('developer') },
  { id: 'contacts', label: 'Contacts', src: dockAsset('contacts') },
  { id: 'till', label: 'OneTill', src: dockAsset('till') },
  { id: 'settings', label: 'Settings', src: dockAsset('settings') },
]

const mobileDockItems = [
  { id: 'store', label: 'oneStore', src: dockAsset('store') },
  { id: 'dashboard', label: 'Dashboard', src: dockAsset('dashboard') },
  { id: 'till', label: 'OneTill', src: dockAsset('till') },
  { id: 'workspace', label: 'Workspace', src: dockAsset('contacts') },
]

export function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

export function MenuBarClock() {
  const now = useClock()
  const dateTime = useMemo(() => new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(now), [now])
  return <button type="button" className="menubar-time-button">{dateTime}</button>
}

function DockItem({ item, mouseX, onActivate }) {
  const ref = useRef(null)
  const distance = useTransform(mouseX, (value) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 }
    return value - bounds.x - bounds.width / 2
  })
  // Magnify visually without changing layout width. This keeps the divider/Jarvis
  // reservation fixed so app icons can never push underneath the assistant area.
  const scaleTarget = useTransform(distance, [-150, 0, 150], [1, 1.7, 1])
  const scale = useSpring(scaleTarget, { mass: 0.1, stiffness: 150, damping: 12 })
  return <motion.button ref={ref} type="button" className="dock-item" style={{ scale }} onClick={onActivate} aria-label={item.label} title={item.label}>
    <span className="dock-tooltip" role="tooltip">{item.label}</span>
    <span className="dock-icon-wrap">
      <img className="dock-image dock-image--app" src={item.src} alt="" draggable="false" />
    </span>
  </motion.button>
}

export function Dock({ onItemOpen, collapsible = false }) {
  const mouseX = useMotionValue(Number.POSITIVE_INFINITY)
  const [collapsed, setCollapsed] = useState(false)
  const [jarvesOpen, setJarvesOpen] = useState(false)
  const [jarvesActivity, setJarvesActivity] = useState(null)
  const jarvesRef = useRef(null)
  const resetMagnification = () => mouseX.set(Number.POSITIVE_INFINITY)
  const trackTouch = (event) => {
    const touch = event.touches?.[0]
    if (touch) mouseX.set(touch.clientX)
  }
  const closeJarves = () => {
    setJarvesOpen(false)
    setJarvesActivity(null)
    jarvesRef.current?.focus()
  }

  useEffect(() => {
    if (!collapsible && collapsed) setCollapsed(false)
  }, [collapsible, collapsed])

  return <>
    {collapsible ? (
      <button
        type="button"
        className={`till-dock-toggle ${collapsed ? 'is-collapsed' : 'is-expanded'}`}
        onClick={() => setCollapsed((value) => !value)}
        aria-label={collapsed ? 'Show dock' : 'Hide dock'}
        title={collapsed ? 'Show dock' : 'Hide dock'}
      >
        {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
    ) : null}
    <div className={`dock-zone ${collapsible ? 'dock-zone--till' : ''} ${collapsed ? 'is-collapsed' : ''}`}>
      <motion.div className="dock" onMouseMove={(event) => mouseX.set(event.clientX)} onMouseLeave={resetMagnification} aria-label="OneEngine dock">
        <div className="dock-magnify-zone dock-desktop-items" onTouchStart={trackTouch} onTouchMove={trackTouch} onTouchEnd={resetMagnification} onTouchCancel={resetMagnification}>
          {dockItems.slice(0, 10).map((item) => <DockItem key={item.id} item={item} mouseX={mouseX} onActivate={() => onItemOpen?.(item.id)} />)}
        </div>
        <div className="dock-fixed-zone">
          <div className="dock-separator" aria-hidden="true" />
          <div className="dock-jarves-slot"><JarvisOrb state={jarvesActivity || ORB_STATES.IDLE} open={jarvesOpen} buttonRef={jarvesRef} onClick={() => setJarvesOpen(true)} /></div>
        </div>
        <div className="dock-mobile-items">
          {mobileDockItems.map((item) => <button key={item.id} type="button" className="dock-mobile-item" onClick={() => onItemOpen?.(item.id)} aria-label={item.label} title={item.label}>
            <span className="dock-icon-wrap"><img className="dock-image dock-image--app" src={item.src} alt="" draggable="false" /></span>
          </button>)}
        </div>
      </motion.div>
    </div>
    {jarvesOpen ? createPortal(<JarvisPanel embedded onClose={closeJarves} onActivityChange={setJarvesActivity} />, document.body) : null}
  </>
}
