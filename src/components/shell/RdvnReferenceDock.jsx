import { useRef, useState } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { LayoutDashboard, LayoutGrid, Settings as GearIcon, Users } from 'lucide-react'
import { localAppIcon } from '../../utils/appMarketplace'

const periodItems = [
  { id: 'launchpad', label: 'Launcher', icon: LayoutGrid },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'store', label: 'oneStore', src: localAppIcon('onestore'), scaled: true },
  { id: 'builder', label: 'OneDeveloper', icon: LayoutGrid },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'till', label: 'OneTill', src: localAppIcon('onetill-new'), scaled: true },
  { id: 'settings', label: 'Settings', icon: GearIcon },
]

function PeriodDockItem({ item, mouseX, onActivate }) {
  const ref = useRef(null)
  const distance = useTransform(mouseX, (value) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 }
    return value - bounds.x - bounds.width / 2
  })
  const widthTarget = useTransform(distance, [-150, 0, 150], [40, 76, 40])
  const width = useSpring(widthTarget, { mass: 0.1, stiffness: 150, damping: 12 })

  return (
    <motion.button
      ref={ref}
      type="button"
      className="period-dock-item"
      style={{ width }}
      onClick={onActivate}
      aria-label={item.label}
      title={item.label}
    >
      <span className="period-dock-icon-wrap">
        {item.icon
          ? <item.icon className="period-dock-lucide-icon" size={27} strokeWidth={1.8} />
          : <img className={item.scaled ? 'period-dock-image period-dock-image--scaled' : 'period-dock-image'} src={item.src} alt="" draggable="false" />}
      </span>
    </motion.button>
  )
}

export default function RdvnReferenceDock({ onItemOpen }) {
  const mouseX = useMotionValue(Number.POSITIVE_INFINITY)
  const [bouncing, setBouncing] = useState(null)

  const activate = (id) => {
    setBouncing(id)
    window.setTimeout(() => setBouncing(null), 360)
    onItemOpen?.(id)
  }

  return (
    <div className="period-dock-zone" aria-label="Developer-logo-period dock">
      <motion.div
        className="period-dock"
        onMouseMove={(event) => mouseX.set(event.clientX)}
        onMouseLeave={() => mouseX.set(Number.POSITIVE_INFINITY)}
      >
        {periodItems.map((item) => (
          <div key={item.id} className={bouncing === item.id ? 'period-dock-slot is-bouncing' : 'period-dock-slot'}>
            <PeriodDockItem item={item} mouseX={mouseX} onActivate={() => activate(item.id)} />
          </div>
        ))}
      </motion.div>
    </div>
  )
}
