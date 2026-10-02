import { apiUrl } from '../services/api'

const ICON_ALIASES = Object.freeze({
  onestore: 'onestore',
  onetill: 'onetill-new',
  one_till: 'onetill-new',
  till: 'onetill-new',
  retail_pos: 'onetill-new',
  one_kiosk: 'one-kiosk',
  receipt_qr: 'one-receipt-qr',
  inventory: 'inventory',
  batch_expiry: 'batch-expiry',
  hospitality: 'hospitality',
  kds: 'kds',
  customer_credit: 'customer-credit',
  customers: 'customers',
  suppliers: 'suppliers',
  reports: 'reports',
  products: 'products',
  staff: 'one-staff',
  communication_core: 'one-messaging',
  platform: 'one-developer',
  payment_reference: 'one-payment',
  paypal_qr: 'one-payment',
  one_connect_google: 'one-connect-google',
  one_connect_dojo: 'dojo',
  dojo: 'dojo',
  one_connect_sumup: 'sumup',
  sumup: 'sumup',
  one_connect_square: 'square',
  square: 'square',
  mobile_scanner_connector: 'barcode-scanner-connector-template',
  barcode_scanner_connector_template: 'barcode-scanner-connector-template',
  receipt_printer_connector_template: 'one-printer',
  kitchen_printer_connector_template: 'kitchen-printer-connector-template',
  cash_drawer_connector_template: 'cash-drawer-connector-template',
  email_connector: 'email',
  sms_connector: 'one-messaging',
  whatsapp_connector: 'whatsapp',
  whatsapp_assistant: 'whatsapp',
  whatsapp: 'whatsapp',
  uber_eats: 'uber-eats',
  deliveroo: 'deliveroo',
  just_eat: 'just-eat',
  quickbooks: 'quickbooks',
  quickbooks_online: 'quickbooks',
  shopify: 'shopify',
  xero: 'xero',
  xero_accounting: 'xero-accounting',
  sage: 'sage',
  sage_accounting: 'sage-business-cloud-accounting',
  sage_business_cloud_accounting: 'sage-business-cloud-accounting',
  open_food_facts: 'one-catalogue',
  go_upc: 'go-upc',
  client_web_shop: 'client-web-shop',
  own_delivery: 'one-delivery',
  prestashop: 'prestashop',
  woocommerce: 'woocommerce',
  wix: 'wix',
  adobe_commerce: 'adobe-commerce',
  magento: 'adobe-commerce',
  mews: 'mews',
  mews_pms: 'mews',
  fourth: 'fourth',
  deputy: 'deputy',
  caterbook: 'caterbook',
  one_connect_bopp: 'one-connect-bopp',
  bopp: 'one-connect-bopp',
  one_connect_wonderful: 'one-connect-wonderful',
  wonderful: 'one-connect-wonderful',
  one_connect_vyne: 'one-connect-vyne',
  vyne: 'one-connect-vyne',
  one_connect_stripe: 'one-connect-stripe',
  stripe: 'one-connect-stripe',
})

const PNG_APP_ICONS = new Set([])

const BRAND_ICON_MATCHES = [
  [/\bone\s*till\b|\bone_till\b|\bretail\s*pos\b/i,'onetill-new'],
  [/quickbooks/i,'quickbooks'],[/shopify/i,'shopify'],[/xero/i,'xero-accounting'],[/sage/i,'sage-business-cloud-accounting'],
  [/prestashop/i,'prestashop'],[/woocommerce|woo commerce/i,'woocommerce'],[/wix/i,'wix'],[/uber\s*eats/i,'uber-eats'],
  [/deliveroo/i,'deliveroo'],[/just\s*eat/i,'just-eat'],[/whatsapp/i,'whatsapp'],
  [/\bdojo\b/i,'dojo'],[/sum\s*up/i,'sumup'],[/\bsquare\b/i,'square'],[/\bmews\b/i,'mews'],
  [/\bfourth\b/i,'fourth'],[/\bdeputy\b/i,'deputy'],[/caterbook/i,'caterbook'],[/go[-\s]?upc/i,'go-upc'],
  [/adobe\s*commerce|magento/i,'adobe-commerce'],[/\bbopp\b/i,'one-connect-bopp'],[/wonderful/i,'one-connect-wonderful'],
  [/\bvyne\b/i,'one-connect-vyne'],[/\bstripe\b/i,'one-connect-stripe'],[/google/i,'one-connect-google'],
]

const ONE_ICON_MATCHES = [
  [/\bone\s*developer\b|\bdeveloper\b/i,'one-developer'],
  [/\bone\s*customer\b|\bcustomer\s*credit\b/i,'customers'],
  [/\bone\s*purchase\b|\bpurchase\b/i,'one-purchase'],
  [/\bone\s*sales\b|\bsales\b/i,'one-sales'],
  [/\bone\s*integrations?\b|\bintegrations?\b/i,'one-integrations'],
  [/\bone\s*assistant\b|\bassistant\b/i,'one-assistant'],
  [/\bone\s*kiosk\b|\bkiosk\b/i,'one-kiosk'],
  [/\breceipt\s*qr\b/i,'one-receipt-qr'],
  [/\bbatch.*expiry\b/i,'batch-expiry'],
  [/\binventory\b/i,'inventory'],
  [/\breports?\b/i,'reports'],
  [/\bstaff\b|\bemployees?\b|\bworkforce\b/i,'one-staff'],
  [/\bproducts?\b|\bcatalog\b/i,'products'],
  [/\bhospitality\b/i,'hospitality'],
  [/\bkds\b/i,'kds'],
  [/\bopen\s*food\s*facts\b|\bcatalogue\b/i,'one-catalogue'],
  [/\bown\s*delivery\b/i,'one-delivery'],
  [/\bpayment\b|\bpaypal\b/i,'one-payment'],
  [/\bmailjet\b|\bbrevo\b|\bemail\s*connect/i,'email'],
  [/\bprinter\b/i,'one-printer'],
  [/\bscanner\b/i,'mobile-scanner'],
]

