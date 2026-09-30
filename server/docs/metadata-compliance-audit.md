# onePOS — Full Metadata-Driven Compliance Audit

**Date:** 27 September 2026 · **Scope:** entire repo (app + website) · **Mode:** AUDIT ONLY, no refactors performed.

**Method.** Every shell (`App.jsx`, `AdminLayout.jsx`, `AdminNavDock.jsx`, `POS.jsx`, `SettingsAdmin.jsx`, `CustomPageRuntime.jsx`) was traced to its actual metadata source (server routes in `routes/*.js`, registries in `services/*`, page/definition payloads), not just to React props. Marketing site (`src/marketing/*`, `website/index.html`), hospitality, POS, reports, settings and Platform admin were all inspected. Files reviewed: **~140 first-party source files** across `src/pages`, `src/components`, `src/utils`, `src/services`, `src/marketing`, `routes`, `services`, plus docs.

---

## 0. Architecture inventory (what "metadata-driven" means here — verified)

| Canonical feature | Implementation (verified source) |
|---|---|
| Objects / Fields / FLS / Record Types | `platform_objects`, `platform_fields`, `platform_field_security`, `platform_record_types` (`services/platformMetadata.js`, enforced in `routes/platform.js`) |
| Generic record CRUD + history + sharing | `/api/platform/objects/:key/records...` (`routes/platform.js`), `services/platformSharing.js`, `platform_record_history` |
| Form/Page layouts | `platform_layouts` + `platform_pages.definition` JSONB; builders `LayoutEditor.jsx`, `PageBuilder.jsx`, `CustomPageBuilder.jsx`; shared renderer `src/components/platform/CustomPageRenderer.jsx` |
| Component Registry | `services/platformComponentRegistry.js` + `/api/platform/component-registry` (single server-authoritative vocabulary) |
| Action Registry / Buttons / Workflows | `services/platformActionRegistry.js`, `platformButtonRegistry.js`, `platformWorkflow.js`; execute endpoints `.../buttons/:key/execute`, `.../actions/:key/execute`, `/platform/runtime/page-interactions/execute` |
| Reports | `platform_reports` metadata + generic engine (`services/reportableSources.js`, `routes/reports.js`), Custom Report Builder `CustomReportsAdmin.jsx` |
| Dashboards | `/api/dashboards` definitions + `/run` engine (`routes/dashboardBuilder.js`, `services/dashboardBuilder.js`); runtime `DashboardGrid` reads saved metadata |
| Navigation | server-filtered `/api/platform/runtime/app-catalog` (modules + `objectPages`) → `navCatalogue.js` → `DockHost`/`AdminNavDock`/`AdminShell`; configured Object pages via `platformObjectNavigation.js` |
| Packages / Apps | `package_registry`, `company_package_installations`, dependencies, entitlements (`services/packageRegistry.js`, `packageEntitlements.js`); oneStore storefront + App Launcher consume the same payloads |
| Settings host for Objects | `SettingsObjectHost.jsx` capability (currently zero entries enabled) |

The platform core is genuinely metadata-driven. The gaps below are the surfaces that **bypass or duplicate** it.

---

# PART 1 — GAP FINDINGS BY SEVERITY

Each finding: Area · Screen · Files · What is hard-coded · Why it violates the architecture · Canonical feature to reuse · Migration · Effort.

## CRITICAL

### C-1. Product CSV Export bypasses `apiRequest` and reads a non-existent token key → export is broken/unauthenticated for every user
- **Area:** 13 API / Data Access
- **Screen:** Products → Export
- **Files:** `src/pages/products/ProductsAdmin.jsx` lines ~118–124 (`handleExport`)
- **Hard-coded:** raw `fetch("/api/products/export", { headers: { Authorization: \`Bearer ${localStorage.getItem("token")}\` } })`. The app's token key is `onepos_token` (`src/services/api.js:12`). `localStorage.getItem("token")` is always `null`, so the request sends `Bearer ` (empty) — every export fails 401 unless the browser attaches cookies (it doesn't; this API is bearer-token).
- **Why:** bypasses the canonical `apiRequest` (which injects `onepos_token` **and** `X-Acting-Company-Id` for business-division scope). Even if the key were fixed, acting-company switching would be lost — a data-isolation hazard.
- **Reuse:** `apiRequest` (or an `apiBlob` wrapper) — the same call every other export should use.
- **Migration:** swap to `apiRequest("/api/products/export")` + blob handling (tiny fix).
- **Severity:** CRITICAL · **Effort:** SMALL *(also the one "tiny obvious safe fix" candidate; left untouched per audit-only instruction)*

