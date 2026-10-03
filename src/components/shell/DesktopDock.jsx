import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  { id: 'dashboard', label: 'Dashboard', src: dockAsset('dashboard') },
  { id: 'workspace', label: 'Workspace', src: dockAsset('contacts') },
  { id: 'settings', label: 'Settings', src: dockAsset('settings') },
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

function DockItem({ item, setRef, onActivate }) {
  return <button ref={setRef} type="button" className="dock-item" onClick={onActivate} aria-label={item.label} title={item.label}>
    <span className="dock-tooltip" role="tooltip">{item.label}</span>
    <span className="dock-icon-wrap">
      <img className="dock-image dock-image--app" src={item.src} alt="" draggable="false" />
    </span>
  </button>
}

export function Dock({ onItemOpen, collapsible = false }) {
  const dockItemsRef = useRef([])
  const frameRef = useRef(null)
  const [collapsed, setCollapsed] = useState(false)
  const [jarvesOpen, setJarvesOpen] = useState(false)
  const [jarvesActivity, setJarvesActivity] = useState(null)
  const jarvesRef = useRef(null)

  const applyMagnification = (clientX) => {
    dockItemsRef.current.forEach((node) => {
      if (!node) return
      const zoneRect = node.parentElement?.getBoundingClientRect()
      if (!zoneRect) return
      const center = zoneRect.left + node.offsetLeft + node.offsetWidth / 2
      const signedDistance = center - clientX
      const distance = Math.abs(signedDistance)
      const radius = 128
      const normalized = Math.max(0, 1 - distance / radius)
      const influence = normalized * normalized * (3 - 2 * normalized)
      const scale = 1 + influence * 0.66
      const lift = influence * 21
      const push = Math.sign(signedDistance || 1) * influence * 18
      node.style.setProperty('--dock-scale', scale.toFixed(3))
      node.style.setProperty('--dock-lift', `${lift.toFixed(2)}px`)
      node.style.setProperty('--dock-push', `${push.toFixed(2)}px`)
    })
  }

  const resetMagnification = () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    dockItemsRef.current.forEach((node) => {
      if (!node) return
      node.style.setProperty('--dock-scale', '1')
      node.style.setProperty('--dock-lift', '0px')
      node.style.setProperty('--dock-push', '0px')
    })
  }

  const trackPointer = (clientX) => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      applyMagnification(clientX)
    })
  }

  const closeJarves = () => {
    setJarvesOpen(false)
    setJarvesActivity(null)
    jarvesRef.current?.focus()
  }

  useEffect(() => {
    if (!collapsible && collapsed) setCollapsed(false)
  }, [collapsible, collapsed])

  useEffect(() => () => resetMagnification(), [])

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
      <div className="dock" aria-label="OneEngine dock">
        <div className="dock-magnify-zone dock-desktop-items" onPointerMove={(event) => trackPointer(event.clientX)} onPointerLeave={resetMagnification}>
          {dockItems.slice(0, 10).map((item, index) => <DockItem key={item.id} item={item} setRef={(node) => { dockItemsRef.current[index] = node }} onActivate={() => onItemOpen?.(item.id)} />)}
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
      </div>
    </div>
    {jarvesOpen ? createPortal(<JarvisPanel embedded onClose={closeJarves} onActivityChange={setJarvesActivity} />, document.body) : null}
  </>
}
