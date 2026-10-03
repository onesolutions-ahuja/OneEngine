import { useEffect, useRef, useState } from 'react'
import { CalendarDays, CloudSun, Folder, MessageCircle, Music2, Search, Settings } from 'lucide-react'

const classicItems = [
  { id: 'finder', label: 'Files', Icon: Folder, tint: 'blue' },
  { id: 'search', label: 'Search', Icon: Search, tint: 'cyan' },
  { id: 'messages', label: 'Messages', Icon: MessageCircle, tint: 'green' },
  { id: 'weather', label: 'Weather', Icon: CloudSun, tint: 'sky' },
  { id: 'calendar', label: 'Calendar', Icon: CalendarDays, tint: 'red' },
  { id: 'music', label: 'Music', Icon: Music2, tint: 'pink' },
  { id: 'settings', label: 'Settings', Icon: Settings, tint: 'silver' },
]

export default function RdvnReferenceDock() {
  const dockRef = useRef(null)
  const itemRefs = useRef([])
  const frameRef = useRef(null)
  const [bouncing, setBouncing] = useState(null)

  const reset = () => {
    itemRefs.current.forEach((item) => {
      if (!item) return
      item.style.setProperty('--rdvn-scale', '1')
      item.style.setProperty('--rdvn-lift', '0px')
      item.style.setProperty('--rdvn-push', '0px')
    })
  }

  const applyMagnification = (clientX) => {
    const dock = dockRef.current
    if (!dock) return
    const dockRect = dock.getBoundingClientRect()
    itemRefs.current.forEach((item) => {
      if (!item) return
      const center = dockRect.left + item.offsetLeft + item.offsetWidth / 2
      const signedDistance = center - clientX
      const normalized = Math.max(0, 1 - Math.abs(signedDistance) / 128)
      const influence = normalized * normalized * (3 - 2 * normalized)
      item.style.setProperty('--rdvn-scale', (1 + influence * 0.66).toFixed(3))
      item.style.setProperty('--rdvn-lift', `${(influence * 21).toFixed(2)}px`)
      item.style.setProperty('--rdvn-push', `${(Math.sign(signedDistance || 1) * influence * 18).toFixed(2)}px`)
    })
  }

  const handlePointerMove = (event) => {
    const clientX = event.clientX
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      applyMagnification(clientX)
    })
  }

  const handlePointerLeave = () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    reset()
  }

  const activate = (id) => {
    setBouncing(id)
    window.setTimeout(() => setBouncing(null), 360)
  }

  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
  }, [])

  return (
    <div className="rdvn-reference-zone" aria-label="Original Smart Theme dock">
      <div ref={dockRef} className="rdvn-reference-dock" onPointerMove={handlePointerMove} onPointerLeave={handlePointerLeave}>
        {classicItems.map(({ id, label, Icon, tint }, index) => (
          <button
            key={id}
            ref={(node) => { itemRefs.current[index] = node }}
            type="button"
            className={`rdvn-reference-item ${bouncing === id ? 'is-bouncing' : ''}`}
            onClick={() => activate(id)}
            aria-label={label}
          >
            <span className="rdvn-reference-tooltip">{label}</span>
            <span className={`rdvn-reference-icon rdvn-reference-icon--${tint}`}>
              <Icon size={30} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <span className="rdvn-reference-dot" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  )
}
