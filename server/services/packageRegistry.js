import { oneAssistantManifest } from "../packages/oneAssistantManifest.js";
import { metadataManifestByPackageKey } from "./metadataManifestLoader.js";
import { resolvePackagePlan, satisfiesPackageVersion, comparePackageVersions, resolveFeaturePlan } from "../packages/runtime/packagePlanning.js";
export { resolvePackagePlan, satisfiesPackageVersion, comparePackageVersions, resolveFeaturePlan } from "../packages/runtime/packagePlanning.js";
import { packageManifestCatalog } from "../packages/packageManifestCatalog.js";

const metadataManifestCache = new Map();

const withPackageBuilderMetadata = (workflow) => {
  const action = workflow?.action || {};
  let actions = Array.isArray(action.actions) ? action.actions : Array.isArray(workflow?.actions) ? workflow.actions : [];
  if (action.flowType === "KIOSK_EXPERIENCE" && actions.length === 0 && Array.isArray(action.ui?.screens)) {
    actions = action.ui.screens.map((screen, index) => ({
      id: `kiosk_screen_${screen.key || index + 1}`,
      apiName: `kiosk_screen_${screen.key || index + 1}`,
      key: "SCREEN",
      label: screen.title || screen.key || `Screen ${index + 1}`,
      description: `Kiosk ${screen.type || "screen"} step`,
      screen: {
        label: screen.title || screen.key || `Screen ${index + 1}`,
        apiName: String(screen.key || `screen_${index + 1}`),
        showHeader: true,
        style: "default",
        components: [],
        kioskDefinition: screen,
      },
      allowBack: index > 0,
      allowNext: index < action.ui.screens.length - 1,
      allowFinish: index === action.ui.screens.length - 1,
    }));
  }
  const nodes = Array.isArray(action.gptBuilderElements) && action.gptBuilderElements.length === actions.length
    ? action.gptBuilderElements
    : actions.map((step, index) => ({
        id: step.id || `package-step-${index + 1}`,
        key: "action",
        label: step.label || step.apiName || step.key || `Step ${index + 1}`,
        apiName: step.apiName || step.id || `Package_Step_${index + 1}`,
        description: step.description || "",
        labelSource: "manual",
        apiNameSource: "manual",
        config: {
          actionKey: step.key || step.type || "",
          inputs: {},
          inputModes: {},
          inputIncluded: {},
          transforms: {},
          outputMode: "automatic",
          manualOutputs: [],
          importedRuntimeAction: step,
          importedRuntimeActionText: "",
        },
        configured: true,
        source: "runtime_import",
        position: null,
      }));
  return {
    ...workflow,
    action: {
      ...action,
      actions,
      gptBuilder: true,
      layout: action.layout || { mode: "AUTO" },
      gptBuilderElements: nodes,
    },
  };
};
function manifestForPackage(packageKey) {
  if (!packageKey) return null;
  return metadataManifestCache.get(packageKey) || null;
}

export function packageDefinition(entry) {
  const iconAssetKeys = {
    uber_eats: "uber-eats",
    deliveroo: "deliveroo",
    xero: "xero",
    xero_accounting: "xero-accounting",
    sage: "sage",
    sage_accounting: "sage-business-cloud-accounting",
    shopify: "shopify",
    just_eat: "just-eat",
    whatsapp: "whatsapp",
    whatsapp_connector: "whatsapp",
    whatsapp_assistant: "whatsapp",
    open_food_facts: null,
    upcitemdb: null,
    barcode_nest: null,
    go_upc: null,
  };
  const packageNames = {
    retail_pos: "OneSales",
    one_kiosk: "OneKiosk",
    products: "Product Core",
    inventory: "OneInventory",
    batch_expiry: "OneBatchExpiry",
    hospitality: "OneHospitality",
    kds: "OneKDS",
    customer_credit: "OneCustomerCredit",
    suppliers: "OnePurchase",
    customers: "OneCustomer",
    staff: "Staff Core",
    reports: "OneReport",
    platform: "OneDeveloper",
    online_orders: "OneOnline",
    integrations: "OneIntegrations",
    email_connector: "Email Connector",
    sms_connector: "SMS Connector",
    communication_core: "Communication Core",
    one_connect_dojo: "One Connect - Dojo",
    one_connect_sumup: "One Connect - SumUp",
    one_connect_square: "One Connect - Square",
    uber_eats: "Uber Eats",
    shopify: "Shopify",
    client_web_shop: "Client Web Shop",
    own_delivery: "Own Delivery",
    whatsapp: "WhatsApp",
    whatsapp_connector: "WhatsApp Connector",
    whatsapp_assistant: "WhatsApp Assistant",
    open_food_facts: "Open Food Facts Connector",
    upcitemdb: "UPCitemdb Connector",
    barcode_nest: "BarcodeNest Connector",
    go_upc: "Go-UPC Connector",
    supplier_core: "Supplier Core",
    purchasing_core: "Purchasing Core",
    loyalty: "Loyalty Core",
    finance_core: "Finance Core",
    paypal_qr: "PayPal QR Payment",
    one_connect_google: "Google Connect",
    smsgate_connector: "SMSGate",
    one_assistant: "OneAssistant",
    payment_reference: "Payment Reference",
    payment_connector_template: "Payment Connector Template",
    receipt_printer_connector_template: "Receipt Printer Connector Template",
    kitchen_printer_connector_template: "Kitchen Printer Connector Template",
    cash_drawer_connector_template: "Cash Drawer Connector Template",
    mobile_scanner_connector: "Mobile Scanner Connector",
    barcode_scanner_connector_template: "Barcode Scanner Connector Template",
  };
  const packageDescriptions = {
    retail_pos: "Sales, payments, returns and order processing.",
    one_kiosk: "Customer self-service ordering, payment handoff and collection-number workflow across food, retail and service environments.",
    products: "Technical foundation for the canonical Product and Category objects.",
    inventory: "Stock, replenishment and inventory movements.",
    batch_expiry: "Batch stock, expiry tracking and FEFO inventory controls.",
    hospitality: "Floor plans, tables and reservations.",
    kds: "Kitchen display tickets and preparation status.",
    customer_credit: "Customer credit accounts, payments and protected credit controls.",
    suppliers: "Suppliers and purchasing operations.",
    customers: "Customer records and customer activity.",
    staff: "Reusable employee and attendance foundations over existing user identities.",
    reports: "Operational and custom report administration.",
    platform: "Developer workspace for configurable objects, metadata, apps and automation.",
    online_orders: "Online order intake and preparation.",
    integrations: "External delivery, payment and communication integrations.",
    email_connector: "Reusable email communication provider over Communication Core.",
    sms_connector: "Reusable SMS communication provider over Communication Core.",
    one_connect_dojo: "Dojo EPOS payment connector for terminal-based card processing.",
    one_connect_sumup: "SumUp terminal and cloud payment connector for store and till pairing.",
    one_connect_square: "Square terminal payment connector for card sales, refunds and terminal management.",
    uber_eats: "Uber Eats connection and online order integration.",
    shopify: "Shopify catalogue, inventory and online-order connection.",
    client_web_shop: "Public storefront, cart, checkout and own-delivery commerce package for client web shops.",
    own_delivery: "Driver assignment, route planning, delivery workspace and order tracking for fulfilled client orders.",
    whatsapp: "WhatsApp Business messaging and customer invoice delivery.",
    whatsapp_connector: "WhatsApp Business communication provider shared by licensed business apps through Communication Core.",
    whatsapp_assistant: "Workflow-driven WhatsApp Business assistant for customer enquiries, customer matching, templates and governed AI or rule-based replies.",
    open_food_facts: "Worldwide barcode and product-name lookup from Open Food Facts.",
    upcitemdb: "Worldwide UPC, EAN and GTIN lookup through UPCitemdb.",
    barcode_nest: "UPC, EAN and GTIN lookup through BarcodeNest using a customer API key.",
    go_upc: "Live product barcode lookup using a customer-provided Go-UPC API key.",
    supplier_core: "Canonical supplier identity and supplier-product sourcing metadata.",
    purchasing_core: "Protected purchasing, receiving and supplier-return metadata foundation.",
    loyalty: "Canonical loyalty configuration, balances, activity and rules.",
    finance_core: "Reusable financial ledger and supplier-accounting foundation.",
    connector_core: "Hidden runtime, capability routing and hardware-service contracts for installable connector apps.",
    communication_core: "Provider-neutral communication events, templates, delivery tracking and workflow actions for Email, SMS and WhatsApp.",
    mobile_scanner_connector: "Send-only phone barcode scanning paired to one store and till.",
    paypal_qr: "Metadata-driven PayPal QR payment connector for transaction-specific checkout and verification.",
    one_connect_google: "Licensed Google Workspace/OpenID Connect single sign-on for onePOS users.",
    smsgate_connector: "SMSGate Android SMS provider for Communication Core.",
    one_assistant: "Workflow-first appointment booking, calendar and communication automation.",
    payment_reference: "Test-only reference payment simulator for connector validation.",
    payment_connector_template: "Hidden payment connector package template.",
    receipt_printer_connector_template: "Hidden receipt-printer connector package template.",
    kitchen_printer_connector_template: "Hidden kitchen-printer connector package template.",
    cash_drawer_connector_template: "Hidden cash-drawer connector package template.",
    mobile_scanner_connector: "Phone barcode scanner connector paired to a store and till.",
    barcode_scanner_connector_template: "Hidden barcode-scanner connector package template.",
  };
  const entitlementKeys = {
    retail_pos: "pos", one_kiosk: "one_kiosk", products: "pos", inventory: "inventory", batch_expiry: "batch_expiry",
    hospitality: "hospitality", kds: "kds", customer_credit: "credit_control", suppliers: "purchasing", customers: "customers", staff: "staff",
    reports: "reports", online_orders: "online_orders", integrations: "integrations",
    email_connector: "communications.email", sms_connector: "communications.sms",
    one_connect_dojo: "one_connect_dojo",
    one_connect_sumup: "one_connect_sumup",
    one_connect_square: "one_connect_square",
    uber_eats: "integrations", platform: "platform", loyalty: "loyalty", shopify: "integrations", client_web_shop: "client_web_shop", own_delivery: "delivery",
    whatsapp: "integrations", whatsapp_connector: "integrations", whatsapp_assistant: "whatsapp_assistant",
    open_food_facts: "open_food_facts_connector", upcitemdb: "upcitemdb_connector", barcode_nest: "barcode_nest_connector",
    paypal_qr: "paypal_qr",
    one_connect_google: "google_sso",
    smsgate_connector: "communications.sms",
    one_assistant: "one_assistant",
  };
  const dependencies = {
    retail_pos: ["products"],
    one_kiosk: ["products", "online_orders", "retail_pos"],
    inventory: ["products"],
    batch_expiry: ["inventory", "products"],
    client_web_shop: ["products", "inventory", "online_orders", "retail_pos", "customers"],
    own_delivery: ["client_web_shop", "online_orders", "staff"],
    hospitality: ["retail_pos", "customers"],
    kds: ["hospitality", "retail_pos"],
    customer_credit: ["customers", "retail_pos"],
    suppliers: ["supplier_core"],
    supplier_core: ["products"],
    reports: [],
    platform: [],
    uber_eats: ["integrations", "online_orders"],
    whatsapp: ["integrations"],
    whatsapp_connector: ["communication_core"],
    whatsapp_assistant: ["communication_core", "customers", "platform"],
    open_food_facts: ["products"],
    upcitemdb: ["products"],
    barcode_nest: ["products"],
    go_upc: ["products"],
    finance_core: ["suppliers"],
    connector_core: [],
    communication_core: ["platform"],
    email_connector: ["communication_core"],
    sms_connector: ["communication_core"],
    mobile_scanner_connector: ["connector_core"],
    loyalty: ["customers", "retail_pos"],
    paypal_qr: ["connector_core"],
    one_connect_dojo: ["connector_core"],
    one_connect_sumup: ["connector_core"],
    one_connect_square: ["connector_core"],
    one_connect_google: ["connector_core"],
    smsgate_connector: ["connector_core", "communication_core", "sms_connector"],
    one_assistant: ["customers", "platform"],
    payment_reference: ["connector_core"],
    payment_connector_template: ["connector_core"],
    receipt_printer_connector_template: ["connector_core"],
    kitchen_printer_connector_template: ["connector_core"],
    cash_drawer_connector_template: ["connector_core"],
    barcode_scanner_connector_template: ["connector_core"],
  };
  const packageType = entry.packageType === "FOUNDATION" || entry.technical === true
    ? "FOUNDATION"
    : "APPLICATION";
  const billable = packageType === "APPLICATION" && entry.billable !== false;
  const licenceMode = entry.licenceMode || (packageType === "FOUNDATION" ? "TECHNICAL" : "COMMERCIAL");

  // Connector package permissions are derived from the connector contract so
  // a package cannot forget runtime permissions that its actions require.
  // This keeps current and future connector packages aligned automatically.
  const manifestPermissions = new Set(Array.isArray(entry.permissions) ? entry.permissions : []);
  if (entry.connectorApp && typeof entry.connectorApp === "object") {
    manifestPermissions.add("connector.test");
    manifestPermissions.add("connector.view");
    manifestPermissions.add("connector.manage");
    for (const capability of Array.isArray(entry.connectorApp.capabilities) ? entry.connectorApp.capabilities : []) {
      if (!capability || typeof capability !== "object") continue;
      for (const permission of Array.isArray(capability.requiredPermissions) ? capability.requiredPermissions : []) {
        if (permission) manifestPermissions.add(permission);
      }
    }
  }

  const extractedManifest = manifestForPackage(entry.key || entry.packageKey);
  return {
    packageKey: entry.packageKey || entry.key,
    name: packageNames[entry.key] || entry.name,
    version: entry.version || "1.0.0",
    description: packageDescriptions[entry.key] || entry.description,
    dependencies: Array.isArray(entry.dependencies) ? entry.dependencies : (dependencies[entry.key] || []),
    moduleKey: entry.key,
    manifest: {
        ...(extractedManifest || {}),
      packageKey: entry.packageKey || entry.key,
      name: packageNames[entry.key] || entry.name,
      version: entry.version || "1.0.0",
      packageType,
      publisher: entry.publisher || "OneSolutions",
      category: entry.category || "Business",
      description: packageDescriptions[entry.key] || entry.description,
      route: entry.route,
      entitlementKey: entry.entitlementKey || entitlementKeys[entry.key] || entry.key,
      licenceMode,
      licenceRequired: entry.licenceRequired !== false && licenceMode === "COMMERCIAL",
      billable,
      visibility: entry.visibility || (packageType === "FOUNDATION" ? "HIDDEN" : "PUBLIC"),
      installable: entry.installable !== false,
      systemOnly: entry.systemOnly === true || packageType === "FOUNDATION",
      displayOrder: Number.isInteger(entry.displayOrder) ? entry.displayOrder : 0,
      lifecycleState: entry.lifecycleState || "PUBLISHED",
      permissions: [...manifestPermissions],
      storeScoped: entry.storeScoped === true,
      bootstrapFoundation: entry.bootstrapFoundation === true,
      dependencies: Array.isArray(entry.dependencies) ? entry.dependencies : (dependencies[entry.key] || []),
      optionalDependencies: Array.isArray(entry.optionalDependencies) ? entry.optionalDependencies : [],
      versionConstraints: Object.fromEntries(
        (Array.isArray(entry.dependencies) ? entry.dependencies : (dependencies[entry.key] || []))
          .filter((dependency) => dependency && typeof dependency === "object")
          .map((dependency) => [
            dependency.packageKey || dependency.package_key,
            {
              minVersion: dependency.minVersion || dependency.min_version || null,
              maxVersion: dependency.maxVersion || dependency.max_version || null,
              versionRange: dependency.versionRange || dependency.version_range || null,
              optional: dependency.optional === true,
            },
          ])
      ),
      metadataOwnership: {
        policy: "PACKAGE_MANAGED",
        preserveUserModified: true,
        requiredTypes: ["object", "field", "relationship", "form", "layout", "workflow", "action", "report", "permission", "connector", "template"],
      },
      optionalFeatures: Array.isArray(entry.optionalFeatures) ? entry.optionalFeatures : [],
      capabilities: Array.isArray(entry.capabilities) ? entry.capabilities : [entry.key],
      providerConnector: entry.providerConnector || null,
      connectorApp: entry.connectorApp || null,
      connectors: Array.isArray(entry.connectors) ? entry.connectors : [],
      iconAssetKey: entry.iconAssetKey || iconAssetKeys[entry.key] || null,

      ...(entry.manifest && typeof entry.manifest === "object" ? entry.manifest : {}),
      ...(entry.key === "one_assistant" ? oneAssistantManifest : {}),
      ...(metadataManifestByPackageKey(entry.key) || {}),

    },
  };
}

