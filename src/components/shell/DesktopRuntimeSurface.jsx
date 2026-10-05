import { Suspense } from 'react'
import { LazyLoadBoundary, lazyWithRecovery } from '../../navigation/lazyRuntime.jsx'
import { setRoute } from '../../navigation/routes'
import SettingsPage from '../../pages/settings/SettingsPage.jsx'

const OneDeveloperPage = lazyWithRecovery(() => import('../../pages/developer/OneDeveloperPage'))
const GoogleConnectSettings = lazyWithRecovery(() => import('../../pages/settings/GoogleConnectSettings'))
const ConnectorAppSettings = lazyWithRecovery(() => import('../../pages/settings/ConnectorAppSettings'))
const TillPage = lazyWithRecovery(() => import('../../pages/till/TillPage'))
const WorkspacePage = lazyWithRecovery(() => import('../../pages/workspace/WorkspacePage'))
const CustomPageRuntimePage = lazyWithRecovery(() => import('../../pages/platform/CustomPageRuntimePage'))
const DashboardPage = lazyWithRecovery(() => import('../../pages/dashboard/DashboardPage'))
const ProfilePage = lazyWithRecovery(() => import('../../pages/profile/ProfilePage'))
const SalesPage = lazyWithRecovery(() => import('../../pages/sales/SalesPage'))
const ReturnsPage = lazyWithRecovery(() => import('../../pages/returns/ReturnsPage'))
const ExchangePage = lazyWithRecovery(() => import('../../pages/returns/ExchangePage'))
const LayawayPage = lazyWithRecovery(() => import('../../pages/sales/LayawayPage'))
const SupplierReturnsPage = lazyWithRecovery(() => import('../../pages/returns/SupplierReturnsPage'))
const ProductsPage = lazyWithRecovery(() => import('../../pages/products/ProductsPage'))
const CategoriesPage = lazyWithRecovery(() => import('../../pages/products/CategoriesPage'))
const GlobalProductLookupPage = lazyWithRecovery(() => import('../../pages/products/GlobalProductLookupPage'))
const InventoryPage = lazyWithRecovery(() => import('../../pages/inventory/InventoryPage'))
const ReplenishmentPage = lazyWithRecovery(() => import('../../pages/inventory/ReplenishmentPage'))
const PurchasesPage = lazyWithRecovery(() => import('../../pages/purchases/PurchasesPage'))
const SuppliersPage = lazyWithRecovery(() => import('../../pages/suppliers/SuppliersPage'))
const CustomersPage = lazyWithRecovery(() => import('../../pages/customers/CustomersPage'))
const GiftCardsPage = lazyWithRecovery(() => import('../../pages/customers/GiftCardsPage'))
const AttendancePage = lazyWithRecovery(() => import('../../pages/employees/AttendancePage'))
const StoresPage = lazyWithRecovery(() => import('../../pages/stores/StoresPage'))
const ReportsPage = lazyWithRecovery(() => import('../../pages/reports/ReportsPage'))
const CustomReportsPage = lazyWithRecovery(() => import('../../pages/reports/CustomReportsPage'))
const IntegrationsAdmin = lazyWithRecovery(() => import('../../pages/integrations/IntegrationsAdmin'))
const AccountingAdmin = lazyWithRecovery(() => import('../../pages/integrations/AccountingAdmin'))
const OnlineOrdersAdmin = lazyWithRecovery(() => import('../../pages/online/OnlineOrdersAdmin'))
const OnlineOrdersPrep = lazyWithRecovery(() => import('../../pages/online/OnlineOrdersPrep'))
const OwnDeliveryWorkspace = lazyWithRecovery(() => import('../../pages/online/OwnDeliveryWorkspace'))
const AuditLogPage = lazyWithRecovery(() => import('../../pages/audit/AuditLogPage'))
const LicensingAdmin = lazyWithRecovery(() => import('../../pages/superadmin/LicensingAdmin'))
const AppReleasesAdmin = lazyWithRecovery(() => import('../../pages/superadmin/AppReleasesAdmin'))
const OneAssistantPage = lazyWithRecovery(() => import('../../pages/assistant/OneAssistantPage'))
const OneKioskPage = lazyWithRecovery(() => import('../../pages/kiosk/OneKioskPage'))
const OneKioskDisplayPage = lazyWithRecovery(() => import('../../pages/kiosk/OneKioskDisplayPage'))
const OneKioskDevicesPage = lazyWithRecovery(() => import('../../pages/kiosk/OneKioskDevicesPage'))

