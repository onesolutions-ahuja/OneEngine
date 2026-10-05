import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { apiRequest, checkBackend, consumeGoogleOAuthCallback, ensureActingCompanyContext, ensureActiveStoreContext, getActiveStoreId, getAvailableStores, getStoredSessionPermissions, getStoredUser, hasSession, loadSessionPermissions, login, logout, setActiveStoreId, startGoogleLogin, verifyPin } from './services/api'
import { DEVELOPER_SETTINGS_KEYS, readRoute, setRoute } from './navigation/routes'
import { LazyLoadBoundary, lazyWithRecovery } from './navigation/lazyRuntime.jsx'
import { MenuBarClock, useClock } from './components/shell/ShellClock'
import RdvnReferenceDock, { dockItems } from './components/shell/RdvnReferenceDock'
import { CompanyContextLoading, LockScreen } from './components/shell/LoginShell'
import DesktopShell from './components/shell/DesktopShell.jsx'
import { createRole, loadPermissions, loadRolePermissions, loadRoles, loadSettingsCatalog, loadSettingsContext, loadUsers, patchCompanySettings, patchSettings, readSettingsContextCache, saveRolePermissions, updateRole } from './services/settings'
import { settingSectionAccess, sectionIsVisible } from './utils/settingsAccess'
import { appIconUrl, applyDefaultAppIcon, localAppIcon, marketplaceSearchText, readMarketplaceCache, resolveAppOpenRoute, writeMarketplaceCache } from './utils/appMarketplace'
import JarvisOrb, { ORB_STATES } from './components/jarvis/JarvisOrb'
import JarvisPanel from './components/jarvis/JarvisPanel'
import IdentityAssuranceSettings from './pages/settings/IdentityAssuranceSettings'
import SettingsPage from './pages/settings/SettingsPage.jsx'
const RecordListView = lazyWithRecovery(() => import('./components/RecordListView'))
const MetadataRecordFormModal = lazyWithRecovery(() => import('./components/MetadataRecordFormModal'))
const UserStoreAccessModal = lazyWithRecovery(() => import('./components/UserStoreAccessModal'))
const OneDeveloperPage = lazyWithRecovery(() => import('./pages/developer/OneDeveloperPage'))
const MetadataSettingsPage = lazyWithRecovery(() => import('./pages/settings/MetadataSettingsPage'))
const ClientWebShopSettings = lazyWithRecovery(() => import('./pages/settings/ClientWebShopSettings'))
const PaymentTerminalSettings = lazyWithRecovery(() => import('./pages/settings/PaymentTerminalSettings'))
const HardwareSettings = lazyWithRecovery(() => import('./pages/settings/HardwareSettings'))
const AiAssistantSettings = lazyWithRecovery(() => import('./pages/settings/AiAssistantSettings'))
const ConnectionsSettings = lazyWithRecovery(() => import('./pages/settings/ConnectionsSettings'))
const TillPage = lazyWithRecovery(() => import('./pages/till/TillPage'))
const CustomerDisplay = lazyWithRecovery(() => import('./pages/till/CustomerDisplay'))
const WorkspacePage = lazyWithRecovery(() => import('./pages/workspace/WorkspacePage'))
const CustomPageRuntimePage = lazyWithRecovery(() => import('./pages/platform/CustomPageRuntimePage'))
const DashboardPage = lazyWithRecovery(() => import('./pages/dashboard/DashboardPage'))
const ProfilePage = lazyWithRecovery(() => import('./pages/profile/ProfilePage'))
const SalesPage = lazyWithRecovery(() => import('./pages/sales/SalesPage'))
const ReturnsPage = lazyWithRecovery(() => import('./pages/returns/ReturnsPage'))
const ExchangePage = lazyWithRecovery(() => import('./pages/returns/ExchangePage'))
const LayawayPage = lazyWithRecovery(() => import('./pages/sales/LayawayPage'))
const SupplierReturnsPage = lazyWithRecovery(() => import('./pages/returns/SupplierReturnsPage'))
const ProductsPage = lazyWithRecovery(() => import('./pages/products/ProductsPage'))
const CategoriesPage = lazyWithRecovery(() => import('./pages/products/CategoriesPage'))
const GlobalProductLookupPage = lazyWithRecovery(() => import('./pages/products/GlobalProductLookupPage'))
const InventoryPage = lazyWithRecovery(() => import('./pages/inventory/InventoryPage'))
const ReplenishmentPage = lazyWithRecovery(() => import('./pages/inventory/ReplenishmentPage'))
const PurchasesPage = lazyWithRecovery(() => import('./pages/purchases/PurchasesPage'))
const SuppliersPage = lazyWithRecovery(() => import('./pages/suppliers/SuppliersPage'))
const CustomersPage = lazyWithRecovery(() => import('./pages/customers/CustomersPage'))
const GiftCardsPage = lazyWithRecovery(() => import('./pages/customers/GiftCardsPage'))
const AttendancePage = lazyWithRecovery(() => import('./pages/employees/AttendancePage'))
const StoresPage = lazyWithRecovery(() => import('./pages/stores/StoresPage'))
const ReportsPage = lazyWithRecovery(() => import('./pages/reports/ReportsPage'))
const CustomReportsPage = lazyWithRecovery(() => import('./pages/reports/CustomReportsPage'))
const IntegrationsAdmin = lazyWithRecovery(() => import('./pages/integrations/IntegrationsAdmin'))
const AccountingAdmin = lazyWithRecovery(() => import('./pages/integrations/AccountingAdmin'))
const OnlineOrdersAdmin = lazyWithRecovery(() => import('./pages/online/OnlineOrdersAdmin'))
const OnlineOrdersPrep = lazyWithRecovery(() => import('./pages/online/OnlineOrdersPrep'))
const OwnDeliveryWorkspace = lazyWithRecovery(() => import('./pages/online/OwnDeliveryWorkspace'))
const ReturnsAdmin = lazyWithRecovery(() => import('./pages/returns/ReturnsAdmin'))
const SupplierReturnsAdmin = lazyWithRecovery(() => import('./pages/returns/ReturnsAdmin').then((module) => ({ default: module.SupplierReturnsAdmin })))
const AuditLogPage = lazyWithRecovery(() => import('./pages/audit/AuditLogPage'))
const OneStorePopover = lazyWithRecovery(() => import('./pages/oneStore/OneStorePopover'))
const LicensingAdmin = lazyWithRecovery(() => import('./pages/superadmin/LicensingAdmin'))
const AppReleasesAdmin = lazyWithRecovery(() => import('./pages/superadmin/AppReleasesAdmin'))
const StoreTillSettingsPage = lazyWithRecovery(() => import('./pages/settings/StoreTillSettingsPage'))
const GoogleConnectSettings = lazyWithRecovery(() => import('./pages/settings/GoogleConnectSettings'))
const ConnectorAppSettings = lazyWithRecovery(() => import('./pages/settings/ConnectorAppSettings'))
const DeliverySettingsPage = lazyWithRecovery(() => import('./pages/settings/DeliverySettingsPage'))
const WhatsAppAssistantSettings = lazyWithRecovery(() => import('./pages/settings/WhatsAppAssistantSettings'))
const SecurityIdentitySettings = lazyWithRecovery(() => import('./pages/settings/SecurityIdentitySettings'))
const MfaAdministrationSettings = lazyWithRecovery(() => import('./pages/settings/MfaAdministrationSettings'))
const SecurityGovernanceSettings = lazyWithRecovery(() => import('./pages/settings/SecurityGovernanceSettings'))
const DataProtectionSettings = lazyWithRecovery(() => import('./pages/settings/DataProtectionSettings'))
const OneAssistantPage = lazyWithRecovery(() => import('./pages/assistant/OneAssistantPage'))
const OneKioskPage = lazyWithRecovery(() => import('./pages/kiosk/OneKioskPage'))
const OneKioskDisplayPage = lazyWithRecovery(() => import('./pages/kiosk/OneKioskDisplayPage'))
const OneKioskDevicesPage = lazyWithRecovery(() => import('./pages/kiosk/OneKioskDevicesPage'))
const PublicAppointmentBookingPage = lazyWithRecovery(() => import('./pages/assistant/PublicAppointmentBookingPage'))
const ScreenFlowRuntimePage = lazyWithRecovery(() => import('./pages/flow/ScreenFlowRuntimePage'))
import {
  LockKeyhole,
  Search,
  SlidersHorizontal,
  Wifi,
  Bell,
  Volume2,
  Moon,
  Clock3,
  Settings2,
  Settings as GearIcon,
  CircleUserRound,
  CircleHelp,
  CircleAlert,
  Accessibility,
  Shield,
  Monitor,
  Image,
  BatteryCharging,
  Users,
  KeyRound,
  Globe2,
  Keyboard,
  MousePointer2,
  Printer,
  ChevronLeft, ChevronRight,
  Building2,
  Store,
  ShoppingCart,
  ReceiptText,
  CreditCard,
  HardDrive,
  ShieldCheck,
  Sparkles,
  Cable,
  MonitorCog,
  MonitorSmartphone,
  LayoutGrid,
  Mail,
  ShoppingBag,
  RefreshCw,
  <RdvnReferenceDock onItemOpen={openItem} />
    </main>
  )
}