export function packageDefinitions(catalog = packageManifestCatalog) {
  return catalog.map(packageDefinition).map((definition) => {
    const manifest = definition?.manifest || {};
    const workflows = Array.isArray(manifest.workflows) ? manifest.workflows : null;
    if (!workflows) return definition;
    return {
      ...definition,
      manifest: {
        ...manifest,
        workflows: workflows.map((workflow) => {
          const action = workflow?.action || {};
          const actions = Array.isArray(action.actions) ? action.actions : [];
          if (!actions.length || String(action.flowType || "").toUpperCase() === "KIOSK_EXPERIENCE") return workflow;
          const existing = Array.isArray(action.gptBuilderElements) ? action.gptBuilderElements : [];
          const nodes = existing.length === actions.length ? existing : actions.map((step, index) => ({
            id: step.id || `package-step-${index + 1}`,
            key: "action",
            label: step.label || step.apiName || step.key || `Step ${index + 1}`,
            apiName: step.apiName || step.id || `Package_Step_${index + 1}`,
            description: step.description || "",
            labelSource: "manual",
            apiNameSource: "manual",
            config: {
              actionKey: step.key || step.type || "",
              inputs: {},
              inputModes: {},
              inputIncluded: {},
              transforms: {},
              outputMode: "automatic",
              manualOutputs: [],
              importedRuntimeAction: step,
              importedRuntimeActionText: "",
            },
            configured: true,
            source: "runtime_import",
            position: null,
          }));
          return {
            ...workflow,
            action: {
              ...action,
              gptBuilder: true,
              layout: action.layout || { mode: "AUTO" },
              gptBuilderElements: nodes,
            },
          };
        }),
      },
    };
  });
}

export const packageRegistrySchema = `
  CREATE TABLE IF NOT EXISTS package_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_key VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    version VARCHAR(40) NOT NULL DEFAULT '1.0.0',
    description TEXT,
    module_id UUID UNIQUE REFERENCES platform_modules(id) ON DELETE SET NULL,
    manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    package_type VARCHAR(30) NOT NULL DEFAULT 'APPLICATION',
    publisher VARCHAR(200) NOT NULL DEFAULT 'OneSolutions',
    category VARCHAR(100),
    required_platform_version VARCHAR(40),
    publication_state VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED',
    visible BOOLEAN NOT NULL DEFAULT TRUE,
    installable BOOLEAN NOT NULL DEFAULT TRUE,
    billable BOOLEAN NOT NULL DEFAULT TRUE,
    featured BOOLEAN NOT NULL DEFAULT FALSE,
    system_only BOOLEAN NOT NULL DEFAULT FALSE,
    display_order INTEGER NOT NULL DEFAULT 0,
    available_tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
    licence_mode VARCHAR(30) NOT NULL DEFAULT 'COMMERCIAL',
    allowed_bundles TEXT[] NOT NULL DEFAULT '{}',
    allowed_companies UUID[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE package_registry ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;
  CREATE TABLE IF NOT EXISTS package_dependencies (
    package_id UUID NOT NULL REFERENCES package_registry(id) ON DELETE CASCADE,
    dependency_id UUID NOT NULL REFERENCES package_registry(id) ON DELETE RESTRICT,
    version_range VARCHAR(40),
    min_version VARCHAR(40),
    max_version VARCHAR(40),
    optional BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (package_id, dependency_id),
    CHECK (package_id <> dependency_id)
  );
  CREATE TABLE IF NOT EXISTS company_package_installations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    package_id UUID NOT NULL REFERENCES package_registry(id) ON DELETE RESTRICT,
    version VARCHAR(40) NOT NULL,
    selected_features JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    installation_type VARCHAR(30) NOT NULL DEFAULT 'DIRECT',
    available_version VARCHAR(40),
    last_upgrade_at TIMESTAMPTZ,
    last_upgrade_state VARCHAR(20) NOT NULL DEFAULT 'READY',
    suspended_by_entitlement BOOLEAN NOT NULL DEFAULT FALSE,
    deactivated_by_user BOOLEAN NOT NULL DEFAULT FALSE,
    installed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, package_id)
  );
  ALTER TABLE company_package_installations
    ADD COLUMN IF NOT EXISTS selected_features JSONB NOT NULL DEFAULT '[]'::jsonb;
  CREATE INDEX IF NOT EXISTS idx_company_package_installations_company
    ON company_package_installations(company_id, status);
  CREATE TABLE IF NOT EXISTS package_installation_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    package_id UUID NOT NULL REFERENCES package_registry(id) ON DELETE RESTRICT,
    version VARCHAR(40) NOT NULL,
    migration_key VARCHAR(200) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    applied_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (company_id, package_id, version, migration_key)
  );
  CREATE INDEX IF NOT EXISTS idx_package_installation_versions_company
    ON package_installation_versions(company_id, package_id, applied_at DESC);
  CREATE TABLE IF NOT EXISTS package_installation_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    idempotency_key VARCHAR(200) NOT NULL,
    operation VARCHAR(20) NOT NULL CHECK (operation IN ('install','uninstall','deactivate')),
    package_key VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('completed','failed')),
    response JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, idempotency_key, operation, package_key)
  );
  ALTER TABLE package_installation_operations
    DROP CONSTRAINT IF EXISTS package_installation_operations_company_id_idempotency_key_operation_key;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_package_installation_operations_key
    ON package_installation_operations(company_id, idempotency_key, operation, package_key);

  CREATE TABLE IF NOT EXISTS package_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_key VARCHAR(100) NOT NULL,
    version VARCHAR(40) NOT NULL,
    previous_version VARCHAR(40),
    release_notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','VALIDATED','PUBLISHED','PAUSED','ARCHIVED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    published_by UUID REFERENCES users(id) ON DELETE SET NULL,
    minimum_platform_version VARCHAR(40),
    update_policy VARCHAR(20) NOT NULL DEFAULT 'OPTIONAL' CHECK (update_policy IN ('OPTIONAL','FORCED','STAGED')),
    change_set JSONB NOT NULL DEFAULT '[]'::jsonb,
    manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
    validation_summary JSONB NOT NULL DEFAULT '{}'::jsonb
  );
  ALTER TABLE package_releases ADD COLUMN IF NOT EXISTS manifest JSONB NOT NULL DEFAULT '{}'::jsonb;
  CREATE INDEX IF NOT EXISTS idx_package_releases_package_status
    ON package_releases(package_key, status, published_at DESC);

  ALTER TABLE company_package_installations
    ADD COLUMN IF NOT EXISTS installed_version VARCHAR(40),
    ADD COLUMN IF NOT EXISTS target_version VARCHAR(40),
    ADD COLUMN IF NOT EXISTS update_status VARCHAR(30) NOT NULL DEFAULT 'CURRENT'
      CHECK (update_status IN ('CURRENT','UPDATE_AVAILABLE','QUEUED','UPDATING','FAILED','CONFLICT','CURRENT_AFTER_UPDATE','ROLLBACK_REQUIRED')),
    ADD COLUMN IF NOT EXISTS last_update_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS update_error TEXT,
    ADD COLUMN IF NOT EXISTS auto_update_policy VARCHAR(20) NOT NULL DEFAULT 'OPTIONAL'
      CHECK (auto_update_policy IN ('OPTIONAL','FORCED','STAGED'));

  ALTER TABLE company_package_installations
    DROP CONSTRAINT IF EXISTS company_package_installations_update_status_check;
  ALTER TABLE company_package_installations
    ADD CONSTRAINT company_package_installations_update_status_check
    CHECK (update_status IN ('CURRENT','UPDATE_AVAILABLE','QUEUED','UPDATING','FAILED','CONFLICT','CURRENT_AFTER_UPDATE','ROLLBACK_REQUIRED'));

  UPDATE company_package_installations
     SET installed_version = version,
         target_version = version,
         update_status = CASE WHEN status='active' THEN 'CURRENT' ELSE update_status END,
         auto_update_policy = COALESCE(auto_update_policy, 'OPTIONAL')
   WHERE installed_version IS NULL;
`;



