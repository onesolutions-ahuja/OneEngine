import { useRef } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import JarvisOrb from '../jarvis/JarvisOrb'

const settingsSrc = 'https://rdvnui.com/assets/Settings-BIHCu_gi.png'
export const dockItems = [
  { id: 'launchpad', label: 'Launcher', src: `${import.meta.env.BASE_URL || '/'}icons/apps/Launchpad.png`, scaled: true },
  { id: 'dashboard', label: 'Dashboard', src: `${import.meta.env.BASE_URL || '/'}icons/apps/dashboard.png`, scaled: true },
  { id: 'developer', label: 'OneDeveloper', src: `${import.meta.env.BASE_URL || '/'}icons/apps/one-developer-dock.svg`, scaled: true },
  { id: 'store', label: 'OneStore', src: settingsSrc, scaled: true },
  { id: 'till', label: 'OneTill', src: settingsSrc, scaled: true },
  { id: 'developer', label: 'OneDeveloper', src: `${import.meta.env.BASE_URL || '/'}icons/apps/Settings.png`, scaled: true },
  { id: 'workspace', label: 'Workspace', src: `${import.meta.env.BASE_URL || '/'}icons/apps/workspace.svg`, scaled: true },
]

const trashItem = {
  id: 'trash',
  label: 'Recycle Bin',
  src: 'https://rdvnui.com/assets/Trash%20Full-BoE_wJYh.png',
}

const mobileDockItems = [
  { id: 'dashboard', label: 'Dashboard', src: `${import.meta.env.BASE_URL || '/'}icons/apps/dashboard.png` },
  { id: 'workspace', label: 'Workspace', src: `${import.meta.env.BASE_URL || '/'}icons/apps/workspace.svg` },
  { id: 'settings', label: 'Settings', src: `${import.meta.env.BASE_URL || '/'}icons/apps/Settings.png` },
]

function DockItem({ item, mouseX, onActivate }) {
  const ref = useRef(null)
  const distance = useTransform(mouseX, (value) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 }
    return value - bounds.x - bounds.width / 2
  })
  const widthTarget = useTransform(distance, [-150, 0, 150], [40, 100, 40])
  const width = useSpring(widthTarget, { mass: 0.1, stiffness: 150, damping: 12 })

  return (
    <motion.button ref={ref} type="button" className="efb-dock-item" style={{ width }} onClick={onActivate} aria-label={item.label}>
      <span className="efb-dock-icon-wrap">
        <img className={`${item.scaled ? 'efb-dock-image efb-dock-image--scaled' : 'efb-dock-image'}${item.id === 'developer' && item.src.includes('one-developer-dock.svg') ? ' efb-dock-image--developer' : ''}`} src={item.src} alt="" draggable="false" />
      </span>
    </motion.button>
  )
}

export default function RdvnReferenceDock({ onItemOpen }) {
  const mouseX = useMotionValue(Number.POSITIVE_INFINITY)

  return (
    <div className="efb-dock-zone">
      <div className="efb-dock" aria-label="Smart Theme dock efb2f731 reference">
        <motion.div
          className="efb-dock-magnify-zone"
          onMouseMove={(event) => mouseX.set(event.pageX)}
          onMouseLeave={() => mouseX.set(Number.POSITIVE_INFINITY)}
        >
          {dockItems.map((item) => (
            <DockItem key={item.id} item={item} mouseX={mouseX} onActivate={() => onItemOpen?.(item.id)} />
          ))}
        </motion.div>
        <div className="efb-dock-separator" aria-hidden="true" />
        <div className="efb-dock-fixed-zone">
          <button type="button" className="efb-dock-fixed-item" onClick={() => onItemOpen?.(trashItem.id)} aria-label={trashItem.label}>
            <img className="efb-dock-image" src={trashItem.src} alt="" draggable="false" />
          </button>
          <div className="efb-dock-jarvis">
            <JarvisOrb onClick={() => onItemOpen?.('jarvis')} />
          </div>
        </div>
      </div>

      <div className="efb-mobile-dock" aria-label="OneEngine mobile dock">
        {mobileDockItems.map((item) => (
          <button key={item.id} type="button" className="efb-mobile-dock-item" onClick={() => onItemOpen?.(item.id)} aria-label={item.label} title={item.label}>
            <span className="efb-mobile-dock-icon-wrap">
              <img className="efb-mobile-dock-image" src={item.src} alt="" draggable="false" />
            </span>
          </button>
        ))}
        <div className="efb-mobile-dock-jarvis" aria-label="Jarvis">
          <JarvisOrb onClick={() => onItemOpen?.('jarvis')} />
        </div>
      </div>
    </div>
  )
}