### C-2. Admin shell duplicates module→page mapping and permission gates as front-end constants
- **Area:** 9 Navigation / 10 Package activation / 14 Security metadata
- **Screen:** every admin page
- **Files:** `src/pages/admin/AdminLayout.jsx` lines ~108–135 (`CATALOG_MODULE_BY_PAGE`, re-declared) and lines ~1190–1450 (the `page === "..."` render ladder with per-page `Access denied` JSX); duplicated again in `src/utils/navCatalogue.js` lines 27–49 (`CATALOG_MODULE_BY_PAGE` copy #2)
- **Hard-coded:** mapping of 21 page names → module keys, plus per-page `isAdmin || permissions.includes(...)` gates re-implemented in JSX; 25-branch `page ===` component ladder.
- **Why:** the runtime app-catalog endpoint (`routes/platform.js:3244`) is the authoritative module filter (install + company enablement + licence + permission). Duplicating the map client-side means a package rename/duplicate module key silently breaks filtering, and the two copies of `CATALOG_MODULE_BY_PAGE` can drift (they already exist as two files). Hard-coded permission ladders are weaker/parallel to the server's `moduleRuntimeAccess` decision.
- **Reuse:** `/api/platform/runtime/app-catalog` `data` entries already carry `module_key`, `route`, permissions; `platformObjectNavigation.js` already shows the correct pattern for Object pages.
- **Migration:** derive the page→module mapping (and route) from catalog entries keyed by `route`; collapse the render ladder into a page-registry map `{ page: { component, permission } }`. Effort MEDIUM.
- **Severity:** CRITICAL (dual maintenance of the security/visibility model) · **Effort:** MEDIUM

### C-3. Hard-coded tenant data in the shell: `storeName="London Store"`
- **Area:** 14 Security/tenant isolation (display) / 4 Layouts
- **Screen:** Admin header (all pages), also `src/pages/auth/Login.jsx:187` (`Till 01 · London Store`)
- **Files:** `src/pages/admin/AdminLayout.jsx:1188`, `src/pages/auth/Login.jsx:187`
- **Hard-coded:** the company/store name shown in the shell and login screen is a string literal; `settings.store.name` is already loaded in `POS.jsx` (`/api/settings` → `data.data.store.name`).
- **Why:** multi-tenant app shows the wrong tenant name for every company except one; the platform already resolves the signed-in store per token.
- **Reuse:** `/api/settings` store payload (already fetched and cached in `services/offlineStore.js`).
- **Migration:** pass `settings?.store?.name` (fallback blank) from the shell.
- **Severity:** CRITICAL (tenant correctness, user-visible) · **Effort:** SMALL

### C-4. Settings mutations bypass the platform settings runtime with bespoke one-off endpoints and duplicated save logic
- **Area:** 8 Settings / 11 Business rules / 13 API
- **Screen:** Settings → Store & Till (five separate cards), Batch Inventory, Negative Inventory, JARVES, Users list toggle
- **Files:** `src/pages/settings/SettingsAdmin.jsx` — `InvoicePrefixesSetting` (PUT `/api/settings` whole-form resend, lines ~1935–1945), `TillProductViewSetting` (same whole-form resend, ~1990), `DockQuickAccessSetting` (~2065), `CustomerDisplaySetting` (~2130), `BatchInventoryPolicySetting` (PUT `/api/settings/batch-policy` ~900), `NegativeInventoryBillingSetting` (PUT `/api/settings/negative-inventory-billing` with client `window.confirm`, ~1310), `UsersSettings.toggleJarves` (PUT `/api/admin/users/:id/jarves` ~1105)
- **Hard-coded:** each card owns its own load/save/duplicate-form state; three different save contracts for the same `/api/settings` resource (whole-form resend ×4, two bespoke sub-endpoints); enable/disable toggles send their own payloads.
- **Why:** the same setting is editable through 3 code paths that can disagree (e.g. `InvoicePrefixesSetting` resends the parent form snapshot and can silently revert a concurrent edit — the code even documents this dependency: `if (!form.companyName) return; /* parent form not ready */`). Business acknowledgements (negative inventory `window.confirm`) belong to validation metadata/workflow, not a bespoke endpoint contract.
- **Reuse:** a canonical settings-command surface (single `PUT /api/settings` merge-patch, or platform settings object records with FLS).
- **Migration:** route every card through one settings update command; drop per-card form snapshots. Effort MEDIUM.
- **Severity:** CRITICAL (concurrent-edit data loss risk + duplicated rule logic) · **Effort:** MEDIUM

## HIGH

### H-1. POS till (basket, discounts, holds, payment flow) is one monolithic hard-coded page
- **Area:** 4 Layouts / 2 Buttons / 11 Business rules
- **Screen:** Till (`/app` POS surface)
- **Files:** `src/pages/pos/POS.jsx` (2,788 lines) + `CartPanel.jsx`, `MobileCartSheet.jsx`, `PaymentModal.jsx`, `TillActionsModals.jsx`, `DiscountModal` & `AgeVerificationModal` & `HeldSalesModal` inline in `POS.jsx`
- **Hard-coded:** the entire till action bar (Hold / Resume / Customer / Discount / Void / Misc Item / Petty Cash / Print — 8 inline `<button>`s with local handlers); discount rules (`percent ≤ 100`, `amount ≤ subtotal` re-implemented client-side, `POS.jsx:980–1015`); age-gate, negative-stock pre-flight and offline-permission re-checks coded inline; held-sale and checkout payloads constructed by hand.
- **Why:** the platform has an Action Registry, workflow engine and validation rules; the till re-implements permission+validation logic per button, so each new till action or validation change requires a code change and can drift from the canonical rules (`sale.discount` gate is correct, but the *bounds* logic duplicates what validation rules should own).
- **Reuse:** Action Registry (`RECORD_SAVE`-style registered actions with `requiredPermission`), platform validation rules, workflow engine for tender/hold flows.
- **Migration (incremental, safe):** (1) move the 8 till buttons onto registered action definitions (labels/permissions/visibility from metadata, handlers remain native POS code); (2) move discount bounds + age policy into validation-rule metadata. This is an *acceptable-hard-coded* surface for the low-level basket/tender UX itself (see Exceptions §3).
- **Severity:** HIGH · **Effort:** LARGE

### H-2. The 10 fixed reports are hard-coded components with fixed columns/filters/endpoints
- **Area:** 5 Reports / 7 Lists
- **Screen:** Reports → Sales by Day, Payments, Top Products, Customers, Inventory Overview, Stock Movements, Profit & Margin, Till & Cash, VAT Summary, Sales Reports module
- **Files:** `src/pages/reports/ReportPage.jsx` (`REPORT_MENU_ITEMS` list + `switch (reportKey)` + `PROP_DRIVEN_REPORTS` fetch ladder), `SalesReport.jsx` (fixed `headers` array + `£` formatting), `ReportsAdmin.jsx` (fixed 3-up fetch + fixed 9-report grid), `SalesReportsModule.jsx` (fixed groupings `day/store/user/product`), `PaymentsReport.jsx`, `ProductsReport.jsx`, `CustomersReport.jsx`, `InventoryReport.jsx`, `StockMovementLedger.jsx`, `ProfitReport.jsx`, `TillReport.jsx`, `VATReport.jsx`
- **Hard-coded:** report catalogue (names, subtitles, permission codes), column sets, currency formatting (`£` literals), endpoint selection, groupings. Only `CustomReportsAdmin` is metadata-driven.
- **Why:** the generic engine (`services/reportableSources.js` + `platform_reports`) already supports fields/groupBy/filters/sort/summaries/presentation for both standard sources (sales, products, customers, inventory, payments, hospitality) and platform objects. Every fixed report is a special case the engine could express; adding a column today = code change in 2 files.
- **Reuse:** Custom Report Builder definitions (optionally seeded as system reports), `ReportTable` presentation, canonical datasource keys.
- **Migration:** express each fixed report as a seeded `platform_reports` definition rendered by the generic runner; keep `ReportPage` only as a thin router to the generic runner. Effort LARGE.
- **Severity:** HIGH · **Effort:** LARGE

### H-3. Hospitality suite is fully hard-coded (largest unmigrated domain)
- **Area:** 4 Layouts / 6 Components / 12 Picklists / 11 Business rules
- **Screen:** Hospitality Workspace, Floor Operations, KDS, Hospitality Reports/Dashboard
- **Files:** `src/pages/hospitality/HospitalityWorkspace.jsx` (fixed tab array incl. embedded `AuditLogAdmin hospitalityOnly`), `HospitalityOperations.jsx` (all floor/table/reservation/bill/split/service-charge/kitchen forms, inline `<select>` status state machines), `KitchenDisplay.jsx` (hard-coded `next[t.status]` state machine), `HospitalityDashboard.jsx`, `HospitalityReports.jsx`
- **Hard-coded:** session-status transitions (`OPEN→ORDERING→SERVED→CHECK_REQUESTED→COMPLETED` inline map in `HospitalityOperations.jsx:7`), table statuses, split modes (`ITEMS/QUANTITY/EQUAL`), service-charge types, reservation form fields, QR/bill/lifecycle endpoints called directly per action.
- **Why:** table/session/bill are business objects with statuses that belong in Object metadata + workflow state machines + Action Registry; the platform's kanban/timeline/table components and custom pages could host the floor view. Any status change is a code deploy today.
- **Reuse:** Platform Objects (floor, table, session, reservation), workflow engine for lifecycle transitions, Custom Pages (kanban + timeline) for the floor board, Action Registry for lifecycle buttons.
- **Migration:** staged — objects first (metadata CRUD over `/api/hospitality/*` internals), then actions, then custom-page floor view. Effort LARGE.
- **Severity:** HIGH · **Effort:** LARGE

### H-4. Online Orders lifecycle hard-codes statuses/actions/badges outside metadata
- **Area:** 12 Picklists / 2 Buttons / 11 Business rules
- **Screen:** Online Orders (admin + prep)
- **Files:** `src/pages/online/onlineOrdersShared.js` (`ACTIVE_STATUSES`, `TERMINAL_STATUSES`, `STATUS_BADGES`, `ORDER_ACTIONS`, `STATUS_ACTIONS`, `PREP_STATUS_ACTIONS`), `OnlineOrdersAdmin.jsx` (fixed columns, `platformFilter`), `OnlineOrdersPrep.jsx`, `useOnlineOrderActions.js`
- **Hard-coded:** the platform-order state machine and per-status action matrix live as front-end constants; the Uber/Deliveroo mapping (`platformLabel`) is also fixed. *Nuance:* part of this is provider-contract (see §3 Exceptions — external platform statuses are legitimately fixed), but the internal lifecycle (accept/ready/complete/cancel per status) duplicates what a workflow state machine + record actions already provide, and KDS/hospitality carry their own parallel machines.
- **Reuse:** workflow engine + Object record actions on the `platform_order` object; status pills can come from value-set metadata.
- **Migration:** model order status as a picklist with a workflow; keep only provider wire constants in code. Effort MEDIUM.
- **Severity:** HIGH · **Effort:** MEDIUM

### H-5. Settings section catalogue, icons, descriptions and tab gating are front-end constants
- **Area:** 8 Settings / 9 Navigation
- **Screen:** Settings shell
- **Files:** `src/pages/settings/SettingsAdmin.jsx` lines 32–117 (`SETTING_GROUPS`, `SETTINGS_GROUP_TONES`, `SETTINGS_GROUP_ICONS`, `SETTINGS_TAB_ICONS`, `SETTINGS_TAB_DESCRIPTIONS`), `SETTINGS_CONTEXT_PAGES` (~530), `SETTING_GROUPS`-derived `tabs`; `src/utils/settingsAccess.js` (section visibility)
- **Hard-coded:** the whole Settings information architecture (22 sections, icons, copy, context-panel membership) and per-role section visibility live in code; `SETTINGS_OBJECT_HOSTS` exists but is empty (commented-out Users/Stores hosts).
- **Why:** the app exposes a runtime navigation model for main pages and Objects, but Settings — the most configuration-heavy surface — has none; a new integration or package cannot add a Settings section without editing `SettingsAdmin.jsx`. The `SettingsObjectHost` capability was built for this and is unused.
- **Reuse:** `SettingsObjectHost.jsx` + platform_pages/app-catalog metadata (server-filtered section list), per-section permission metadata.
- **Migration:** move the section registry to server metadata (key, label, icon, permission, optional objectKey host) consumed by the shell. Effort MEDIUM.
- **Severity:** HIGH · **Effort:** MEDIUM

### H-6. `PlatformStudio`/`ObjectEditor`-driven Object admin is metadata-driven, but `SettingsAdmin` Users/Roles/Stores/Stores&till record management re-implements it
- **Area:** 1 Fields / 3 Record views / 8 Settings
- **Screen:** Settings → Users, Roles & Permissions, Store & Till, Payment Terminals, Hardware
- **Files:** `src/pages/settings/SettingsAdmin.jsx` — `UsersSettings` (fixed `SettingsTable columns={["Name","Username / Email",...]}`, hand-built edit form via `UserFormModal`, `filteredUsers` client filter), `RoleListManager` (fixed columns, inline dialog form), `StoreEditRow`/`TillEditRow` (fixed 5-field dialogs), `PaymentTerminalSettings` (fixed field array `["provider","name","terminalIdentifier","connectionUrl","apiCredentials"]`), `HardwareSettings` (fixed `definitions` array + fixed connection-type picklist `["Keyboard / HID","Local service","Network","USB / Serial"]` and paper widths `["58mm","80mm"]`)
- **Hard-coded:** full record lists + edit forms + picklists for domain entities that are (or should be) Platform Objects — while `SETTINGS_OBJECT_HOSTS` (line ~90) explicitly anticipates hosting the generic Object UI for exactly these.
- **Why:** the generic Object runtime (`ObjectPage.jsx` + `FormRenderer.jsx` + `ObjectList.jsx`) renders any object's fields, layout, FLS and record types from metadata; these Settings forms duplicate that with weaker guarantees (no FLS, no layouts, no audit-consistent history surface).
- **Reuse:** `SettingsObjectHost` → `ObjectPage` (the code itself documents `// "Users": { objectKey: "employee" }` as the intended design).
- **Migration:** enable hosts for Users/Stores/Tills/Terminals; move connection-type/paper-width picklists into value sets. Effort MEDIUM.
- **Severity:** HIGH · **Effort:** MEDIUM

## MEDIUM

### M-1. Dashboard Builder ships a mirrored component/field vocabulary
- **Area:** 6 Dashboards/Components
- **Screen:** Dashboards builder/runtime
- **Files:** `src/components/dashboard/platformDashboard.js` (`DASHBOARD_COMPONENTS`, `DASHBOARD_SALES_FIELDS`, `DASHBOARD_DATE_RANGES`) vs server registry `services/platformComponentRegistry.js` (dashboard entries `kpi`, `pie_chart`, …) and `services/reportableSources.js` (sales fields)
- **Hard-coded:** a client copy of the component vocabulary and datasource fields ("The server stays authoritative; this exists so the runtime and the Builder render … without importing server code").
- **Why:** three sources must be kept in sync by hand; a new dashboard component or sales field can appear server-side and be invisible (or mislabeled) client-side. The Component Registry Admin already fetches the server registry via `/api/platform/component-registry` — the builder can too.
- **Reuse:** `/api/platform/component-registry` + reportable-source field metadata endpoint.
- **Migration:** fetch the vocabulary at builder/runtime load with the current constants as fallback. Effort SMALL.
- **Severity:** MEDIUM · **Effort:** SMALL

### M-2. Customer detail drawer duplicates the record view it just migrated away from
- **Area:** 3 Record views
- **Screen:** Customers → row detail
- **Files:** `src/pages/customers/CustomersAdmin.jsx` `CustomerAdminDetail` (~lines 420–537: hand-built header, 4 KPI tiles, phone/email grid, sales table)
- **Hard-coded:** a second, page-specific record-detail layout beside the metadata-driven `StandardObjectViewModal` already wired to the same object.
- **Why:** two record views for `customer` drift; KPI tiles (total orders/spent/AOV) are roll-up fields the platform already computes (`field_type === "rollup"`).
- **Reuse:** `StandardObjectViewModal` + related list + rollup fields; extension content can pass as `children` (the modal supports it — see Suppliers usage).
- **Migration:** port the drawer's extras into the object detail layout/related lists. Effort SMALL.
- **Severity:** MEDIUM · **Effort:** SMALL

### M-3. Category/status option arrays sprinkled through business pages
- **Area:** 12 Picklists
- **Files/Screens:**
  - `src/pages/settings/SettingsAdmin.jsx:~2925` environment picklist `["sandbox","production"]`, order acceptance `["manual","auto"]`, OTP `["no","yes"]` (OnlinePlatformSettings)
  - `src/pages/settings/SettingsAdmin.jsx` Batch policy picks (`none|optional_dates|required_dates`, MFG/expiry rules)
  - `src/pages/inventory/InventoryAdmin.jsx` movement-type filter (`ALL` + movement types), reconciliation table headers
  - `src/pages/pos/POS.jsx` discount type `percent|amount`, `productView image|compact`
  - `src/pages/hospitality/HospitalityOperations.jsx` split modes, service-charge types (covered in H-3)
- **Why:** these are company-visible enumerations; value sets (`ValueSetList.jsx`, `platform value sets`) exist so admins can extend them without deploys. Provider `sandbox/production` and internal-only enums may stay (see §3).
- **Reuse:** platform value sets referenced from field metadata.
- **Migration:** promote user-facing lists (movement types, split modes, order acceptance) to value sets; keep protocol constants. Effort SMALL each.
- **Severity:** MEDIUM · **Effort:** SMALL

### M-4. Row-action buttons re-implemented per page instead of Object button metadata
- **Area:** 2 Buttons/Actions
- **Screens/Files:** Customers row actions (`CustomersAdmin.jsx` renderActions: View/Edit/Loyalty/Credit/Activate), Suppliers row actions (`SuppliersAdmin.jsx`), Inventory (`InventoryAdmin.jsx` Adjust/History/Reconcile buttons), Products page-level actions + `renderCanonicalProductActions`, Sales refresh/resend actions (`SalesAdmin.jsx` SaleDetailModal channel resends)
- **Hard-coded:** each page hand-renders its action set and calls endpoints directly (e.g. Activate toggles PUT `/api/platform/objects/customer/records/:id` from the page).
- **Why:** `platform_buttons` + `/buttons/:key/execute` (with `requiredPermission` and visibility rules) already exists and `ObjectPage.handleMetadataButton` proves the flow; per-page copies bypass permission metadata and visibility-rule metadata.
- **Reuse:** `platform_buttons` rows (targetType action/workflow, `requiredPermission`, `visibilityRule`), Action Registry.
- **Migration:** register the per-object actions (Activate/Deactivate, Credit, Loyalty, Adjust stock…) as platform buttons; pages render from the record-buttons payload. Effort MEDIUM.

### M-5. `AdminNavDock` launcher groups are static; configured Object pages are appended, not grouped
- **Area:** 9 Navigation
- **Files:** `src/components/AdminNavDock.jsx` (`GROUPS` array lines ~70–82 hard-coding which page names sit under Workspace/Operations/Catalogue/Business/Admin), `DOCK_LABELS` special cases
- **Hard-coded:** launcher grouping is a literal array; server-supplied Object pages always land in a single trailing "Objects" bucket.
- **Why:** page metadata (navCatalogue entries + catalog `category`) already carries grouping data (`internalAppCatalog.category`); groups duplicate it.
- **Reuse:** `internalAppCatalog` `category` field + `platformObjectNavigation` ordering.
- **Migration:** derive launcher groups from the catalog payload's category. Effort SMALL.
- **Severity:** MEDIUM · **Effort:** SMALL

### M-6. Custom Page runtime keeps page-keyed escape hatches to physical components
- **Area:** 4 Layouts / 10 Package activation
- **Files:** `src/components/CustomPageRuntime.jsx` lines ~330–345 — `definition.runtime_component === "hospitality_operations" | "hospitality_workspace" | "kitchen_display" | "uber_eats_settings"` switch rendering imported components; legacy `LegacyFlatPage` + `ControlFallback` rendering inert placeholder controls
- **Hard-coded:** named `runtime_component` bindings that wire saved page metadata to specific React components; legacy flat pages render dead controls (a picklist with one "Select…" option).
- **Why:** a page definition that names a component is a hard-coded app-name check in metadata clothing — uninstalling Hospitality doesn't remove the binding, and the registry-driven path (Component Registry keys + `NodeView`) exists for everything else. Dead legacy renderers confuse the "one renderer" guarantee the file itself claims.
- **Reuse:** Component Registry entries (`kanban`, `timeline`, `table`, `button` …) + page-interaction executor; retire `LegacyFlatPage` after a definition migration.
- **Migration:** register the three hospitality surfaces as proper record-bound components or move them to dedicated nav entries; add a one-time definition normalizer; delete flat-page fallback. Effort MEDIUM.
- **Severity:** MEDIUM · **Effort:** MEDIUM

### M-7. Settings → Platform rail and PlatformAdmin view keys are static
- **Area:** 9 Navigation (admin tooling)
- **Files:** `src/pages/settings/Platform/platformNav.js` (`PLATFORM_GROUPS`, `SURFACE_KEY_BY_VIEW`), `src/pages/settings/PlatformAdmin.jsx` (view switch keyed off those keys)
- **Hard-coded:** platform-admin navigation map. **Classification note:** this is the *technical admin console* — the task brief allows system-shell hard-coding. Flagged MEDIUM only because new Platform surfaces (already shipped: deployments, approvals, work-items) required editing this file each time.
- **Reuse:** same nav-catalogue pattern as main pages if desired.
- **Migration (optional):** data-drive the group list; keep view routing in code. Effort SMALL.
- **Severity:** MEDIUM (low priority; acceptable to keep) · **Effort:** SMALL

### M-8. `ObjectList` column definitions are per-page literals where list-view metadata exists
- **Area:** 7 Tables/Lists
- **Files:** `SALE_COLUMNS` (`SalesAdmin.jsx:8`), `SUPPLIER_COLUMNS` (`SuppliersAdmin.jsx:11`), `PURCHASE_COLUMNS` (`PurchasesAdmin.jsx:17`), `INVENTORY_COLUMNS` (`InventoryAdmin.jsx:11`), `customerColumns()` (`CustomersAdmin.jsx:21`)
- **Hard-coded:** column sets (keys/labels/pills) per page. **Mitigation already in place:** presentation itself is the shared `ObjectList.jsx`, which *accepts* metadata columns and falls back to deriving them from records — the data source is still per-domain endpoints (`/api/sales`, `/api/suppliers` …) rather than the object record API.
- **Why:** `platform_layouts` page_type=list and the generic record list (`/api/platform/objects/:key/records` with pagination/filter) exist; per-page literals and per-domain endpoints mean FLS/projection is applied twice in different vocabularies.
- **Reuse:** object list layouts + generic record list endpoint (as `ObjectPage` already does for product).
- **Migration:** per domain: define a list layout, point the page at the object records API (sales/suppliers/purchases/inventory already have seeded objects per `PLATFORM_CAPABILITY_MATRIX.md`). Effort MEDIUM per domain.
- **Severity:** MEDIUM · **Effort:** MEDIUM

## LOW

### L-1. `DOCK_PAGE_OPTIONS` duplicates the page catalogue
- **Files:** `src/pages/settings/SettingsAdmin.jsx:~2035` (`DOCK_PAGE_OPTIONS`, 20 literal page names) vs `navCatalogue.js NAV_CATALOGUE` and `dockConfiguration.js`
- **Gap:** dock picker offers a hand-typed list; new pages (e.g. OneStore) must be added in three places.
- **Migration:** feed the picker from `permittedNavItems()` + catalog. Effort SMALL.

### L-2. `App.jsx` hard-codes device-profile/landing fallbacks in code
- **Files:** `src/App.jsx` (`resolveLandingFlow` wiring, `localStorage onepos_device_profile`, offline-session permission re-check `permissions.includes("sale.create")` at line ~310)
- **Gap:** landing-flow rules are server metadata (`runtimeAccess.js` resolves `landingFlow` correctly) but the *offline* fallback re-implements a permission check inline.
- **Migration:** reuse the cached permission state's landingPath uniformly. Effort SMALL. Partially acceptable (offline bootstrap, see §3).

### L-3. `formatRecordValue` hard-codes GBP currency formatting
- **Files:** `src/components/platform/CustomPageRenderer.jsx` `formatRecordValue` (`currency: "GBP"` literal)
- **Gap:** the platform renders record currency per company setting elsewhere; the custom-page renderer pins GBP.
- **Migration:** use the shared currency formatter (`utils/formatters.js`). Effort SMALL.

### L-4. Report header/permission metadata duplicated between `REPORT_MENU_ITEMS` and permission seeds
- **Files:** `src/pages/reports/ReportPage.jsx` (permission strings) + `database/init.js` seeds + `SettingsAdmin.jsx PERMISSION_GROUPS` (~1430: full permission catalogue copy #3 in the client)
- **Gap:** the permission matrix UI carries a 100+ code literal catalogue; `/api/admin/permissions` already returns the authoritative list (the code even handles "not synced" rows).
- **Migration:** render groups from `/api/admin/permissions` metadata (keep group labels as metadata). Effort SMALL.

### L-5. Marketing site duplicates the app/integration catalogue
- **Files:** `src/marketing/data/integrationData.js`, `ecosystemData.js`, `industryData.js`, `platformData.js`, `productData.js`; per-page `FEATURES` arrays (`HomePage.jsx`, `InventoryPage.jsx`, `PurchasingPage.jsx`); `website/index.html` static SEO copy
- **Gap:** integration names/statuses (Uber Eats, Deliveroo, Just Eat, Shopify, WhatsApp, Xero/Sage/QuickBooks) are hand-maintained and can drift from `internalAppCatalog`/`packageRegistry` (e.g. a package renamed or unpublished in oneStore keeps its marketing card). Marketing *copy/layout* is acceptable hard-coded; the **catalog-shaped data** is the drift risk.
- **Migration:** generate `integrationData`/`ecosystemData` from `packageRegistry` (build-time script or a small public JSON feed), keep prose in code. Effort SMALL.

### L-6. `AdminShell` store launcher/switcher app meta duplicated (`APP_META` in `adminApps.js` vs `internalAppCatalog` names/routes)
- **Files:** `src/utils/adminApps.js` `APP_META` (10 entries with names/descriptions/routes) vs `services/internalAppCatalog.js` (same keys, names, routes, descriptions)
- **Gap:** two descriptions of the same modules; renaming a module in the catalog leaves the switcher label stale.
- **Migration:** catalog entries already ride in the runtime payload; drop `APP_META` fallbacks for name/description/route (keep icon keys). Effort SMALL.

---

# PART 2 — CLASSIFICATION OF MAJOR PAGES (A/B/C/D)

| Page / surface | Files | Class | Notes |
|---|---|---|---|
| Platform Object pages (any configured object) | `ObjectPage.jsx` + Form/Detail renderers | **A** | fields, layouts, record types, related lists, buttons, FLS, history all from metadata |
| Custom Pages (visual builder) | `CustomPageRuntime.jsx` + `CustomPageRenderer.jsx` | **A** | single tree in `platform_pages.definition`; interactions via workflow/action/navigate/form_layout executors (minus M-6 escape hatches) |
| Dashboards | `Dashboard.jsx`, `DashboardGrid`, `DashboardBuilder.jsx` | **A** (vocabulary mirror M-1) | definitions + `/run` engine; nothing KPI-named in code |
| Custom Reports ("My Reports") | `CustomReportsAdmin.jsx` | **A** | full builder over `platform_reports`, platform-object datasource incl. relationship fields |
| Products | `ProductsAdmin.jsx` + `ProductFormModal.jsx` | **A-/B** | list+form via generic runtime; page adds import/export/actions and KPI cards in code (H/M-4, L-1) |
| Customers | `CustomersAdmin.jsx` | **B** | shared `ObjectList` + `StandardObjectForm/ViewModal`, but page-specific columns, stat cards, detail drawer (M-2) and actions (M-4) |
| Suppliers | `SuppliersAdmin.jsx` | **B** | same hybrid shape as Customers |
| Sales | `SalesAdmin.jsx` | **B** | shared list; fixed columns; detail modal hard-coded with resend actions |
| Purchases | `PurchasesAdmin.jsx` | **B** | shared list + fixed columns; import + `PlatformExtensionFields` (good) + form in code |
| Inventory | `InventoryAdmin.jsx` + `StockByStore`, `StockTransfers` | **B/C** | shared list for stock; transfers/adjust modal in code |
| Reports (10 fixed) | `src/pages/reports/*` | **C→D** | fixed components on a shared scaffold; should migrate (H-2) |
| Online Orders | `OnlineOrdersAdmin.jsx`, `OnlineOrdersPrep.jsx` | **C** | purpose-built workflow UI; lifecycle should migrate to workflows (H-4) |
| Settings shell + sections | `SettingsAdmin.jsx` (3,315 lines) | **C/D** | system config shell is acceptable hard-coded, but section registry + Users/Roles/Stores/terminals forms should migrate (H-5, H-6, C-4) |
| POS / Till | `src/pages/pos/*` | **C** | low-level transactional surface; buttons/validation metadata-worthy (H-1), basket/tender UX acceptable in code |
| Hospitality | `src/pages/hospitality/*` | **D** | fully hard-coded domain (H-3) |
| Employees/Attendance | `AttendanceAdmin.jsx` | **C** | clock in/out is a device-ish action surface; history list could use object list metadata |
| Admin shell & dock | `AdminLayout.jsx`, `AdminNavDock.jsx`, `AdminShell.jsx`, `DockHost.jsx` | **C** (system shell) | acceptable shell, but C-2/C-3 inside it must fix |
| Auth / Self-Checkout / Scan&Go / Customer Display | `Login.jsx`, `SelfCheckout.jsx`, `CameraScanner.jsx`, `CustomerDisplay.jsx` | **C** (acceptable) | authentication, device pairing, hardware-adjacent surfaces (§3) |
| Marketing site | `src/marketing/**`, `website/index.html` | **C** (acceptable copy; L-5 catalogue drift) | public site, not app metadata |
| oneStore / App Launcher | `OneStore.jsx`, `oneStoreModel.js`, `appLauncher.js` | **A** | pure presentation over `package_registry` + marketplace payload |
| Platform admin console | `PlatformAdmin.jsx`, `platformNav.js`, builders | **C** (acceptable tooling; M-7) | technical admin surfaces |

---

# PART 3 — ACCEPTABLE HARD-CODED EXCEPTIONS (with reasons)

1. **Login / session bootstrap** (`Login.jsx`, `App.jsx` session logic, offline-session recovery) — authentication is security infrastructure; must exist before any metadata can be loaded. The landing-flow *rules* are metadata; only the bootstrap scaffolding is code.
2. **POS basket/tender interaction surface** (`CartPanel`, `PaymentModal`, barcode-scan keypress listener in `POS.jsx`) — low-level POS interaction surface with millisecond UX and offline-durability requirements (`offlineQueue.js` durable IndexedDB queue); the *rules* (discount bounds, age, permissions) should still move to metadata (H-1), the interaction stays code.
3. **Hardware/device adapters** (`SettingsAdmin` Hardware card, `paymentTerminals`, scanner test area, `CameraScanner.jsx`) — physical protocol adapters (HID/USB/serial, ESC/POS paper widths) are device contracts, not business metadata.
4. **Provider protocol constants** — Uber/Deliveroo webhook event names, `X-Uber-Signature` HMAC notes, `platform === "uber"`, `sandbox|production`, invoice-prefix semantics — fixed external contracts (per brief §12/§16). The *internal* order lifecycle on top of them should still migrate (H-4).
5. **Security infrastructure** — `services/authorization.js`, `runtimeAccess.js`, sharing/FLS enforcement, self-checkout mode-token gating (`App.jsx` T10D) — must be code; metadata defines the data, not the enforcer.
6. **System shell & routing** — `AdminLayout` render ladder (as *routing*), `adminRoutes.js` URL contract, dock geometry/connectivity presentation, error/loading states — infrastructure; the *content* (module map, permission ladders — C-2) is not.
7. **Marketing copy & layout** (`src/marketing/**`, `website/index.html`) — public site prose/layout; only catalogue-shaped data should derive from the package registry (L-5).
8. **Technical admin consoles** — Platform admin builders/editors, Superadmin `LicensingAdmin.jsx`, `PlatformAdmin.jsx` — configuring the metadata system itself is inherently code-adjacent.
9. **Offline queue internals** (`services/offlineQueue.js`, `offlineStore.js`, `catalogueCache.js`) — device-local durability engine; no tenant-visible metadata involved.
10. **Connectivity/session polling** (`connectivity.js`, `networkStatus.js`, `App.jsx` entitlement refresh interval) — technical probes.

---

# PART 4 — ALREADY METADATA-DRIVEN (evidence-backed)

- **Object runtime end-to-end**: metadata CRUD, FLS, record types, picklist restriction, validation rules, formula/rollup fields, conditional visibility/required, sharing, history, soft-delete, approval submission — `routes/platform.js` + `services/platform{Metadata,Validation,Formula,Conditions,Sharing}.js`; UI `ObjectPage.jsx`/`FormRenderer.jsx`/`ObjectRecordDetail.jsx`.
- **Form & Page Builder + Custom Page Builder** with shared server Component Registry and one renderer for builder and runtime (`CustomPageRenderer.jsx`), record collections via the canonical `/platform/runtime/record-collection` boundary (server-enforced permissions).
- **Action/Workflow stack**: `PLATFORM_ACTION_REGISTRY` (dedupe-checked), button registry with permission+visibility metadata, workflow engine wired into record runtime, page-interaction executor, Flow Builder, approvals, work items, groups/queues.
- **Dashboards**: definitions, sharing, defaults, run engine with merged filters; runtime renders only saved metadata.
- **Custom Reports**: full builder (fields/filters/groupBy/summaries/sort/presentation, platform-object + relationship fields, per-user assignment).
- **Navigation**: server-filtered runtime catalog drives dock/sidebar/launcher/landing; configured Object pages get the generic runtime route; deep links resolve through the same gates.
- **oneStore/App Launcher**: package registry, dependencies, entitlements, licence states — launcher and store are pure presentation over the same payloads.
- **Theme & landing flow** (`platformTheme`, `resolveLandingFlow`).

---

# PART 5 — REQUIRED SUMMARY TABLE

**TOTAL FILES REVIEWED — ~140**

**FIELDS**
- Fully metadata-driven: **4 core domains** (product/customer/supplier/employee forms via runtime-forms; all platform objects)
- Hybrid/hard-coded gaps: **6 clusters** (settings forms H-6, POS modals H-1, hospitality H-3, purchases form, terminals/hardware, online-order mapping)

**RECORD VIEWS / EDIT FORMS**
- Metadata-driven: **5** (ObjectPage detail, StandardObjectFormModal, StandardObjectViewModal, FormLayoutModal, FormRenderer runtime forms)
- Gaps: **7** (CustomerAdminDetail M-2, SaleDetailModal, PurchaseDetail, SupplierAccounts forms, Users/Roles/Stores/Terminals/Hardware forms H-6, hospitality modals H-3, POS modals H-1)

**PAGE LAYOUTS**
- Metadata-driven: **3** (Object pages, Custom Pages, Dashboards)
- Hybrid: **6** (Products, Customers, Suppliers, Sales, Purchases, Inventory)
- Legitimate hard-coded: **6** (POS surface, auth/SCO, marketing, platform admin console, system shell, hardware adapters)
- Must migrate: **4** (Hospitality, fixed Reports shell content, Settings sections+forms, Online Orders lifecycle)

**REPORTS**
- Generic/report-builder driven: **1 system** (Custom Reports) + dashboard components
- Hard-coded gaps: **10** fixed reports + `ReportsAdmin` overview

**COMPONENTS**
- Registry-driven: **30 registered keys** (layout/field/record/dashboard/action incl. timeline, kanban, calendar, scheduler, gantt, map, hierarchy, file viewer, signature, tree)
- Hard-coded gaps: **8** (customer drawer, sales detail, hospitality widgets, online-order cards, stock-by-store/transfers, till action bar, dashboard vocabulary mirror, `runtime_component` escape hatches)

**ACTIONS / BUTTONS**
- Registry/workflow driven: **Action Registry + platform_buttons + page-interactions + Object record actions** (all Object/Custom-Page surfaces)
- Hard-coded gaps: **~30 buttons** across POS bar (8), Customers (5), Suppliers (3), Inventory (3), Products (4+1), Sales detail (3), Online Orders (5), Hospitality (15+), Settings quick actions (2)

**LISTS / TABLES**
- Metadata-driven: **Object list runtime** + Custom Page table/multi-container + custom-report tables + dashboard tables
- Hard-coded gaps: **5 column sets + endpoints** (Sales, Suppliers, Purchases, Inventory, Customers) + Users/Roles/Stores tables + hospitality tables + online-orders table

**SETTINGS**
- Metadata/config driven: **1** (platform theme; landing flow; `SettingsObjectHost` capability exists)
- Hard-coded gaps: **19 of 22 sections** (all of SettingsAdmin's forms/cards; section registry itself)

**NAVIGATION**
- Dynamic/package driven: **main dock + sidebar + app launcher + object pages + oneStore + landing flow** (server-filtered)
- Hard-coded gaps: **launcher grouping (M-5), dock picker options (L-1), Settings section nav (H-5), platform-admin rail (M-7), APP_META mirror (L-6)**

**BUSINESS RULES**
- Workflow/rule driven: **validation rules, formulas, rollups, assignment, approvals, workflow engine, sharing** — all on generic record runtime
- Hard-coded gaps: **discount bounds & age & negative-stock pre-flight (POS), order lifecycle matrices (online), hospitality state machines, returns client-side guards, settings acknowledgement confirms (C-4), offline-permission re-check (L-2)**

---

# PART 6 — FINAL VERDICT

## 1. MUST FIX
1. **C-1** Products export broken token (`localStorage.getItem("token")`) — one-line switch to `apiRequest`. *(smallest safe fix in the repo)*
2. **C-3** `storeName="London Store"` literals in `AdminLayout` + `Login` — use the signed-in store from `/api/settings`.
3. **C-2** De-duplicate `CATALOG_MODULE_BY_PAGE` (two client copies) and stop re-implementing module/permission gates in `AdminLayout`'s render ladder; consume the runtime catalog as the single visibility/permission source.
4. **C-4** Collapse the three divergent `/api/settings` save contracts into one command; remove the parent-form-snapshot resend pattern (concurrent-edit loss).

## 2. SHOULD MIGRATE
1. **H-2** Ten fixed reports → seeded `platform_reports` definitions on the generic engine.
2. **H-6** Settings Users/Stores/Tills/Terminals/Hardware → `SettingsObjectHost` (already built for this) + value sets.
3. **H-5** Settings section registry → server metadata (unblocks packages adding sections).
4. **M-4** Per-page row actions → `platform_buttons` with permission/visibility metadata.
5. **M-8** Per-page list columns/endpoints → object list layouts + generic record APIs (sales/suppliers/purchases/inventory/customers).
6. **H-4** Online-order internal lifecycle → workflow state machine + record actions (keep provider wire constants in code).
7. **H-1** POS till buttons/validation → Action Registry + validation metadata (interaction surface stays code).
8. **H-3** Hospitality → Platform Objects + workflows + custom-page components (largest; staged).
9. **M-1/M-3/M-6/L-1/L-3/L-5/L-6** vocabulary mirrors, option arrays, page-key escape hatches, dock options, GBP literal, marketing catalogue, APP_META mirror — small alignments.

## 3. ACCEPTABLE HARD-CODED EXCEPTIONS
Auth/session bootstrap · offline queue & caches · hardware/device adapters · provider protocol constants · security enforcement infrastructure · system shell/routing geometry · error/loading chrome · marketing copy/layout · platform admin consoles · connectivity probes · low-level POS/tender interaction surface (rules excepted). *(Full reasoning in Part 3.)*

## 4. ALREADY METADATA-DRIVEN
Object runtime (fields/FLS/record types/validation/formula/rollup/sharing/history) · Form & Page Builder + Custom Page Builder (one registry, one renderer) · Action/Workflow stack (registry, buttons, page interactions, approvals, work items, queues) · Dashboards (definitions + run engine) · Custom Reports builder · main navigation (server-filtered catalog + object pages + landing flow) · oneStore/App Launcher over the package registry · platform theme.

## 5. RECOMMENDED MIGRATION ORDER
1. **Immediate (days):** C-1, C-3, C-4 (mechanical, removes a security/tenant hazard and a data-loss path).
2. **Short (1–2 sprints):** C-2 single-source navigation/permission model; M-4 actions onto `platform_buttons`; M-1 dashboard vocabulary from server registry; L-1/L-3/L-6 cleanups; enable `SettingsObjectHost` for Users & Stores (H-6 first slice).
3. **Medium (quarter):** H-5 Settings section registry; M-8 list layouts + generic record endpoints per domain (products pattern already proves it); M-2/M-3; M-6 retire legacy page renderers; L-4 permission catalogue from API.
4. **Long (roadmap):** H-2 reports onto the generic engine (seed definitions, keep slugs); H-4 order lifecycle workflows; H-1 POS rules to metadata; H-3 hospitality domain staged: objects → actions → custom-page floor/KDS surfaces; L-5 marketing catalogue generated from `packageRegistry`.

**Verdict:** the platform core (Objects → Layouts → Components → Actions → Reports → Dashboards → Packages) is real and enforced server-side; the gap is concentrated in **Settings, the ten fixed reports, Hospitality, the online-order lifecycle, POS rules, and duplicated navigation/permission constants in the admin shell** — each with a canonical platform feature already in place to receive it.
