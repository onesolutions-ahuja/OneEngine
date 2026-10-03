import { useEffect, useRef, useState } from 'react'
import { dockItems } from './DesktopDock'

export default function RdvnReferenceDock({ onItemOpen }) {
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
      const distance = Math.abs(signedDistance)
      const normalized = Math.max(0, 1 - distance / 128)
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
    onItemOpen?.(id)
  }

  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
  }, [])

  return (
    <div className="rdvn-reference-zone" aria-label="Classic Smart Theme dock">
      <div
        ref={dockRef}
        className="rdvn-reference-dock"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        {dockItems.slice(0, 10).map((item, index) => (
          <button
            key={item.id}
            ref={(node) => { itemRefs.current[index] = node }}
            type="button"
            className={`rdvn-reference-item ${bouncing === item.id ? 'is-bouncing' : ''}`}
            onClick={() => activate(item.id)}
            aria-label={item.label}
            title={item.label}
          >
            <span className="rdvn-reference-tooltip">{item.label}</span>
            <img src={item.src} alt="" draggable="false" />
          </button>
        ))}
      </div>
    </div>
  )
}
