import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { LayoutDashboard, LayoutGrid, Settings as GearIcon, Users } from 'lucide-react'
import { localAppIcon } from '../../utils/appMarketplace'
import JarvisOrb, { ORB_STATES } from '../jarvis/JarvisOrb'
import JarvisPanel from '../jarvis/JarvisPanel'

export const dockItems = [
  { id: 'launchpad', label: 'Launcher', icon: LayoutGrid },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'store', label: 'oneStore', src: localAppIcon('onestore'), scaled: true },
  { id: 'builder', label: 'OneDeveloper', icon: LayoutGrid },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'till', label: 'OneTill', src: localAppIcon('onetill-new'), scaled: true },
  { id: 'settings', label: 'Settings', icon: GearIcon },
]

const mobileDockItems = [
  { id: 'store', label: 'oneStore', src: localAppIcon('onestore'), scaled: true },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'till', label: 'OneTill', src: localAppIcon('onetill-new'), scaled: true },
  { id: 'workspace', label: 'Workspace', icon: Users },
  { id: 'settings', label: 'Settings', icon: GearIcon },
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
  const widthTarget = useTransform(distance, [-150, 0, 150], [40, 76, 40])
  const width = useSpring(widthTarget, { mass: 0.1, stiffness: 150, damping: 12 })
  return <motion.button ref={ref} type="button" className="dock-item" style={{ width }} onClick={onActivate} aria-label={item.label}>
    <span className="dock-icon-wrap">
      {item.icon ? <item.icon className="dock-lucide-icon" size={27} strokeWidth={1.8} /> : <img className={item.scaled ? 'dock-image dock-image--scaled' : 'dock-image'} src={item.src} alt="" draggable="false" />}
    </span>
  </motion.button>
}

export function Dock({ onItemOpen }) {
  const mouseX = useMotionValue(Number.POSITIVE_INFINITY)
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

  return <>
    <div className="dock-zone">
      <motion.div className="dock" onMouseMove={(event) => mouseX.set(event.clientX)} onMouseLeave={resetMagnification} aria-label="OneEngine dock">
        <div className="dock-magnify-zone dock-desktop-items" onTouchStart={trackTouch} onTouchMove={trackTouch} onTouchEnd={resetMagnification} onTouchCancel={resetMagnification}>
          {dockItems.map((item) => <DockItem key={item.id} item={item} mouseX={mouseX} onActivate={() => onItemOpen?.(item.id)} />)}
        </div>
        <div className="dock-fixed-zone">
          <div className="dock-separator" aria-hidden="true" />
          <div className="dock-jarves-slot"><JarvisOrb state={jarvesActivity || ORB_STATES.IDLE} open={jarvesOpen} buttonRef={jarvesRef} onClick={() => setJarvesOpen(true)} /></div>
        </div>
        <div className="dock-mobile-items">
          {mobileDockItems.map((item) => <button key={item.id} type="button" className="dock-mobile-item" onClick={() => onItemOpen?.(item.id)} aria-label={item.label}>
            <span className="dock-icon-wrap">{item.icon ? <item.icon className="dock-lucide-icon" size={24} strokeWidth={1.8} /> : <img className={item.scaled ? 'dock-image dock-image--scaled' : 'dock-image'} src={item.src} alt="" draggable="false" />}</span>
          </button>)}
        </div>
      </motion.div>
    </div>
    {jarvesOpen ? createPortal(<JarvisPanel embedded onClose={closeJarves} onActivityChange={setJarvesActivity} />, document.body) : null}
  </>
}