const safeMetadataKey = (value) => typeof value === "string" && /^[a-z_][a-z0-9_]{0,99}$/.test(value);

export async function provisionPackageMetadata(db, { packageId, moduleId, companyId, manifest = {}, packageVersion = manifest.version || "1.0.0" }) {
  const objects = Array.isArray(manifest.objects) ? manifest.objects : [];
  const objectIds = new Map();

  for (const definition of objects) {
    const objectKey = definition?.objectKey || definition?.object_key || definition?.key;
    const objectCompanyId = definition.metadataScope === "global" ? null : companyId || null;
    if (!safeMetadataKey(objectKey)) throw new Error(`Invalid package object key: ${objectKey || "(missing)"}`);
    if (typeof definition.label !== "string" || !definition.label.trim()) {
      throw new Error(`Package object label is required: ${objectKey}`);
    }
    const sourceTable = definition.sourceTable || definition.source_table || null;
    const storeScoped = typeof definition.storeScoped === "boolean" ? definition.storeScoped : null;
    if (sourceTable && !safeMetadataKey(sourceTable)) throw new Error(`Invalid package source table: ${sourceTable}`);
    const existing = await db(
      "SELECT id,package_id,module_id,company_id FROM platform_objects WHERE object_key=$1",
      [objectKey]
    );
    let object;
    if (existing.rows.length) {
      object = existing.rows[0];
      if (object.package_id && object.package_id !== packageId) {
        const adoptable = Array.isArray(definition.adoptFromPackageKeys) ? definition.adoptFromPackageKeys : [];
        const owner = adoptable.length
          ? await db("SELECT package_key FROM package_registry WHERE id=$1", [object.package_id])
          : { rows: [] };
        if (!adoptable.includes(owner.rows[0]?.package_key)) {
          throw new Error(`Platform object is owned by another package: ${objectKey}`);
        }
      }
      if (!object.package_id) {
        const priorOwner = await db(
          "SELECT 1 FROM package_metadata_ownership WHERE metadata_type='object' AND metadata_id=$1 AND package_id=$2 AND managed=true",
          [object.id, packageId]
        );
        if (!priorOwner.rows.length) {
          const legacyObject = await db(
            "SELECT source_table,managed,user_modified FROM platform_objects WHERE id=$1",
            [object.id]
          );
          const row = legacyObject.rows[0] || {};
          const sameSourceTable = Boolean(sourceTable) && row.source_table === sourceTable;
          const safeLegacyAdoption = sameSourceTable && row.managed === false && row.user_modified === false;
          if (!safeLegacyAdoption) {
            throw new Error(`Package cannot take ownership of existing custom Platform object: ${objectKey}`);
          }
          await db(
            `INSERT INTO package_metadata_ownership
             (package_id,package_version,metadata_type,metadata_id,managed)
             VALUES ($1,$3,'object',$2,true)
             ON CONFLICT (package_id,metadata_type,metadata_id)
             DO UPDATE SET managed=true,package_version=EXCLUDED.package_version,updated_at=NOW()`,
            [packageId, object.id, packageVersion]
          );
        }
      }
      if (object.company_id && object.company_id !== objectCompanyId) {
        throw new Error(`Platform object belongs to another company: ${objectKey}`);
      }
      await db(
          "UPDATE platform_objects SET package_id=$1,module_id=COALESCE(module_id,$2),company_id=COALESCE(company_id,$3),label=CASE WHEN user_modified THEN label ELSE $4 END,plural_label=CASE WHEN user_modified THEN plural_label ELSE $5 END,description=CASE WHEN user_modified THEN description ELSE $6 END,source_table=CASE WHEN user_modified THEN source_table ELSE COALESCE($7,source_table) END,store_scoped=CASE WHEN user_modified OR $8::boolean IS NULL THEN store_scoped ELSE $8 END,config=CASE WHEN user_modified THEN config ELSE $9::jsonb END,source_package_version=$11,managed=true,package_required=$12,active=true,updated_at=NOW() WHERE id=$10 RETURNING *",
          [packageId, moduleId, objectCompanyId, definition.label.trim(), definition.pluralLabel || definition.plural_label || null, definition.description || null, sourceTable, storeScoped, JSON.stringify(definition.config || {}), object.id, packageVersion, definition.required === true]
      );
    } else {
      const result = await db(
        `INSERT INTO platform_objects
         (module_id,package_id,object_key,label,plural_label,description,company_id,source_table,store_scoped,config,source_package_version,managed,package_required)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,true,$12) RETURNING *`,
        [moduleId, packageId, objectKey, definition.label.trim(), definition.pluralLabel || definition.plural_label || null, definition.description || null, objectCompanyId, sourceTable, definition.storeScoped === true, JSON.stringify(definition.config || {}), packageVersion, definition.required === true]
      );
      object = result.rows[0];
    }
    objectIds.set(objectKey, object.id);

    for (const field of Array.isArray(definition.fields) ? definition.fields : []) {
      const fieldCompanyId = definition.fieldsMetadataScope === "global" || field.metadataScope === "global"
        ? null
        : companyId || null;
      const apiName = field?.apiName || field?.api_name;
      const sourceColumn = field?.sourceColumn || field?.source_column || null;
      if (!safeMetadataKey(apiName) || typeof field.label !== "string" || !field.label.trim()) {
        throw new Error(`Invalid package field on ${objectKey}`);
      }
      if (sourceColumn && !safeMetadataKey(sourceColumn)) {
        throw new Error(`Invalid package field source column on ${objectKey}.${apiName}`);
      }
      const existingField = await db(
        "SELECT id,company_id,source_package_id,source_column,field_type,managed,user_modified FROM platform_fields WHERE object_id=$1 AND api_name=$2 AND (company_id IS NULL OR company_id=$3) ORDER BY company_id NULLS FIRST LIMIT 1",
        [object.id, apiName, fieldCompanyId]
      );
      if (existingField.rows.length) {
        const existing = existingField.rows[0];
        if (existing.company_id && existing.company_id !== fieldCompanyId) {
          throw new Error(`Platform field belongs to another company: ${objectKey}.${apiName}`);
        }
        if (existing.source_package_id && existing.source_package_id !== packageId) {
          throw new Error(`Platform field is owned by another package: ${objectKey}.${apiName}`);
        }
        if (!existing.source_package_id) {
          const priorOwner = await db(
            "SELECT 1 FROM package_metadata_ownership WHERE metadata_type='field' AND metadata_id=$1 AND package_id=$2 AND managed=true",
            [existing.id, packageId]
          );
          if (!priorOwner.rows.length) {
            // Older platform bootstrap builds created canonical physical fields
            // before package ownership metadata existed. Untouched, unmanaged
            // fields that map the same API name to the same physical column are
            // legacy canonical metadata and may be adopted even when the package
            // has since tightened the metadata type (for example text -> picklist).
            // User-modified/custom mappings remain protected.
            const safeLegacyAdoption =
              existing.user_modified === false &&
              existing.managed === false &&
              Boolean(sourceColumn) &&
              existing.source_column === sourceColumn;
            if (!safeLegacyAdoption) {
              throw new Error(`Package cannot take ownership of existing custom Platform field: ${objectKey}.${apiName}`);
            }
            await db(
              `INSERT INTO package_metadata_ownership
               (package_id,package_version,metadata_type,metadata_id,managed)
               VALUES ($1,$3,'field',$2,true)
               ON CONFLICT (package_id,metadata_type,metadata_id)
               DO UPDATE SET managed=true,package_version=EXCLUDED.package_version,updated_at=NOW()`,
              [packageId, existing.id, packageVersion]
            );
          }
        }
        await db(
          "UPDATE platform_fields SET label=CASE WHEN user_modified THEN label ELSE $1 END,field_type=CASE WHEN user_modified THEN field_type ELSE $2 END,source_column=CASE WHEN user_modified THEN source_column ELSE $3 END,required=$4,readable=CASE WHEN user_modified THEN readable ELSE $5 END,writable=CASE WHEN user_modified THEN writable ELSE $6 END,options=CASE WHEN user_modified THEN options ELSE $7::jsonb END,config=CASE WHEN user_modified THEN config ELSE $8::jsonb END,display_order=$9,company_id=COALESCE(company_id,$10),source_package_id=$12,source_package_version=$13,managed=true,package_required=$14,active=true WHERE id=$11",
          [field.label.trim(), field.fieldType || field.field_type || "text", sourceColumn, field.required === true, field.readable !== false, field.writable === true, JSON.stringify(field.options || []), JSON.stringify({ ...(field.config || {}), packageContract: field.required === true ? "required" : "default", packageOwned: true, packageId }), Number(field.displayOrder ?? field.display_order ?? 0), fieldCompanyId, existingField.rows[0].id, packageId, packageVersion, field.required === true]
        );
      } else {
        await db(
          `INSERT INTO platform_fields
           (object_id,api_name,label,field_type,source_column,required,readable,writable,options,config,display_order,company_id,source_package_id,source_package_version,managed,package_required)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,true,$15)`,
          [object.id, apiName, field.label.trim(), field.fieldType || field.field_type || "text", field.sourceColumn || field.source_column || null, field.required === true, field.readable !== false, field.writable === true, JSON.stringify(field.options || []), JSON.stringify({ ...(field.config || {}), packageContract: field.required === true ? "required" : "default", packageOwned: true, packageId }), Number(field.displayOrder ?? field.display_order ?? 0), fieldCompanyId, packageId, packageVersion, field.required === true]
        );
      }
    }
  }

  const layouts = [
    ...(Array.isArray(manifest.layouts) ? manifest.layouts : []),
    ...(Array.isArray(manifest.recordForms) ? manifest.recordForms.map((form) => ({
      ...form,
      layoutKey: form.layoutKey || form.layout_key || form.formKey || form.form_key,
    })) : []),
  ];
  for (const layout of layouts) {
    const objectId = objectIds.get(layout.objectKey || layout.object_key);
    const layoutKey = layout.layoutKey || layout.layout_key;
    const pageType = layout.pageType || layout.page_type;
    if (!objectId || !safeMetadataKey(layoutKey) || !["list", "detail", "view", "create", "edit", "quick_create"].includes(pageType) ||
        typeof layout.name !== "string" || !layout.name.trim() || !layout.definition || !Array.isArray(layout.definition.components)) {
      throw new Error("Package layouts and forms require an object, safe key, supported page type, name and component definition");
    }
    await db(
      `INSERT INTO platform_layouts
       (object_id,page_type,company_id,name,layout_key,definition,active,is_default,source_package_id,source_package_version,managed,package_required)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,true,$7,$8,$9,true,$10)
       ON CONFLICT (object_id,page_type,layout_key) WHERE layout_key <> ''
       DO UPDATE SET company_id=EXCLUDED.company_id,name=EXCLUDED.name,definition=EXCLUDED.definition,
         active=true,is_default=EXCLUDED.is_default,source_package_id=EXCLUDED.source_package_id,
         source_package_version=EXCLUDED.source_package_version,managed=true,package_required=EXCLUDED.package_required,updated_at=NOW()
       WHERE platform_layouts.user_modified=false
          OR platform_layouts.source_package_id=EXCLUDED.source_package_id`,
      [objectId, pageType, layout.metadataScope === "global" ? null : companyId || null, layout.name.trim(), layoutKey,
        JSON.stringify(layout.definition), layout.isDefault === true, packageId, packageVersion, layout.required === true]
    );
  }

  for (const relationship of Array.isArray(manifest.relationships) ? manifest.relationships : []) {
    const parentKey = relationship.parentObjectKey || relationship.parent_object_key;
    const childKey = relationship.childObjectKey || relationship.child_object_key;
    let parentObjectId = objectIds.get(parentKey);
    let childObjectId = objectIds.get(childKey);
    if (!parentObjectId || !childObjectId) {
      const external = await db(
        "SELECT id,object_key FROM platform_objects WHERE object_key=ANY($1::text[]) AND (company_id IS NULL OR company_id=$2)",
        [[parentKey, childKey], companyId]
      );
      const byKey = new Map(external.rows.map((row) => [row.object_key, row.id]));
      parentObjectId ||= byKey.get(parentKey);
      childObjectId ||= byKey.get(childKey);
    }
    if (!parentObjectId || !childObjectId || !safeMetadataKey(relationship.relationshipKey || relationship.relationship_key)) {
      throw new Error("Package relationships must reference declared objects with safe keys");
    }
    let childFieldId = null;
    const childFieldKey = relationship.childFieldApiName || relationship.child_field_api_name;
    if (childFieldKey) {
      const relationshipType = relationship.relationshipType || relationship.relationship_type || "lookup";
      const fieldObjectId = relationshipType === "lookup" ? parentObjectId : childObjectId;
      const fieldResult = await db(
        "SELECT id FROM platform_fields WHERE object_id=$1 AND api_name=$2 AND (company_id IS NULL OR company_id=$3) LIMIT 1",
        [fieldObjectId, childFieldKey, companyId]
      );
      if (!fieldResult.rows[0]?.id) throw new Error(`Package relationship field not found: ${childFieldKey}`);
      if (relationshipType !== "lookup") childFieldId = fieldResult.rows[0].id;
    }
    const parentFieldKey = relationship.parentFieldApiName || relationship.parent_field_api_name;
    const relationshipType = relationship.relationshipType || relationship.relationship_type || "lookup";
    if (relationshipType === "lookup" && parentFieldKey) {
      const parentFieldResult = await db(
        "SELECT id FROM platform_fields WHERE object_id=$1 AND api_name=$2 AND (company_id IS NULL OR company_id=$3) LIMIT 1",
        [parentObjectId, parentFieldKey, companyId]
      );
      if (!parentFieldResult.rows.length) throw new Error(`Package relationship field not found: ${parentFieldKey}`);
    }
    const relationshipKey = relationship.relationshipKey || relationship.relationship_key;
    const declaredRelationshipType = relationship.relationshipType || relationship.relationship_type || "lookup";
    const existingRelationship = await db(
      `SELECT id,child_object_id,relationship_type,child_field_id,source_package_id,managed,user_modified
         FROM platform_relationships
        WHERE parent_object_id=$1 AND relationship_key=$2
        LIMIT 1`,
      [parentObjectId, relationshipKey]
    );
    if (existingRelationship.rows.length) {
      const existing = existingRelationship.rows[0];
      if (existing.source_package_id && existing.source_package_id !== packageId) {
        throw new Error(`Package relationship key is owned by another declaration: ${relationshipKey}`);
      }
      if (!existing.source_package_id) {
        const sameChild = String(existing.child_object_id || "") === String(childObjectId || "");
        const sameType = String(existing.relationship_type || "") === String(declaredRelationshipType || "");
        const sameField = String(existing.child_field_id || "") === String(childFieldId || "");
        const safeLegacyAdoption =
          existing.user_modified === false &&
          existing.managed === false &&
          sameChild &&
          sameType &&
          sameField;
        if (!safeLegacyAdoption) {
          throw new Error(`Package relationship key is owned by another declaration: ${relationshipKey}`);
        }
        await db(
          `UPDATE platform_relationships
              SET source_package_id=$1,source_package_version=$2,managed=true,
                  package_required=$3,active=true
            WHERE id=$4`,
          [packageId, packageVersion, relationship.required === true, existing.id]
        );
        await db(
          `INSERT INTO package_metadata_ownership
             (package_id,package_version,metadata_type,metadata_id,managed,package_required,user_modified,default_snapshot)
           VALUES ($1,$2,'relationship',$3,true,$4,false,$5::jsonb)
           ON CONFLICT (package_id,metadata_type,metadata_id)
           DO UPDATE SET package_version=EXCLUDED.package_version,managed=true,
                         package_required=EXCLUDED.package_required,user_modified=false,
                         default_snapshot=EXCLUDED.default_snapshot,updated_at=NOW()`,
          [
            packageId,
            packageVersion,
            existing.id,
            relationship.required === true,
            JSON.stringify({
              parentObjectId,
              childObjectId,
              relationshipKey,
              relationshipType: declaredRelationshipType,
              childFieldId,
            }),
          ]
        );
      }
    }

    const registeredRelationship = await db(
      `INSERT INTO platform_relationships
       (parent_object_id,child_object_id,relationship_key,relationship_type,child_field_id,active,source_package_id,source_package_version,managed,package_required)
       VALUES ($1,$2,$3,$4,$5,true,$6,$7,true,$8)
       ON CONFLICT (parent_object_id,relationship_key)
       DO UPDATE SET child_object_id=EXCLUDED.child_object_id,relationship_type=EXCLUDED.relationship_type,child_field_id=EXCLUDED.child_field_id,
                     source_package_id=EXCLUDED.source_package_id,source_package_version=EXCLUDED.source_package_version,
                     managed=true,package_required=EXCLUDED.package_required,active=true
       WHERE platform_relationships.source_package_id=EXCLUDED.source_package_id
       RETURNING id`,
      [parentObjectId, childObjectId, relationshipKey, declaredRelationshipType, childFieldId, packageId, packageVersion, relationship.required === true]
    );
    if (!registeredRelationship.rows?.length && registeredRelationship.rowCount === 0) {
      throw new Error(`Package relationship key is owned by another declaration: ${relationship.relationshipKey || relationship.relationship_key}`);
    }
  }

  for (const view of Array.isArray(manifest.listViews) ? manifest.listViews : []) {
    const objectId = objectIds.get(view.objectKey || view.object_key);
    if (!objectId || !safeMetadataKey(view.viewKey || view.view_key)) {
      throw new Error("Package list views must reference declared objects with safe keys");
    }
    const registeredView = await db(
      `INSERT INTO platform_list_views
       (object_id,company_id,view_key,label,description,columns,filters,filter_model,sort,page_size,is_default,
        source_package_id,source_package_version,managed,package_required)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12,$13,true,$14)
       ON CONFLICT (object_id,company_id,view_key)
       DO UPDATE SET label=CASE WHEN platform_list_views.user_modified THEN platform_list_views.label ELSE EXCLUDED.label END,
         description=CASE WHEN platform_list_views.user_modified THEN platform_list_views.description ELSE EXCLUDED.description END,
         columns=CASE WHEN platform_list_views.user_modified THEN platform_list_views.columns ELSE EXCLUDED.columns END,
         filters=CASE WHEN platform_list_views.user_modified THEN platform_list_views.filters ELSE EXCLUDED.filters END,
         filter_model=CASE WHEN platform_list_views.user_modified THEN platform_list_views.filter_model ELSE EXCLUDED.filter_model END,
         sort=CASE WHEN platform_list_views.user_modified THEN platform_list_views.sort ELSE EXCLUDED.sort END,
         page_size=CASE WHEN platform_list_views.user_modified THEN platform_list_views.page_size ELSE EXCLUDED.page_size END,
         is_default=CASE WHEN platform_list_views.user_modified THEN platform_list_views.is_default ELSE EXCLUDED.is_default END,
         source_package_version=EXCLUDED.source_package_version,managed=true,package_required=EXCLUDED.package_required,
         active=CASE WHEN platform_list_views.user_modified THEN platform_list_views.active ELSE true END,
         updated_at=NOW()
       WHERE platform_list_views.source_package_id=EXCLUDED.source_package_id
       RETURNING id`,
      [
        objectId,
        companyId || null,
        view.viewKey || view.view_key,
        view.label,
        view.description || null,
        JSON.stringify(view.columns || []),
        JSON.stringify(view.filters || {}),
        JSON.stringify(view.filterModel || view.filter_model || {}),
        JSON.stringify(view.sort || { field: null, direction: "asc" }),
        Number.isFinite(Number(view.pageSize)) ? Number(view.pageSize) : 50,
        view.isDefault === true,
        packageId,
        packageVersion,
        view.required === true,
      ]
    );
    if (!registeredView.rows?.length && registeredView.rowCount === 0) {
      throw new Error(`Package list view is owned by another declaration: ${view.viewKey || view.view_key}`);
    }
  }

  for (const page of Array.isArray(manifest.pages) ? manifest.pages : []) {
    const pageKey = page.pageKey || page.page_key;
    if (!safeMetadataKey(pageKey) || typeof page.label !== "string" || !page.label.trim()) {
      throw new Error("Package pages require a safe page key and label");
    }
    const appKey = `package_${String(packageId).replace(/-/g, "_")}`.slice(0, 100);
    const appResult = await db(
      `INSERT INTO platform_apps
       (company_id,app_key,label,description,active,source_package_id,source_package_version,managed,package_required)
       VALUES ($1,$2,$3,$4,true,$5,$6,true,$7)
       ON CONFLICT (company_id,app_key) DO UPDATE SET
         label=CASE WHEN platform_apps.user_modified THEN platform_apps.label ELSE EXCLUDED.label END,
         description=CASE WHEN platform_apps.user_modified THEN platform_apps.description ELSE EXCLUDED.description END,
         source_package_version=EXCLUDED.source_package_version,managed=true,
         package_required=EXCLUDED.package_required,
         active=CASE WHEN platform_apps.user_modified THEN platform_apps.active ELSE true END,
         updated_at=NOW()
       WHERE platform_apps.source_package_id=EXCLUDED.source_package_id
       RETURNING id`,
      [companyId || null, appKey, page.appLabel || page.label, page.description || null,
        packageId, packageVersion, page.required === true]
    );
    if (!appResult.rows.length) throw new Error(`Package page app key is owned by another declaration: ${appKey}`);
    await db(
      `INSERT INTO platform_pages
       (app_id,company_id,page_key,label,route_path,page_type,definition,active,
        source_package_id,source_package_version,managed,package_required)
       VALUES ($1,$2,$3,$4,$5,'page',$6::jsonb,true,$7,$8,true,$9)
       ON CONFLICT (app_id,company_id,page_key) DO UPDATE SET
         label=CASE WHEN platform_pages.user_modified THEN platform_pages.label ELSE EXCLUDED.label END,
         route_path=CASE WHEN platform_pages.user_modified THEN platform_pages.route_path ELSE EXCLUDED.route_path END,
         definition=CASE WHEN platform_pages.user_modified THEN platform_pages.definition ELSE EXCLUDED.definition END,
         active=CASE WHEN platform_pages.user_modified THEN platform_pages.active ELSE true END,
         source_package_version=EXCLUDED.source_package_version,managed=true,
         package_required=EXCLUDED.package_required,updated_at=NOW()
       WHERE platform_pages.source_package_id=EXCLUDED.source_package_id`,
      [appResult.rows[0].id, companyId || null, pageKey, page.label.trim(),
        page.routePath || `/app/custom/${pageKey}`,
        JSON.stringify({ ...(page.definition || { presentation_mode: "landing", runtime_component: page.runtimeComponent || page.runtime_component || null, components: [] }), packageId }),
        packageId, packageVersion, page.required === true]
    );
  }

  for (const action of Array.isArray(manifest.actions) ? manifest.actions : []) {
    const objectId = objectIds.get(action.objectKey || action.object_key) || objectIds.values().next().value || null;
    const actionKey = action.actionKey || action.action_key;
    const handlerKey = action.handlerKey || action.handler_key;
    if (!objectId || !safeMetadataKey(String(actionKey || "").replace(/\./g, "_")) || !/^[A-Z][A-Z0-9_]{0,139}$/.test(handlerKey || "") || typeof action.label !== "string" || !action.label.trim()) {
      throw new Error("Package actions require a declared object, safe action key, registered handler key and label");
    }
    const registered = await db(
      `INSERT INTO platform_registered_actions
       (company_id,object_id,action_key,label,description,handler_key,required_permission,config,active,
        source_package_id,source_package_version,managed,package_required)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,true,$9,$10,true,$11)
       ${companyId ? "ON CONFLICT (company_id,action_key) WHERE company_id IS NOT NULL" : "ON CONFLICT (action_key) WHERE company_id IS NULL"}
       DO UPDATE SET
         object_id=CASE WHEN platform_registered_actions.user_modified THEN platform_registered_actions.object_id ELSE EXCLUDED.object_id END,
         label=CASE WHEN platform_registered_actions.user_modified THEN platform_registered_actions.label ELSE EXCLUDED.label END,
         description=CASE WHEN platform_registered_actions.user_modified THEN platform_registered_actions.description ELSE EXCLUDED.description END,
         handler_key=CASE WHEN platform_registered_actions.user_modified THEN platform_registered_actions.handler_key ELSE EXCLUDED.handler_key END,
         required_permission=CASE WHEN platform_registered_actions.user_modified THEN platform_registered_actions.required_permission ELSE EXCLUDED.required_permission END,
         config=CASE WHEN platform_registered_actions.user_modified THEN platform_registered_actions.config ELSE COALESCE(platform_registered_actions.config,'{}'::jsonb) || EXCLUDED.config END,
         active=CASE WHEN platform_registered_actions.user_modified THEN platform_registered_actions.active ELSE true END,
         source_package_version=EXCLUDED.source_package_version,managed=true,
         package_required=EXCLUDED.package_required,updated_at=NOW()
       WHERE platform_registered_actions.config->>'packageOwned'='true'
         AND platform_registered_actions.config->>'packageId'=EXCLUDED.config->>'packageId'
       RETURNING id`,
      [companyId || null, objectId, actionKey, action.label.trim(), action.description || null,
        handlerKey, action.requiredPermission || action.required_permission || null,
        JSON.stringify({ ...(action.config || {}), packageOwned: true, packageId }), packageId, packageVersion,
        action.required === true]
    );
    if (!registered.rows.length) throw new Error(`Package action key is owned by another declaration: ${actionKey}`);
  }

  for (const button of Array.isArray(manifest.buttons) ? manifest.buttons : []) {
    const objectKey = button.objectKey || button.object_key;
    let objectId = objectIds.get(objectKey);
    if (!objectId && objectKey) {
      const external = await db(
        "SELECT id FROM platform_objects WHERE object_key=$1 AND (company_id IS NULL OR company_id=$2) LIMIT 1",
        [objectKey, companyId]
      );
      objectId = external.rows[0]?.id || null;
    }
    const buttonKey = button.buttonKey || button.button_key;
    const targetType = String(button.targetType || button.target_type || "action").toLowerCase();
    const actionKey = button.actionKey || button.action_key || null;
    const targetKey = button.targetKey || button.target_key || actionKey;
    if (!objectId || !safeMetadataKey(buttonKey) || typeof button.label !== "string" || !button.label.trim() ||
        !["action", "workflow"].includes(targetType) || !targetKey) {
      throw new Error("Package buttons require an available object, safe key, label and action/workflow target");
    }
    const registered = await db(
      `INSERT INTO platform_buttons
       (company_id,object_id,button_key,label,action_key,placement,visibility_rule,config,active,target_type,target_key,variant,required_permission,input_mappings,
        source_package_id,source_package_version,managed,package_required)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,true,$9,$10,$11,$12,$13::jsonb,$14,$15,true,$16)
       ${companyId ? "ON CONFLICT (company_id,button_key) WHERE company_id IS NOT NULL" : "ON CONFLICT (button_key) WHERE company_id IS NULL"}
       DO UPDATE SET
         object_id=CASE WHEN platform_buttons.user_modified THEN platform_buttons.object_id ELSE EXCLUDED.object_id END,
         label=CASE WHEN platform_buttons.user_modified THEN platform_buttons.label ELSE EXCLUDED.label END,
         action_key=CASE WHEN platform_buttons.user_modified THEN platform_buttons.action_key ELSE EXCLUDED.action_key END,
         placement=CASE WHEN platform_buttons.user_modified THEN platform_buttons.placement ELSE EXCLUDED.placement END,
         visibility_rule=CASE WHEN platform_buttons.user_modified THEN platform_buttons.visibility_rule ELSE EXCLUDED.visibility_rule END,
         config=CASE WHEN platform_buttons.user_modified THEN platform_buttons.config ELSE COALESCE(platform_buttons.config,'{}'::jsonb) || EXCLUDED.config END,
         active=CASE WHEN platform_buttons.user_modified THEN platform_buttons.active ELSE true END,
         target_type=CASE WHEN platform_buttons.user_modified THEN platform_buttons.target_type ELSE EXCLUDED.target_type END,
         target_key=CASE WHEN platform_buttons.user_modified THEN platform_buttons.target_key ELSE EXCLUDED.target_key END,
         variant=CASE WHEN platform_buttons.user_modified THEN platform_buttons.variant ELSE EXCLUDED.variant END,
         required_permission=CASE WHEN platform_buttons.user_modified THEN platform_buttons.required_permission ELSE EXCLUDED.required_permission END,
         input_mappings=CASE WHEN platform_buttons.user_modified THEN platform_buttons.input_mappings ELSE EXCLUDED.input_mappings END,
         source_package_version=EXCLUDED.source_package_version,managed=true,
         package_required=EXCLUDED.package_required,updated_at=NOW()
       WHERE platform_buttons.config->>'packageOwned'='true'
         AND platform_buttons.config->>'packageId'=EXCLUDED.config->>'packageId'
       RETURNING id`,
      [companyId || null, objectId, buttonKey, button.label.trim(), actionKey || targetKey,
        button.placement || "record", JSON.stringify(button.visibilityRule || button.visibility_rule || {}),
        JSON.stringify({ packageOwned: true, packageId, ...(button.config || {}) }),
        targetType, targetKey, button.variant || "primary",
        button.requiredPermission || button.required_permission || null,
        JSON.stringify(button.inputMappings || button.input_mappings || {}),
        packageId, packageVersion, button.required === true]
    );
    if (!registered.rows.length) throw new Error(`Package button key is owned by another declaration: ${buttonKey}`);
  }

  const packageRules = [
    ...(Array.isArray(manifest.rules) ? manifest.rules : []),
    ...(Array.isArray(manifest.workflows) ? manifest.workflows.map((workflow) => ({
      ...workflow,
      name: workflow.name || workflow.label,
      action: {
        ...(workflow.action || {}),
        type: "workflow",
        apiName: workflow.apiName || workflow.action?.apiName || null,
        match: workflow.match || workflow.action?.match || "all",
        scope: workflow.scope || workflow.action?.scope || null,
        channel: workflow.channel || workflow.action?.channel || null,
        inputContract: workflow.inputContract || workflow.action?.inputContract || [],
        outputContract: workflow.outputContract || workflow.action?.outputContract || [],
        resources: workflow.resources || workflow.variables || workflow.action?.resources || [],
        gptBuilderElements: (() => {
          const actions = workflow.actions || workflow.action?.actions || [];
          const existing = workflow.gptBuilderElements || workflow.action?.gptBuilderElements || [];
          if (Array.isArray(existing) && existing.length === actions.length) return existing;
          return actions.map((step, index) => ({
            id: step.id || `package-step-${index + 1}`,
            key: "action",
            label: step.label || step.apiName || step.key || `Step ${index + 1}`,
            apiName: step.apiName || step.id || `Package_Step_${index + 1}`,
            description: step.description || "",
            labelSource: "manual",
            apiNameSource: "manual",
            config: {
              actionKey: step.key || step.type || "",
              inputs: {},
              inputModes: {},
              inputIncluded: {},
              transforms: {},
              outputMode: "automatic",
              manualOutputs: [],
              importedRuntimeAction: step,
              importedRuntimeActionText: "",
            },
            configured: true,
            source: "runtime_import",
            position: null,
          }));
        })(),
        layout: workflow.layout || workflow.action?.layout || { mode: "AUTO" },
        gptBuilder: true,
        actions: workflow.actions || workflow.action?.actions || [],
      },
    })) : []),
  ];
  for (const rule of packageRules) {
    const objectKey = rule.objectKey || rule.object_key;
    let objectId = objectIds.get(objectKey);
    if (!objectId) {
      const external = await db(
        "SELECT id FROM platform_objects WHERE object_key=$1 AND (company_id IS NULL OR company_id=$2) LIMIT 1",
        [objectKey, companyId]
      );
      objectId = external.rows[0]?.id;
    }

    // Workflows may legitimately target an object owned by a required
    // dependency (for example WhatsApp Assistant -> Communication Core's
    // communication_event). Installation is idempotent, so if the shared
    // object is not present yet, provision the dependency that declares it
    // and resolve the object again before rejecting the package.
    if (!objectId && objectKey && Array.isArray(manifest.dependencies)) {
      const dependencyKeys = manifest.dependencies
        .map((dependency) => typeof dependency === "string" ? dependency : dependency?.packageKey || dependency?.package_key)
        .filter(Boolean);
      if (dependencyKeys.length) {
        const dependencies = await db(
          `SELECT p.id,p.package_key,p.version,p.manifest,p.module_id
             FROM package_registry p
            WHERE p.package_key=ANY($1::text[]) AND p.active=true`,
          [dependencyKeys]
        );
        const owner = (dependencies.rows || []).find((dependency) =>
          Array.isArray(dependency.manifest?.objects)
          && dependency.manifest.objects.some((definition) =>
            (definition?.objectKey || definition?.object_key || definition?.key) === objectKey
          )
        );
        if (owner?.id && owner?.module_id) {
          await provisionPackageMetadata(db, {
            packageId: owner.id,
            moduleId: owner.module_id,
            companyId,
            manifest: owner.manifest || {},
            packageVersion: owner.version || owner.manifest?.version || "1.0.0",
          });
          const resolved = await db(
            "SELECT id FROM platform_objects WHERE object_key=$1 AND (company_id IS NULL OR company_id=$2) LIMIT 1",
            [objectKey, companyId]
          );
          objectId = resolved.rows[0]?.id;
        }
      }
    }

    if (!objectId) {
      throw new Error(`Package rule "${rule.name || "(unnamed)"}" references unavailable object "${objectKey || "(missing)"}"`);
    }
    if (typeof rule.name !== "string" || !rule.name.trim()) {
      throw new Error("Package rules require a name");
    }
    if (!safeMetadataKey(rule.triggerKey || rule.trigger_key)) {
      throw new Error(`Package rule "${rule.name}" has an invalid trigger key`);
    }
    // Package manifests are the authority for whether their managed rules/workflows
    // are active. Previously only validation rules and KIOSK_EXPERIENCE workflows
    // could ever become active, which silently disabled communication/appointment
    // workflows even when a package explicitly declared active: true.
    const packageRuleActive = rule.active === true;
    const packageRuleLifecycle = packageRuleActive
      ? "ACTIVE"
      : String(rule.lifecycleStatus || rule.lifecycle_status || "INACTIVE").toUpperCase() === "ACTIVE" && rule.active === true
        ? "ACTIVE"
        : "INACTIVE";

    const existingRule = await db(
      "SELECT id,action,source_package_id,user_modified FROM platform_rules WHERE object_id=$1 AND company_id IS NOT DISTINCT FROM $2 AND name=$3 LIMIT 1",
      [objectId, companyId || null, rule.name.trim()]
    );
    const ruleAction = { ...(rule.action || {}), packageKey: manifest.packageKey || rule.packageKey };
    if (existingRule.rows.length) {
      if (existingRule.rows[0].source_package_id !== packageId) {
        throw new Error(`Package workflow name is owned by another declaration: ${rule.name}`);
      }
      if (existingRule.rows[0].user_modified) continue;
      await db(
        `UPDATE platform_rules
            SET trigger_key=CASE WHEN user_modified THEN trigger_key ELSE $1 END,
                conditions=CASE WHEN user_modified THEN conditions ELSE $2::jsonb END,
                action=CASE WHEN user_modified THEN action ELSE $3::jsonb END,
                active=CASE WHEN user_modified THEN active ELSE $4 END,
                lifecycle_status=CASE WHEN user_modified THEN lifecycle_status ELSE $5 END,
                source_package_version=$6,managed=true,package_required=$7,
                updated_at=NOW()
          WHERE id=$8 AND source_package_id=$9`,
        [rule.triggerKey || rule.trigger_key, JSON.stringify(rule.conditions || []), JSON.stringify(ruleAction),
          packageRuleActive,
          packageRuleLifecycle,
          packageVersion, rule.required === true, existingRule.rows[0].id, packageId]
      );
      continue;
    }
    await db(
      `INSERT INTO platform_rules
       (object_id,name,trigger_key,conditions,action,active,company_id,lifecycle_status,source_package_id,source_package_version,managed,package_required)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9,$10,true,$11)`,
      [
        objectId,
        rule.name.trim(),
        rule.triggerKey || rule.trigger_key,
        JSON.stringify(rule.conditions || []),
        JSON.stringify(ruleAction),
        packageRuleActive,
        companyId || null,
        packageRuleLifecycle,
        packageId,
        packageVersion,
        rule.required === true,
      ]
    );
  }

  const forms = [
    ...(Array.isArray(manifest.forms) ? manifest.forms.filter((form) =>
      (form.objectKey || form.object_key) && form.definition && typeof form.definition === "object"
    ).map((form) => ({
      ...form,
      pageType: form.pageType || form.page_type || "edit",
    })) : []),
  ];
  for (const layout of forms) {
    const objectId = objectIds.get(layout.objectKey || layout.object_key);
    const pageType = layout.pageType || layout.page_type;
    const layoutKey = layout.layoutKey || layout.layout_key || layout.name;
    if (!objectId || !["list", "detail", "view", "create", "edit", "quick_create"].includes(pageType) ||
        !safeMetadataKey(String(layoutKey || "").replace(/-/g, "_")) ||
        typeof layout.name !== "string" || !layout.name.trim() ||
        !layout.definition || typeof layout.definition !== "object") {
      throw new Error("Package forms and layouts require a declared object, safe key, name, page type, and definition");
    }
    const registered = await db(
      `INSERT INTO platform_layouts
       (object_id,page_type,company_id,name,layout_key,definition,active,is_default,
        source_package_id,source_package_version,managed,package_required)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,true,$7,$8,$9,true,$10)
       ON CONFLICT (object_id,page_type,layout_key) WHERE layout_key <> ''
       DO UPDATE SET name=CASE WHEN platform_layouts.user_modified THEN platform_layouts.name ELSE EXCLUDED.name END,
         layout_key=EXCLUDED.layout_key,
         definition=CASE WHEN platform_layouts.user_modified THEN platform_layouts.definition ELSE EXCLUDED.definition END,
         active=CASE WHEN platform_layouts.user_modified THEN platform_layouts.active ELSE true END,
         is_default=CASE WHEN platform_layouts.user_modified THEN platform_layouts.is_default ELSE EXCLUDED.is_default END,
         source_package_version=EXCLUDED.source_package_version,managed=true,
         package_required=EXCLUDED.package_required
       WHERE platform_layouts.source_package_id=EXCLUDED.source_package_id
       RETURNING id`,
      [objectId, pageType, companyId || null, layout.name.trim(), layoutKey,
        JSON.stringify(layout.definition), layout.isDefault === true, packageId,
        packageVersion, layout.required === true]
    );
    if (!registered.rows?.length && registered.rowCount === 0) {
      throw new Error(`Package layout is owned by another declaration: ${layoutKey}`);
    }
  }

  for (const report of Array.isArray(manifest.reports) ? manifest.reports : []) {
    const objectId = objectIds.get(report.objectKey || report.object_key);
    const reportKey = report.reportKey || report.report_key;
    if (!objectId || !safeMetadataKey(reportKey) || typeof report.label !== "string" || !report.label.trim()) {
      throw new Error("Package reports require a declared object, safe report key, and label");
    }
    const registered = await db(
      `INSERT INTO platform_reports
       (object_id,company_id,report_key,label,description,config,active,source_package_id,
        source_package_version,managed,package_required)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,true,$7,$8,true,$9)
       ON CONFLICT (object_id,company_id,report_key)
       DO UPDATE SET label=CASE WHEN platform_reports.user_modified THEN platform_reports.label ELSE EXCLUDED.label END,
         description=CASE WHEN platform_reports.user_modified THEN platform_reports.description ELSE EXCLUDED.description END,
         config=CASE WHEN platform_reports.user_modified THEN platform_reports.config ELSE EXCLUDED.config END,
         active=CASE WHEN platform_reports.user_modified THEN platform_reports.active ELSE true END,
         source_package_version=EXCLUDED.source_package_version,managed=true,
         package_required=EXCLUDED.package_required
       WHERE platform_reports.source_package_id=EXCLUDED.source_package_id
       RETURNING id`,
      [objectId, companyId || null, reportKey, report.label.trim(), report.description || null,
        JSON.stringify(report.config || {}), packageId, packageVersion, report.required === true]
    );
    if (!registered.rows?.length && registered.rowCount === 0) {
      throw new Error(`Package report is owned by another declaration: ${reportKey}`);
    }
  }

  for (const connector of Array.isArray(manifest.connectors) ? manifest.connectors : []) {
    const connectorKey = connector.connectorKey || connector.connector_key;
    const baseUrl = connector.baseUrl || connector.base_url;
    let parsedUrl;
    try { parsedUrl = new URL(baseUrl); } catch { parsedUrl = null; }
    if (!safeMetadataKey(String(connectorKey || "").replace(/[.-]/g, "_")) ||
        typeof connector.name !== "string" || !connector.name.trim() ||
        !parsedUrl || !["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Package connectors require a safe key, name, and HTTP(S) base URL");
    }
    const registered = await db(
      `INSERT INTO platform_connector_definitions
       (connector_key,name,description,publisher,auth_type,base_url,credentials_schema,operations,
        timeout_ms,retry_policy,status,source_package_id,source_package_version,managed,package_required)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10::jsonb,'ACTIVE',$11,$12,true,$13)
       ON CONFLICT(connector_key)
       DO UPDATE SET name=CASE WHEN platform_connector_definitions.user_modified THEN platform_connector_definitions.name ELSE EXCLUDED.name END,
         description=CASE WHEN platform_connector_definitions.user_modified THEN platform_connector_definitions.description ELSE EXCLUDED.description END,
         auth_type=CASE WHEN platform_connector_definitions.user_modified THEN platform_connector_definitions.auth_type ELSE EXCLUDED.auth_type END,
         base_url=CASE WHEN platform_connector_definitions.user_modified THEN platform_connector_definitions.base_url ELSE EXCLUDED.base_url END,
         credentials_schema=CASE WHEN platform_connector_definitions.user_modified THEN platform_connector_definitions.credentials_schema ELSE EXCLUDED.credentials_schema END,
         operations=CASE WHEN platform_connector_definitions.user_modified THEN platform_connector_definitions.operations ELSE EXCLUDED.operations END,
         source_package_version=EXCLUDED.source_package_version,managed=true,
         package_required=EXCLUDED.package_required,updated_at=NOW()
       WHERE platform_connector_definitions.source_package_id=EXCLUDED.source_package_id
       RETURNING id`,
      [connectorKey, connector.name.trim(), connector.description || null, connector.publisher || null,
        connector.authType || connector.auth_type || "none", parsedUrl.toString(),
        JSON.stringify(connector.credentialsSchema || connector.credentials_schema || []),
        JSON.stringify(connector.operations || []),
        Number.isInteger(connector.timeoutMs || connector.timeout_ms) ? (connector.timeoutMs || connector.timeout_ms) : 15000,
        JSON.stringify(connector.retryPolicy || connector.retry_policy || { maxAttempts: 3, backoffMs: 1000 }),
        packageId, packageVersion, connector.required === true]
    );
    if (!registered.rows?.length && registered.rowCount === 0) {
      throw new Error(`Package connector is owned by another declaration: ${connectorKey}`);
    }
  }

  if (Array.isArray(manifest.templates) && manifest.templates.length && !companyId) {
    throw new Error("Package message templates require a company installation scope");
  }
  for (const template of Array.isArray(manifest.templates) ? manifest.templates : []) {
    const apiKey = template.apiKey || template.api_key || template.templateKey || template.template_key;
    const channel = String(template.channel || "").toUpperCase();
    if (!safeMetadataKey(apiKey) || typeof template.name !== "string" || !template.name.trim() ||
        !["EMAIL", "SMS", "WHATSAPP"].includes(channel) || typeof template.body !== "string" || !template.body.trim()) {
      throw new Error("Package templates require a safe key, name, supported channel, and body");
    }
    const registered = await db(
      `INSERT INTO platform_message_templates
       (company_id,name,api_key,description,channel,subject,body,active,created_by,
        source_package_id,source_package_version,managed,package_required)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,NULL,$8,$9,true,$10)
       ON CONFLICT(company_id,api_key)
       DO UPDATE SET name=CASE WHEN platform_message_templates.user_modified THEN platform_message_templates.name ELSE EXCLUDED.name END,
         description=CASE WHEN platform_message_templates.user_modified THEN platform_message_templates.description ELSE EXCLUDED.description END,
         channel=CASE WHEN platform_message_templates.user_modified THEN platform_message_templates.channel ELSE EXCLUDED.channel END,
         subject=CASE WHEN platform_message_templates.user_modified THEN platform_message_templates.subject ELSE EXCLUDED.subject END,
         body=CASE WHEN platform_message_templates.user_modified THEN platform_message_templates.body ELSE EXCLUDED.body END,
         active=CASE WHEN platform_message_templates.user_modified THEN platform_message_templates.active ELSE true END,
         source_package_version=EXCLUDED.source_package_version,managed=true,
         package_required=EXCLUDED.package_required,updated_at=NOW()
       WHERE platform_message_templates.source_package_id=EXCLUDED.source_package_id
       RETURNING id`,
      [companyId, template.name.trim(), apiKey, template.description || null, channel,
        template.subject || null, template.body, packageId, packageVersion,
        template.required === true]
    );
    if (!registered.rows?.length && registered.rowCount === 0) {
      throw new Error(`Package template key is owned by another declaration: ${apiKey}`);
    }
  }

  for (const permission of Array.isArray(manifest.objectPermissions) ? manifest.objectPermissions : []) {
    const objectId = objectIds.get(permission.objectKey || permission.object_key);
    const roleId = permission.roleId || permission.role_id;
    if (!objectId || !roleId || !companyId) {
      throw new Error("Package object permissions require a declared object, role, and company scope");
    }
    const role = await db("SELECT id FROM roles WHERE id=$1 AND company_id=$2", [roleId, companyId]);
    if (!role.rows.length) throw new Error(`Package permission role is not available: ${roleId}`);
    const registered = await db(
      `INSERT INTO platform_object_permissions
       (object_id,role_id,company_id,can_view,can_create,can_edit,can_delete,
        source_package_id,source_package_version,managed,package_required)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10)
       ON CONFLICT(object_id,role_id,company_id)
       DO UPDATE SET can_view=CASE WHEN platform_object_permissions.user_modified THEN platform_object_permissions.can_view ELSE EXCLUDED.can_view END,
         can_create=CASE WHEN platform_object_permissions.user_modified THEN platform_object_permissions.can_create ELSE EXCLUDED.can_create END,
         can_edit=CASE WHEN platform_object_permissions.user_modified THEN platform_object_permissions.can_edit ELSE EXCLUDED.can_edit END,
         can_delete=CASE WHEN platform_object_permissions.user_modified THEN platform_object_permissions.can_delete ELSE EXCLUDED.can_delete END,
         source_package_version=EXCLUDED.source_package_version,managed=true,
         package_required=EXCLUDED.package_required
       WHERE platform_object_permissions.source_package_id=EXCLUDED.source_package_id
       RETURNING id`,
      [objectId, roleId, companyId, permission.canView !== false, permission.canCreate === true,
        permission.canEdit === true, permission.canDelete === true, packageId,
        packageVersion, permission.required === true]
    );
    if (!registered.rows?.length && registered.rowCount === 0) {
      throw new Error(`Package permission is owned by another declaration for role: ${roleId}`);
    }
  }

  for (const permission of Array.isArray(manifest.fieldPermissions) ? manifest.fieldPermissions : []) {
    const objectId = objectIds.get(permission.objectKey || permission.object_key);
    const fieldApiName = permission.fieldApiName || permission.field_api_name;
    const roleId = permission.roleId || permission.role_id;
    if (!objectId || !safeMetadataKey(fieldApiName) || !roleId || !companyId) {
      throw new Error("Package field permissions require a declared field, role, and company scope");
    }
    const field = await db(
      "SELECT id FROM platform_fields WHERE object_id=$1 AND api_name=$2 AND (company_id IS NULL OR company_id=$3)",
      [objectId, fieldApiName, companyId]
    );
    if (!field.rows.length) throw new Error(`Package permission field is not available: ${fieldApiName}`);
    const role = await db("SELECT id FROM roles WHERE id=$1 AND company_id=$2", [roleId, companyId]);
    if (!role.rows.length) throw new Error(`Package permission role is not available: ${roleId}`);
    const registered = await db(
      `INSERT INTO platform_field_security
       (field_id,role_id,company_id,readable,writable,source_package_id,source_package_version,managed,package_required)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8)
       ON CONFLICT(field_id,role_id,company_id)
       DO UPDATE SET readable=CASE WHEN platform_field_security.user_modified THEN platform_field_security.readable ELSE EXCLUDED.readable END,
         writable=CASE WHEN platform_field_security.user_modified THEN platform_field_security.writable ELSE EXCLUDED.writable END,
         source_package_version=EXCLUDED.source_package_version,managed=true,
         package_required=EXCLUDED.package_required
       WHERE platform_field_security.source_package_id=EXCLUDED.source_package_id
       RETURNING id`,
      [field.rows[0].id, roleId, companyId, permission.readable !== false,
        permission.writable === true, packageId, packageVersion, permission.required === true]
    );
    if (!registered.rows?.length && registered.rowCount === 0) {
      throw new Error(`Package field permission is owned by another declaration: ${fieldApiName}`);
    }
  }

  for (const event of Array.isArray(manifest.events) ? manifest.events : []) {
    const eventType = String(event.eventType || event.event_type || "").trim();
    if (!eventType || eventType.length > 200) throw new Error("Package events require an event type of 1 to 200 characters");
    const registered = await db(
      `INSERT INTO platform_event_types(event_type,description,source_package_id,active)
       VALUES($1,$2,$3,TRUE)
       ON CONFLICT(event_type) DO UPDATE SET description=EXCLUDED.description,source_package_id=EXCLUDED.source_package_id,active=TRUE
       WHERE platform_event_types.source_package_id IS NULL OR platform_event_types.source_package_id=EXCLUDED.source_package_id
       RETURNING event_type`,
      [eventType, event.description || null, packageId]
    );
    if (!registered.rows.length) throw new Error(`Package event type is owned by another declaration: ${eventType}`);
  }

  const ownedPermissionCodes = manifest.metadataOwnership?.permissions;
  if (Array.isArray(ownedPermissionCodes) && ownedPermissionCodes.length) {
    const permissions = await db(
      "SELECT id,code FROM permissions WHERE code=ANY($1::text[])",
      [ownedPermissionCodes]
    );
    const permissionsByCode = new Map(permissions.rows.map((permission) => [permission.code, permission]));
    for (const code of ownedPermissionCodes) {
      const permission = permissionsByCode.get(code);
      if (!permission) throw new Error(`Package permission is not seeded: ${code}`);
      await db(
        `INSERT INTO package_metadata_ownership
         (package_id,package_version,metadata_type,metadata_id,managed,package_required,default_snapshot)
         VALUES ($1,$2,'permission',$3,true,true,$4::jsonb)
         ON CONFLICT(package_id,metadata_type,metadata_id) DO UPDATE SET
           package_version=EXCLUDED.package_version,managed=true,package_required=true,updated_at=NOW()`,
        [packageId, packageVersion, permission.id, JSON.stringify({ code })]
      );
    }
  }

  const ownedMetadata = await db(
    `WITH owned AS (
       SELECT 'object'::text AS metadata_type,o.id,o.package_required,o.user_modified,to_jsonb(o) AS snapshot
         FROM platform_objects o WHERE o.package_id=$1
       UNION ALL
       SELECT 'field',f.id,f.package_required,f.user_modified,to_jsonb(f)
         FROM platform_fields f JOIN platform_objects o ON o.id=f.object_id
        WHERE o.package_id=$1 OR f.source_package_id=$1
       UNION ALL
       SELECT 'relationship',r.id,r.package_required,r.user_modified,to_jsonb(r)
         FROM platform_relationships r WHERE r.source_package_id=$1
       UNION ALL
       SELECT CASE WHEN l.page_type IN ('create','edit','quick_create') THEN 'form' ELSE 'layout' END,
              l.id,l.package_required,l.user_modified,to_jsonb(l)
         FROM platform_layouts l WHERE l.source_package_id=$1
       UNION ALL
       SELECT CASE WHEN r.action->>'type'='validation' THEN 'validation' ELSE 'workflow' END,
              r.id,r.package_required,r.user_modified,to_jsonb(r)
         FROM platform_rules r WHERE r.source_package_id=$1
       UNION ALL
       SELECT 'report',r.id,r.package_required,r.user_modified,to_jsonb(r)
         FROM platform_reports r WHERE r.source_package_id=$1
       UNION ALL
       SELECT 'action',a.id,a.package_required,a.user_modified,to_jsonb(a)
         FROM platform_registered_actions a
        WHERE a.source_package_id=$1 OR a.config->>'packageId'=$1::text
       UNION ALL
       SELECT 'button',b.id,b.package_required,b.user_modified,to_jsonb(b)
         FROM platform_buttons b
        WHERE b.source_package_id=$1 OR b.config->>'packageId'=$1::text
       UNION ALL
       SELECT 'list_view',v.id,v.package_required,v.user_modified,to_jsonb(v)
         FROM platform_list_views v WHERE v.source_package_id=$1
       UNION ALL
       SELECT 'permission',p.id,p.package_required,p.user_modified,to_jsonb(p)
         FROM platform_object_permissions p WHERE p.source_package_id=$1
       UNION ALL
       SELECT 'field_permission',p.id,p.package_required,p.user_modified,to_jsonb(p)
         FROM platform_field_security p WHERE p.source_package_id=$1
       UNION ALL
       SELECT 'connector',c.id,c.package_required,c.user_modified,to_jsonb(c)
         FROM platform_connector_definitions c WHERE c.source_package_id=$1
       UNION ALL
       SELECT 'template',t.id,t.package_required,t.user_modified,to_jsonb(t)
         FROM platform_message_templates t WHERE t.source_package_id=$1
       UNION ALL
       SELECT 'app',a.id,a.package_required,a.user_modified,to_jsonb(a)
         FROM platform_apps a WHERE a.source_package_id=$1
       UNION ALL
       SELECT 'page',p.id,p.package_required,p.user_modified,to_jsonb(p)
         FROM platform_pages p WHERE p.source_package_id=$1
       UNION ALL
       SELECT 'page',p.id,false,false,to_jsonb(p) FROM platform_pages p
         JOIN platform_apps a ON a.id=p.app_id
        WHERE a.app_key=('package_' || replace($1::text,'-','_'))
     )
     INSERT INTO package_metadata_ownership
       (package_id,package_version,metadata_type,metadata_id,managed,package_required,user_modified,default_snapshot)
     SELECT $1::uuid,$2::text,metadata_type,id,true,package_required,user_modified,
            jsonb_build_object('packageVersion',$2::text,'metadata',snapshot)
       FROM owned
     ON CONFLICT(package_id,metadata_type,metadata_id) DO UPDATE SET
       package_version=EXCLUDED.package_version,managed=true,
       package_required=EXCLUDED.package_required,
       user_modified=package_metadata_ownership.user_modified OR EXCLUDED.user_modified,
       default_snapshot=CASE WHEN package_metadata_ownership.user_modified
         THEN package_metadata_ownership.default_snapshot ELSE EXCLUDED.default_snapshot END,
       updated_at=NOW()`,
    [packageId, packageVersion]
  );
  const conflicts = await db(
    `SELECT metadata_type,metadata_id
       FROM package_metadata_ownership
      WHERE package_id=$1 AND package_version=$2 AND managed=true AND user_modified=true
        AND default_snapshot->>'packageVersion' IS DISTINCT FROM $2`,
    [packageId, packageVersion]
  );
  await db(
    `UPDATE package_metadata_ownership
        SET managed=false,updated_at=NOW()
      WHERE package_id=$1 AND package_version<>$2 AND managed=true`,
    [packageId, packageVersion]
  );
  for (const table of [
    "platform_objects",
    "platform_fields",
    "platform_relationships",
    "platform_layouts",
    "platform_rules",
    "platform_reports",
    "platform_list_views",
    "platform_object_permissions",
    "platform_field_security",
    "platform_connector_definitions",
    "platform_message_templates",
    "platform_apps",
    "platform_pages",
    "platform_registered_actions",
    "platform_buttons",
  ]) {
    const ownerColumn = table === "platform_objects" ? "package_id" : "source_package_id";
    await db(
      `UPDATE ${table} metadata SET managed=false
        WHERE metadata.${ownerColumn}=$1 AND metadata.source_package_version IS DISTINCT FROM $2
          AND NOT EXISTS (
            SELECT 1 FROM package_metadata_ownership owner
             WHERE owner.package_id=$1 AND owner.metadata_id=metadata.id
               AND owner.package_version=$2 AND owner.managed=true
          )`,
      [packageId, packageVersion]
    );
  }
  return { objects: objectIds.size, ownedMetadata: ownedMetadata.rowCount || 0, conflicts: conflicts.rows || [] };
}