export const MARKETPLACE_CACHE_KEY = 'onepos.marketplace.catalog.v1'

export function localAppIcon(assetKey = 'default-app') {
  const clean = String(assetKey || 'default-app').trim().toLowerCase().replaceAll('_', '-')
  const safe = /^[a-z0-9-]+$/.test(clean) ? clean : 'default-app'
  const extension = PNG_APP_ICONS.has(safe) ? 'png' : 'svg'
  const base = import.meta.env.BASE_URL || '/'
  return `${base}icons/apps/${safe}.${extension}`
}

export function appIconUrl(item) {
  const manifest = item?.manifest || {}
  const provider = manifest.providerConnector || manifest.provider_connector || {}
  const brandText = [item?.name, item?.publisher, item?.package_key, provider?.providerKey, provider.provider_key]
    .filter(Boolean)
    .join(' ')
  const brand = BRAND_ICON_MATCHES.find(([pattern]) => pattern.test(brandText))
  if (brand) return localAppIcon(brand[1])
  const oneIcon = ONE_ICON_MATCHES.find(([pattern]) => pattern.test(brandText))
  if (oneIcon) return localAppIcon(oneIcon[1])

  const keys = [
    item?.icon_asset_key, item?.iconAssetKey, manifest.iconAssetKey, manifest.icon_asset_key,
    provider.providerKey, provider.provider_key, item?.package_key,
  ].filter(Boolean)

  for (const key of keys) {
    const normalized = String(key).trim().toLowerCase().replace(/[\s-]+/g, '_')
    const alias = ICON_ALIASES[normalized]
    if (alias) return localAppIcon(alias)
  }

  const explicit = item?.icon_url || item?.logo_url || item?.icon
    || manifest.iconUrl || manifest.icon_url || manifest.logoUrl || manifest.logo_url || manifest.icon
    || provider.iconUrl || provider.logoUrl
  if (typeof explicit === 'string' && explicit.trim()) {
    const value = explicit.trim()
    if (/^https?:\/\//i.test(value)) return value
    if (value.startsWith('/icons/apps/')) return `${import.meta.env.BASE_URL || '/'}${value.replace(/^\//, '')}`
    return apiUrl(value.startsWith('/') ? value : `/${value}`)
  }
  return localAppIcon('default-app')
}

export function applyDefaultAppIcon(event) {
  if (!event?.currentTarget) return
  event.currentTarget.onerror = null
  event.currentTarget.src = localAppIcon('default-app')
}

export function readMarketplaceCache() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(MARKETPLACE_CACHE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeMarketplaceCache(items) {
  try {
    if (Array.isArray(items) && items.length) {
      sessionStorage.setItem(MARKETPLACE_CACHE_KEY, JSON.stringify(items))
    }
  } catch {}
}

const DEDICATED_OPEN_ROUTES = Object.freeze({
  platform: '/app/developer',
  one_connect_google: '/app/google-connect',
  client_web_shop: '/app/settings/client-web-shop',
  own_delivery: '/app/own-delivery',
  email_connector: '/app/settings/email-delivery',
  sms_connector: '/app/settings/sms-delivery',
  whatsapp_assistant: '/app/settings/whatsapp-assistant',
  one_assistant: '/app/assistant',
  one_kiosk: '/app/kiosk-devices',
  mobile_scanner_connector: '/app/settings/hardware',
})

export function resolveAppOpenRoute(item) {
  const key = String(item?.package_key || item?.manifest?.packageKey || '')
  if (DEDICATED_OPEN_ROUTES[key]) return DEDICATED_OPEN_ROUTES[key]

  const connectorApp = item?.manifest?.connectorApp || item?.company_installation?.manifest?.connectorApp
  if (connectorApp && !connectorApp.template) return `/app/connector-settings/${encodeURIComponent(key)}`

  const declared = String(item?.route || item?.manifest?.route || item?.company_installation?.manifest?.route || '').trim()
  if (declared === '/app/custom/client-web-shop') return '/app/settings/client-web-shop'
  if (declared === '/app/custom/own-delivery') return '/app/own-delivery'
  if (declared === '/app/settings/platform') return '/app/developer'
  if (declared && !declared.startsWith('/app/custom/')) return declared

  return '/app/integrations'
}

export function marketplaceSearchText(item) {
  const manifest = item?.manifest || {}
  const capabilities = Array.isArray(manifest.capabilities) ? manifest.capabilities.join(' ') : ''
  const dependencies = Array.isArray(manifest.dependencies) ? manifest.dependencies.map((value) => typeof value === 'string' ? value : value?.packageKey || value?.package_key || '').join(' ') : ''
  return `${item?.name || ''} ${item?.package_key || ''} ${item?.category || ''} ${item?.publisher || ''} ${item?.description || ''} ${capabilities} ${dependencies}`.toLowerCase()
}