export default function App() {
  const route = readRoute()
  if (route.app === 'customer-display') {
    return <LazyLoadBoundary><Suspense fallback={<div className="route-loading" role="status">Loading display…</div>}><CustomerDisplay /></Suspense></LazyLoadBoundary>
  }
  if (route.app === 'flow-runtime') {
    return <LazyLoadBoundary><Suspense fallback={<div className="route-loading" role="status">Loading flow…</div>}><ScreenFlowRuntimePage sessionId={route.sessionId} /></Suspense></LazyLoadBoundary>
  }
  if (route.app === 'public-assistant-booking') {
    return <LazyLoadBoundary><Suspense fallback={<div className="route-loading" role="status">Loading booking…</div>}><PublicAppointmentBookingPage token={route.token} /></Suspense></LazyLoadBoundary>
  }
  if (route.app === 'kiosk-runtime') {
    return <LazyLoadBoundary><Suspense fallback={<div className="route-loading" role="status">Loading kiosk…</div>}><OneKioskPage publicMode /></Suspense></LazyLoadBoundary>
  }
  if (route.app === 'kiosk-display') {
    return <LazyLoadBoundary><Suspense fallback={<div className="route-loading" role="status">Loading collection display…</div>}><OneKioskDisplayPage /></Suspense></LazyLoadBoundary>
  }

  // A browser refresh should restore an authenticated session, not behave like
  // an explicit workstation lock. PIN is only required after the user chooses
  // Lock during the current session.
  const [locked, setLocked] = useState(() => !hasSession())
  const [sessionContextReady, setSessionContextReady] = useState(() => !hasSession())
  const [pendingUnlock, setPendingUnlock] = useState(false)

  const [transitioning, setTransitioning] = useState(false)

  useEffect(() => {
    // Existing sessions (browser refresh / OAuth callback) need one bootstrap
    // before Desktop renders. Fresh password login already receives the resolved
    // company context from /api/auth/login, so do not repeat those requests.
    if (!hasSession()) {
      setSessionContextReady(true)
      return
    }
    let live = true
    setSessionContextReady(false)
    const bootstrapTimeout = window.setTimeout(() => {
      // Never leave the workstation trapped behind the company-context loader.
      // API calls have their own timeout, but this is a final UI recovery guard.
      if (live) setSessionContextReady(true)
    }, 15000)
    ensureActingCompanyContext()
      .catch(() => '')
      .finally(() => {
        window.clearTimeout(bootstrapTimeout)
        if (live) setSessionContextReady(true)
      })
    return () => {
      live = false
      window.clearTimeout(bootstrapTimeout)
    }
  }, [])

  const unlock = () => {
    if (transitioning || pendingUnlock) return
    setSessionContextReady(true)
    setPendingUnlock(true)
    setTransitioning(true)

    // Keep the unlock transition timer outside an effect whose dependency
    // changes would cancel its own cleanup timer. The previous implementation
    // set transitioning=true inside the effect, causing React to clean up that
    // effect immediately and clear the timeout before locked could become false.
    window.setTimeout(() => {
      setLocked(false)
      setPendingUnlock(false)
      setTransitioning(false)
    }, 180)
  }

  const lock = () => {
    if (transitioning) return
    setTransitioning(true)
    window.setTimeout(() => {
      setLocked(true)
      setTransitioning(false)
    }, 260)
  }

  const signOut = () => {
    logout()
    setLocked(true)
  }

  return (
    <div className={`app-shell ${transitioning ? 'is-transitioning' : ''}`}>
      {locked ? (
        pendingUnlock && !sessionContextReady
          ? <CompanyContextLoading />
          : <LockScreen onUnlock={unlock} onSignOut={signOut} preparing={pendingUnlock && !sessionContextReady} />
      ) : !sessionContextReady ? (
        <CompanyContextLoading />
      ) : (
        <DesktopShell onLock={lock} onSignOut={signOut} />
      )}
    </div>
  )
}