export default function DesktopRuntimeSurface({
  activeApp,
  routeState,
  setRouteState,
  setActiveApp,
  setTopPanel,
  setAppSearch,
  openItem,
  activeStoreId,
  storedUser,
  enginePermissionStatus,
  canManageOneEngine,
  enginePermissionNotice,
}) {
  return (
    <LazyLoadBoundary resetKey={`${activeApp || ''}:${routeState?.section || ''}`}>
      <Suspense key={activeStoreId || 'no-store'} fallback={<div className="route-loading" role="status">Loading…</div>}>
        {activeApp === 'developer' ? (
          enginePermissionStatus === 'ready' && canManageOneEngine ? (
            <OneDeveloperPage
              initialSection={routeState?.section || 'objects'}
              initialWorkflowId={routeState?.workflowId || ''}
              onSectionChange={(section, options = {}) => {
                const next = { app: 'developer', section, workflowId: options?.workflowId || '' }
                setRouteState(next)
                setRoute('developer', section, options)
              }}
            />
          ) : enginePermissionNotice
        ) : activeApp === 'settings' ? (
          <SettingsPage onOpenProfile={() => {
            const next = { app: 'profile', section: null }
            setRouteState(next)
            setRoute('profile')
            setActiveApp('profile')
          }} />
        ) : activeApp === 'google-connect' ? (
          <GoogleConnectSettings />
        ) : activeApp === 'connector-settings' ? (
          <ConnectorAppSettings packageKey={routeState?.packageKey || ''} onBack={() => { setTopPanel('store'); setActiveApp('home'); setRoute('home') }} />
        ) : activeApp === 'till' ? (
          <TillPage
            onOpenSettings={() => { setRoute('settings', 'store-till'); setActiveApp('settings') }}
            onNavigate={openItem}
          />
        ) : activeApp === 'sales' ? (
          <SalesPage onOpenReturns={() => openItem('returns')} onOpenSupplierReturns={() => openItem('supplier-returns')} />
        ) : activeApp === 'returns' ? (
          <ReturnsPage />
        ) : activeApp === 'exchange' ? (
          <ExchangePage />
        ) : activeApp === 'layaway' ? (
          <LayawayPage />
        ) : activeApp === 'supplier-returns' ? (
          <SupplierReturnsPage />
        ) : activeApp === 'products' ? (
          <ProductsPage onOpenCategories={() => openItem('categories')} onOpenGlobalProducts={() => openItem('global-products')} />
        ) : activeApp === 'categories' ? (
          <CategoriesPage onBack={() => openItem('products')} />
        ) : activeApp === 'global-products' ? (
          <GlobalProductLookupPage
            onBack={() => openItem('products')}
            onOpenStore={() => {
              setAppSearch('')
              setTopPanel('store')
            }}
          />
        ) : activeApp === 'inventory' ? (
          <InventoryPage onOpenReplenishment={() => openItem('replenishment')} />
        ) : activeApp === 'replenishment' ? (
          <ReplenishmentPage onBack={() => openItem('inventory')} />
        ) : activeApp === 'purchases' ? (
          <PurchasesPage />
        ) : activeApp === 'suppliers' ? (
          <SuppliersPage />
        ) : activeApp === 'customers' ? (
          <CustomersPage onOpenGiftCards={() => openItem('gift-cards')} />
        ) : activeApp === 'gift-cards' ? (
          <GiftCardsPage onBack={() => openItem('customers')} />
        ) : activeApp === 'employees' ? (
          <AttendancePage />
        ) : activeApp === 'stores' ? (
          <StoresPage />
        ) : activeApp === 'reports' ? (
          <ReportsPage onOpenCustomReports={() => openItem('custom-reports')} />
        ) : activeApp === 'custom-reports' ? (
          <CustomReportsPage onBack={() => openItem('reports')} />
        ) : activeApp === 'integrations' ? (
          <IntegrationsAdmin storeId={routeState?.storeId || activeStoreId || storedUser?.storeId || null} />
        ) : activeApp === 'accounting' ? (
          <AccountingAdmin storeId={routeState?.storeId || activeStoreId || storedUser?.storeId || null} />
        ) : activeApp === 'online-orders' ? (
          <OnlineOrdersAdmin />
        ) : activeApp === 'order-prep' ? (
          <OnlineOrdersPrep />
        ) : activeApp === 'own-delivery' ? (
          <OwnDeliveryWorkspace />
        ) : activeApp === 'assistant' ? (
          <OneAssistantPage />
        ) : activeApp === 'kiosk' ? (
          <OneKioskPage />
        ) : activeApp === 'kiosk-display' ? (
          <OneKioskDisplayPage />
        ) : activeApp === 'kiosk-devices' ? (
          <OneKioskDevicesPage />
        ) : activeApp === 'audit-log' ? (
          <AuditLogPage />
        ) : activeApp === 'licensing' ? (
          enginePermissionStatus === 'ready' && canManageOneEngine
            ? <div className="superadmin-theme"><LicensingAdmin /></div>
            : enginePermissionNotice
        ) : activeApp === 'app-releases' ? (
          enginePermissionStatus === 'ready' && canManageOneEngine
            ? <div className="superadmin-theme"><AppReleasesAdmin /></div>
            : enginePermissionNotice
        ) : activeApp === 'profile' ? (
          <ProfilePage onBack={() => {
            const next = { app: 'settings', section: 'company' }
            setRouteState(next)
            setRoute('settings', 'company')
            setActiveApp('settings')
          }} />
        ) : activeApp === 'custom-page-runtime' ? (
          <CustomPageRuntimePage pageKey={routeState.pageKey || ''} />
        ) : activeApp === 'workspace' ? (
          <WorkspacePage
            initialObjectKey={routeState.objectKey || ''}
            initialRecordId={routeState.recordId || ''}
            appKey={routeState.appKey || ''}
            onNavigate={openItem}
            onRouteChange={(objectKey, recordId) => {
              const appKey = routeState.appKey || ''
              const next = { app: 'workspace', section: null, objectKey, recordId, appKey }
              setRouteState(next)
              setRoute('workspace', null, { objectKey, recordId, appKey })
            }}
          />
        ) : (
          <DashboardPage />
        )}
      </Suspense>
    </LazyLoadBoundary>
  )
}
