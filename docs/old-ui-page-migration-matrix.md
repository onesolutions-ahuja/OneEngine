# Old UI → Smart Theme Migration Matrix

Zero-loss rule: an old UI page/section is deleted only after its Smart Theme replacement has equivalent routes, data, permissions, actions, fields, validation and user-visible behaviour. If business logic is uncertain, mark HOLD and move on.

## Phase 1 — Settings

| Old UI page / section | Smart Theme replacement | Logic fully migrated? | Old UI deleted? | Status / note |
|---|---|---:|---:|---|
| General | Yes | Yes | Yes | Date format, currency, timezone, Scan & Go, exchange mode, batch inventory policy migrated. Batch settings retrieval fixed. |
| Company | Yes | Yes | Yes | Company identity/contact, currency/timezone, compressed logo upload/remove, licence summary migrated. |
| Tax / VAT | Yes | Yes | Yes | VAT enabled + validated 0–100% default rate migrated. Currency remains available under General/Company. |
| Receipts | Yes | Yes | Yes | Company header, VAT display/rate, date format and Hardware paper-width guidance migrated. |
| Store & Till | Partial | No | No | HOLD — old page still owns store/till editing, invoice prefixes, negative-inventory acknowledgement, dock quick-access ordering, Customer Display runtime launch/state and one-time Self-Checkout pairing keys. |
| Client Web Shop | Yes | Yes | Yes | Full settings form, store/price-list selection, pickup/delivery, own-delivery, sandbox payments, fees/minimum order, save and public storefront link migrated. |
| Payment Terminals | Yes | Yes | Yes | Configure/add/edit terminals, masked credentials, active state and connection testing migrated. |
| Customer Loyalty | Yes | Yes | Yes | Enable/disable programme and validated 0–100% earning-rate editing migrated with the existing entitlement gate. |
| Hardware | Yes | Yes | Yes | Barcode scanner, cash drawer and receipt printer configuration, scanner test capture, paper width, active state and device-test actions migrated. |
| Users | Yes | Pending full comparison | No | Pending |
| Roles & Permissions | Yes | Pending full comparison | No | Pending |
| AI assistant | Yes | Yes | Yes | Company JARVES allowance, enabled/remaining seats and server-enforced allowance validation migrated; per-user toggles remain on Users. |
| Connections | Yes | Yes | Yes | Integration/device health loading and refresh migrated; legacy health fetch/context removed from old Settings shell. |
| Uber Eats | Navigation only / pending | No | No | Pending |
| Deliveroo | Navigation only / pending | No | No | Pending |
| WhatsApp Assistant | Navigation only / pending | No | No | Pending |
| SMS Delivery | Navigation only / pending | No | No | Pending |
| Email Delivery | Navigation only / pending | No | No | Pending |
| Server / API Configuration | Partial | No | No | HOLD — Superadmin/no-company visibility is fixed, but hosted Smart Theme currently forces the production API base while the old page allows a real device-level server override. Business rule needs final decision. |
| Platform / Builder | Yes | Partial | No | Approval/workflow/dashboard administration parity still needs page-level audit. |
| Message Templates | Navigation only / pending | No | No | Pending |


## Phase 2 — Core Workspace / Object Runtime

| Old UI page / runtime | Smart Theme replacement | Logic fully migrated? | Old UI deleted? | Status / note |
|---|---|---:|---:|---|
| Dashboard | Yes | Yes | No | Runtime migrated: saved/default dashboards, dashboard selector, shared date range, refresh, generic KPI/chart/table/text/modern components and company currency. DELETE BLOCKER: legacy AdminLayout still imports Dashboard until shell cutover. |
| Dashboard Builder | Partial / OneBuilder direction | No | No | HOLD — builder editing, sharing and default assignments belong to the Platform/Builder hold. |
| Platform ObjectPage generic runtime | Yes — Workspace | Yes | No | Workspace now covers metadata fields/list views, FLS/object permissions, record types, create/edit/quick-create layouts, CRUD, metadata buttons, configured layout actions, related records + create-related, history, import/export and object/record deep links. Smart Theme Profile also uses the secure my-record feed directly. DELETE BLOCKER: old AdminLayout/SettingsObjectHost still consume ObjectPage until shell/platform cutover. |
| Shared ObjectList | Yes — RecordListView | Yes for Workspace | No | DELETE BLOCKER: Sales, Inventory, Purchases, Suppliers and Customers still import legacy ObjectList; delete after their module phases. |
| Shared ObjectRecordView | Yes — Workspace detail | Yes for Workspace | No | DELETE BLOCKER: old Platform FormRenderer/ObjectRecordDetail still import it. |
| SettingsObjectHost | Objects/metadata Settings replacement exists | Partial | No | HOLD with Platform/Builder; old metadata-hosted Settings routes still consume ObjectPage. |
| CustomPageRuntime | No complete Smart Theme runtime yet | No | No | HOLD with Platform/Builder/custom-page migration. |
| StandardObjectFormModal / StandardObjectViewModal | Workspace metadata editor/detail replacement | Partial | No | DELETE BLOCKER: Products, Customers, Suppliers, Stores and Users still consume these adapters until their module phases. |
| Profile / own User record route | Yes | Yes | No | Read-only metadata profile migrated using /api/platform/runtime/my-record. Legacy profile code remains only because AdminLayout itself is still active. |
| AdminLayout legacy shell | Smart Theme App shell | Partial | No | DELETE LAST — remaining old modules still route through AdminLayout. |

