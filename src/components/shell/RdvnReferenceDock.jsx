import { useRef } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'

const dockItems = [
  { id: 'finder', label: 'Finder', src: 'https://rdvnui.com/assets/Finder-BnFYQNS_.png', scaled: true },
  { id: 'settings', label: 'Settings', src: 'https://rdvnui.com/assets/Settings-BIHCu_gi.png', scaled: true },
  { id: 'launchpad', label: 'Launchpad', src: 'https://rdvnui.com/assets/Launchpad-wwI6e3wv.png', scaled: true },
  { id: 'maps', label: 'Maps', src: 'https://rdvnui.com/assets/Maps-C7aNhhUR.png', scaled: true },
  { id: 'notes', label: 'Notes', src: 'https://rdvnui.com/assets/Notes-fm-2Meh1.png', scaled: true },
]

const trashItem = {
  id: 'trash',
  label: 'Trash',
  src: 'https://rdvnui.com/assets/Trash%20Full-BoE_wJYh.png',
  scaled: false,
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
        <img className={item.scaled ? 'efb-dock-image efb-dock-image--scaled' : 'efb-dock-image'} src={item.src} alt="" draggable="false" />
      </span>
    </motion.button>
  )
}

export default function RdvnReferenceDock({ onItemOpen }) {
  const mouseX = useMotionValue(Number.POSITIVE_INFINITY)

  return (
    <div className="efb-dock-zone">
      <motion.div
        className="efb-dock"
        onMouseMove={(event) => mouseX.set(event.pageX)}
        onMouseLeave={() => mouseX.set(Number.POSITIVE_INFINITY)}
        aria-label="Smart Theme dock efb2f731 reference"
      >
        {dockItems.map((item) => (
          <DockItem key={item.id} item={item} mouseX={mouseX} onActivate={() => onItemOpen?.(item.id)} />
        ))}
        <div className="efb-dock-separator" aria-hidden="true" />
        <DockItem item={trashItem} mouseX={mouseX} onActivate={() => onItemOpen?.(trashItem.id)} />
      </motion.div>
    </div>
  )
}
