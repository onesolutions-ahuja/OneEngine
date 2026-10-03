import { useRef } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import JarvisOrb from '../jarvis/JarvisOrb'

const settingsSrc = 'https://rdvnui.com/assets/Settings-BIHCu_gi.png'
const localDockAsset = (name) => `${import.meta.env.BASE_URL || '/'}icons/dock/${name}.svg?v=20261003-dock2`
const dockItems = [
  { id: 'launchpad', label: 'Launcher', src: 'https://rdvnui.com/assets/Launchpad-wwI6e3wv.png' },
  { id: 'dashboard', label: 'Dashboard', src: 'https://rdvnui.com/assets/Finder-BnFYQNS_.png' },
  { id: 'settings', label: 'Settings', src: settingsSrc },
  { id: 'maps', label: 'Maps', src: 'https://rdvnui.com/assets/Maps-C7aNhhUR.png' },
  { id: 'developer', label: 'OneDeveloper', src: localDockAsset('developer') },
  { id: 'store', label: 'OneStore', src: localDockAsset('store') },
  { id: 'till', label: 'OneTill', src: settingsSrc },
  { id: 'workspace', label: 'Workspace', src: settingsSrc },
]

const trashItem = {
  id: 'trash',
  label: 'Recycle Bin',
  src: 'https://rdvnui.com/assets/Trash%20Full-BoE_wJYh.png',
}

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
        <img className="efb-dock-image" src={item.src} alt="" draggable="false" />
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
    </div>
  )
}