export async function capturePackageMetadataSnapshot(db, { packageId, companyId }) {
  const result = await db(
    `SELECT metadata_type,metadata_id,package_version,user_modified,package_required,
            default_snapshot->'metadata' AS state
       FROM package_metadata_ownership
      WHERE package_id=$1 AND managed=true
        AND (default_snapshot->'metadata'->>'company_id' IS NULL
          OR default_snapshot->'metadata'->>'company_id'=$2)
      ORDER BY metadata_type,metadata_id`,
    [packageId, companyId]
  );
  return (result.rows || []).map((row) => ({
    metadataType: row.metadata_type,
    metadataId: row.metadata_id,
    packageVersion: row.package_version,
    userModified: row.user_modified === true,
    packageRequired: row.package_required === true,
    state: row.state || null,
  }));
}

export async function provisionDefaultCompanyPackages(db, { companyId, installedBy = null, packageKeys = ["staff", "retail_pos", "products", "customers"] }) {
  for (const packageKey of packageKeys) {
    const packageResult = await db(
      `SELECT p.id, p.version, p.module_id, p.manifest
       FROM package_registry p
       WHERE p.package_key=$1 AND p.active=true`,
      [packageKey]
    );
    if (!packageResult.rows.length) continue;
    const pkg = packageResult.rows[0];
    if (packageKey === "products") {
      await provisionPackageMetadata(db, {
        packageId: pkg.id,
        moduleId: pkg.module_id,
        companyId,
        manifest: pkg.manifest || {},
        packageVersion: pkg.version,
      });
    }
    await db(
      `INSERT INTO company_package_installations
       (company_id,package_id,version,status,installed_by,installation_type)
       VALUES ($1,$2,$3,'active',$4,'PLATFORM_DEFAULT')
       ON CONFLICT (company_id,package_id) DO NOTHING`,
      [companyId, pkg.id, pkg.version, installedBy]
    );
    await db(
      `INSERT INTO company_package_entitlement_sources
       (company_id,package_id,source_type,source_key,active,metadata)
       VALUES ($1,$2,'PLATFORM_DEFAULT',$3,true,$4::jsonb)
       ON CONFLICT(company_id,package_id,source_type,source_key)
       DO UPDATE SET active=true,metadata=EXCLUDED.metadata`,
      [companyId, pkg.id, `platform-default:${pkg.id}`, JSON.stringify({ installationType: "PLATFORM_DEFAULT" })]
    );
    if (packageKey === "staff" || packageKey === "products") {
      await provisionPackageMetadata(db, {
        packageId: pkg.id,
        moduleId: pkg.module_id,
        companyId,
        manifest: pkg.manifest || {},
        packageVersion: pkg.version,
      });
    }
    if (pkg.module_id) {
      await db(
        `INSERT INTO platform_module_access (module_id,company_id,store_id,enabled)
         VALUES ($1,$2,NULL,true)
         ON CONFLICT (module_id,company_id,COALESCE(store_id,'00000000-0000-0000-0000-000000000000'::uuid))
         DO UPDATE SET enabled=true,updated_at=NOW()`,
        [pkg.module_id, companyId]
      );
    }
  }
}