## Phase 3 — Sales + Returns

| Old UI page / runtime | Smart Theme replacement | Logic fully migrated? | Old UI deleted? | Status / note |
|---|---|---:|---:|---|
| Sales | Yes | Yes | No | ✅ Sales list/search, full sale detail, totals and manual invoice resend by SMS / Email / WhatsApp migrated. `/sales` route wired; installed OneSales launcher route opens Sales. ⏳ DELETE BLOCKER: legacy AdminLayout still imports SalesAdmin. |
| Customer Returns | Yes | Yes | No | ✅ Receipt lookup, returnable validation, remaining quantities, review, backend-authoritative refund calculation, stable idempotency key, online-only guard and return history/detail migrated. ⏳ DELETE BLOCKER: legacy AdminLayout still imports ReturnsAdmin. |
| Supplier Returns | Yes | Yes | Partial | ✅ Available received stock, quantity validation, supplier return posting and history migrated. ✅ Unused standalone duplicate SupplierReturnsAdmin.jsx deleted. ⏳ Embedded legacy component remains inside ReturnsAdmin until AdminLayout cutover. |
| Sale detail shared modal | Replaced in SalesPage | Yes for Sales | No | ⏳ Customers still imports the legacy SaleDetailModal; delete after Customers migration. |

## Phase 4 — Products + Categories

| Old UI page / runtime | Smart Theme replacement | Logic fully migrated? | Old UI deleted? | Status / note |
|---|---|---:|---:|---|
| Products | Yes | Yes | No | ✅ Protected Product Master migrated with Product list/search, stats, create/edit, server-authoritative SKU/barcode uniqueness, VAT/stock/batch controls, Platform extension fields + record types, Product history, import/export and activate/deactivate. ⏳ DELETE BLOCKER: legacy AdminLayout still imports ProductsAdmin. |
| Categories | Yes | Yes | No | ✅ Create, inline edit, display order, product counts, status, refresh and deactivate/uncategorise confirmation migrated. ⏳ DELETE BLOCKER: legacy AdminLayout still imports CategoriesAdmin. |
| Global Product Lookup | Yes | Yes | No | ✅ Provider discovery/configuration, test/save, barcode lookup, provider-status handling and Add to company catalogue flow migrated using the shared protected Product editor. ⏳ DELETE BLOCKER: legacy AdminLayout still imports GlobalProductLookupAdmin. |
| Legacy GlobalProductsAdmin.jsx duplicate | Not required | Yes | Yes | ✅ Deleted — legacy shell never imported this duplicate page. |
| ProductFormModal legacy adapter | Replaced by Smart Theme ProductEditor | Yes for migrated Product/Lookup pages | No | ⏳ Old ProductsAdmin + GlobalProductLookupAdmin still import it until AdminLayout cutover. |
| Variants / Bundles / Modifiers admin page | No old UI page existed | N/A | N/A | Backend/POS/package capabilities existed, but there was no legacy admin page to migrate. No replacement invented during cleanup. |

## Later phases

- Core workspace/object pages
- Sales / Returns
- Products / Categories
- Inventory / Replenishment / stock tools
- Purchases / Suppliers
- Customers / Loyalty / Credit / Gift cards
- Stores / Employees / Attendance
- Online Orders / Order Prep / Delivery
- Integrations / Accounting
- Reports
- Till / POS
- oneStore
- Superadmin
- Hospitality / deferred modules
- Scan & Go / Self Checkout / mobile scanner
- Audit / offline tools

This file is updated as each page completes. Every completed page is committed immediately; HOLD items are preserved and revisited after the safe migrations.
