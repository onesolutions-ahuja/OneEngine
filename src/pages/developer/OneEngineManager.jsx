import { useState } from 'react'
import { BadgeCheck, Boxes, Rocket, UsersRound } from 'lucide-react'
import LicensingAdmin from '../superadmin/LicensingAdmin'
import AppReleasesAdmin from '../superadmin/AppReleasesAdmin'

const SECTIONS = [
  { key: 'licensing', label: 'Licences & Tenants', icon: BadgeCheck },
  { key: 'releases', label: 'App Releases', icon: Rocket },
]

export default function OneEngineManager() {
  const [active, setActive] = useState('licensing')
  const current = SECTIONS.find((item) => item.key === active) || SECTIONS[0]

  return (
    <section className="oneengine-manager">
      <div className="settings-section-header">
        <div>
          <h3>OneEngine Manager</h3>
          <p>Cross-tenant OneEngine controls. Access is granted only through the OneEngine Manager RBAC permission.</p>
        </div>
        <span className="settings-section-badge"><UsersRound size={14}/> All tenants</span>
      </div>

      <div className="settings-segmented-control" role="tablist" aria-label="OneEngine Manager sections">
        {SECTIONS.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={current.key === item.key}
              className={current.key === item.key ? 'is-active' : ''}
              onClick={() => setActive(item.key)}
            >
              <Icon size={15}/>
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>

      <div className="oneengine-manager__body">
        {current.key === 'licensing' ? (
          <div className="superadmin-theme"><LicensingAdmin /></div>
        ) : current.key === 'releases' ? (
          <div className="superadmin-theme"><AppReleasesAdmin /></div>
        ) : (
          <div className="module-state"><Boxes size={18}/> OneEngine Manager</div>
        )}
      </div>
    </section>
  )
}