export async function removePackageMetadata(db, { companyId, packageId }) {
  const ownership = await db(
    `SELECT metadata_type,metadata_id
       FROM package_metadata_ownership
      WHERE package_id=$1 AND managed=true AND package_required=false AND user_modified=false`,
    [packageId]
  );
  const removable = new Map();
  for (const row of ownership.rows) {
    const ids = removable.get(row.metadata_type) || [];
    ids.push(row.metadata_id);
    removable.set(row.metadata_type, ids);
  }
  const scopedDelete = (table, type, ownerColumn = "source_package_id") => {
    const ids = removable.get(type) || [];
    if (!ids.length) return Promise.resolve({ rowCount: 0 });
    if (table === "platform_relationships") return Promise.resolve({ rowCount: 0 });
    return db(
      `DELETE FROM ${table}
        WHERE id=ANY($1::uuid[]) AND ${ownerColumn}=$2 AND company_id=$3
        RETURNING id`,
      [ids, packageId, companyId]
    );
  };
  const removedIds = [];
  const removeScoped = async (table, type, ownerColumn) => {
    const ids = removable.get(type) || [];
    if (!ids.length) return;
    const result = await scopedDelete(table, type, ownerColumn);
    removedIds.push(...(result.rows || []).map((row) => row.id));
  };

  for (const type of ["field_permission", "permission"]) {
    await removeScoped(type === "permission" ? "platform_object_permissions" : "platform_field_security", type);
  }
  await removeScoped("platform_layouts", "form");
  await removeScoped("platform_layouts", "layout");
  await removeScoped("platform_rules", "workflow");
  await removeScoped("platform_reports", "report");
  await removeScoped("platform_list_views", "list_view");
  await removeScoped("platform_registered_actions", "action");
  await removeScoped("platform_buttons", "button");
  await removeScoped("platform_pages", "page");
  await removeScoped("platform_apps", "app");
  // Connector definitions are global and may be referenced by retained
  // connection configuration or encrypted credentials after an app uninstall.
  await removeScoped("platform_message_templates", "template");
  await removeScoped("platform_relationships", "relationship");
  await removeScoped("platform_fields", "field");

  const objectIds = removable.get("object") || [];
  if (objectIds.length) {
    const deletedObjects = await db(
      `DELETE FROM platform_objects o
        WHERE o.id=ANY($1::uuid[]) AND o.package_id=$3
          AND o.managed=true AND o.package_required=false AND o.user_modified=false
          AND o.company_id=$2
          AND NOT EXISTS (
            SELECT 1 FROM platform_relationships r
             WHERE (r.parent_object_id=o.id OR r.child_object_id=o.id)
               AND r.source_package_id IS DISTINCT FROM $3
          )
          AND NOT EXISTS (
            SELECT 1 FROM platform_fields f WHERE f.object_id=o.id
              AND f.source_package_id IS DISTINCT FROM $3
          )
          AND NOT EXISTS (
            SELECT 1 FROM platform_layouts l WHERE l.object_id=o.id
              AND l.source_package_id IS DISTINCT FROM $3
          )
          AND NOT EXISTS (
            SELECT 1 FROM platform_reports r WHERE r.object_id=o.id
              AND r.source_package_id IS DISTINCT FROM $3
          )
        RETURNING o.id`,
        [objectIds, companyId, packageId]
    );
    removedIds.push(...(deletedObjects.rows || []).map((row) => row.id));
  }

  if (removedIds.length) {
    await db(
      `DELETE FROM package_metadata_ownership
        WHERE package_id=$1 AND metadata_id=ANY($2::uuid[])`,
      [packageId, [...new Set(removedIds)]]
    );
  }
}

export async function verifyPublicPackageRegistry(queryTarget) {
  const query = typeof queryTarget === "function"
    ? queryTarget
    : queryTarget?.query?.bind(queryTarget);
  if (typeof query !== "function") throw new Error("Package registry verification requires a query function");

  const expected = packageDefinitions()
    .filter((definition) =>
      definition?.manifest?.visibility !== "HIDDEN" &&
      definition?.manifest?.systemOnly !== true &&
      (definition?.manifest?.lifecycleState || "PUBLISHED") === "PUBLISHED"
    )
    .map((definition) => ({
      packageKey: definition.packageKey,
      version: definition.version,
      name: definition.name,
    }));

  if (!expected.length) {
    return { healthy: true, expectedCount: 0, actualCount: 0, missing: [], stale: [] };
  }

  const keys = expected.map((item) => item.packageKey);
  const result = await query(
    `SELECT package_key,name,version,visible,system_only,publication_state,active
       FROM package_registry
      WHERE package_key=ANY($1::text[])`,
    [keys]
  );
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  const byKey = new Map(rows.map((row) => [row.package_key, row]));
  const missing = expected.filter((item) => !byKey.has(item.packageKey)).map((item) => item.packageKey);
  const stale = expected.flatMap((item) => {
    const row = byKey.get(item.packageKey);
    if (!row) return [];
    const reasons = [];
    if (row.visible !== true) reasons.push("not_visible");
    if (row.system_only === true) reasons.push("system_only");
    if (String(row.publication_state || "").toUpperCase() !== "PUBLISHED") reasons.push("not_published");
    if (row.active !== true) reasons.push("inactive");
    if (String(row.version || "") !== String(item.version || "")) reasons.push("version_mismatch");
    if (String(row.name || "") !== String(item.name || "")) reasons.push("name_mismatch");
    return reasons.length ? [{ packageKey: item.packageKey, reasons }] : [];
  });

  return {
    healthy: missing.length === 0 && stale.length === 0,
    expectedCount: expected.length,
    actualCount: rows.length,
    missing,
    stale,
  };
}

export function seedPackageRegistry(pool) {
  return (async () => {
    const definitions = packageDefinitions();
    try {
      const moduleKeys = [...new Set(definitions.map((definition) => definition.moduleKey).filter(Boolean))];
      const moduleRows = moduleKeys.length
        ? (await pool.query(
            "SELECT id,module_key FROM platform_modules WHERE module_key=ANY($1::text[])",
            [moduleKeys]
          )).rows
        : [];
      const moduleByKey = new Map(moduleRows.map((row) => [row.module_key, row]));
      for (const definition of definitions) {
      const moduleRow = moduleByKey.get(definition.moduleKey);
      if (!moduleRow) continue;
      await pool.query(
        `INSERT INTO package_registry
         (package_key,name,version,description,module_id,manifest,package_type,publisher,category,visible,installable,billable,system_only,display_order,publication_state,licence_mode,available_tiers)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)
         ON CONFLICT (package_key) DO UPDATE SET
           name=EXCLUDED.name,
           version=EXCLUDED.version,
           description=EXCLUDED.description,
           module_id=EXCLUDED.module_id,
           manifest=EXCLUDED.manifest,
           package_type=EXCLUDED.package_type,
           publisher=EXCLUDED.publisher,
           category=EXCLUDED.category,
           visible=EXCLUDED.visible,
           installable=EXCLUDED.installable,
           billable=EXCLUDED.billable,
           system_only=EXCLUDED.system_only,
           display_order=EXCLUDED.display_order,
           publication_state=EXCLUDED.publication_state,
           licence_mode=EXCLUDED.licence_mode,
           available_tiers=EXCLUDED.available_tiers,
           active=TRUE,
           updated_at=NOW()`,
        [
          definition.packageKey, definition.name, definition.version, definition.description,
          moduleRow.id, JSON.stringify(definition.manifest),
          definition.manifest.packageType, definition.manifest.publisher, definition.manifest.category,
          definition.manifest.visibility !== "HIDDEN", definition.manifest.installable !== false,
          definition.manifest.billable !== false, definition.manifest.systemOnly === true,
          Number(definition.manifest.displayOrder || 0), definition.manifest.lifecycleState || "PUBLISHED",
          definition.manifest.licenceMode, JSON.stringify(definition.manifest.availableTiers || []),
        ]
      );
      }
      const packageRows = (await pool.query(
        "SELECT id,package_key FROM package_registry WHERE package_key=ANY($1::text[])",
        [definitions.map((definition) => definition.packageKey)]
      )).rows;
      const packageByKey = new Map(packageRows.map((row) => [row.package_key, row]));
      for (const definition of definitions) {
      const packageRow = packageByKey.get(definition.packageKey);
      if (!packageRow) continue;
      await pool.query("DELETE FROM package_dependencies WHERE package_id=$1", [packageRow.id]);
      const dependencies = [
        ...definition.dependencies,
        ...definition.manifest.optionalDependencies.map((dependency) => (
          typeof dependency === "string" ? { packageKey: dependency, optional: true } : { ...dependency, optional: true }
        )),
      ];
      for (const dependency of dependencies) {
        const dependencyKey = typeof dependency === "string" ? dependency : dependency.packageKey || dependency.package_key;
        const dependencyRow = packageByKey.get(dependencyKey);
        if (!dependencyRow) throw new Error(`Package dependency not found: ${dependencyKey}`);
        await pool.query(
          `INSERT INTO package_dependencies
           (package_id,dependency_id,version_range,min_version,max_version,optional)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            packageRow.id,
            dependencyRow.id,
            typeof dependency === "string" ? null : dependency.versionRange || dependency.version_range || null,
            typeof dependency === "string" ? null : dependency.minVersion || dependency.min_version || null,
            typeof dependency === "string" ? null : dependency.maxVersion || dependency.max_version || null,
            typeof dependency === "string" ? false : dependency.optional === true,
          ]
        );
      }
      }
    } catch (error) {
      if (error?.code) throw error;
      console.warn("Package registry is unavailable; continuing Platform metadata bootstrap.");
    }
    return definitions;
  })();
}
