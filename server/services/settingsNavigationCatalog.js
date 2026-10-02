/*
 * LIGHTWEIGHT SETTINGS NAVIGATION METADATA
 *
 * This is the single server-side catalogue for the Settings shell. It carries
 * navigation/presentation metadata only — never Object fields, layouts,
 * formulas, workflows, records, or other heavyweight metadata.
 *
 * The client consumes this payload as the authority for Settings groups,
 * labels, descriptions, ordering and actions. Package/Object-hosted Settings
 * destinations are appended at runtime by routes/platform.js.
 */
export const SETTINGS_GROUPS = [
  { key: "company-setup", label: "Company Setup", order: 10 },
  { key: "sales-tax", label: "Sales & Tax", order: 20 },
  { key: "hardware", label: "Hardware", order: 30 },
  { key: "security-identity", label: "Security & Identity", order: 40 },
  { key: "users", label: "Users", order: 50 },
  { key: "ai-assistant", label: "AI assistant", order: 60 },
  { key: "integrations", label: "Integrations", order: 60 },
  { key: "communications", label: "Communications", order: 70 },
  { key: "system", label: "System", order: 80 },
  { key: "developer", label: "Developer", order: 90 },
];

export const SETTINGS_SECTIONS = [
  { key: "general", label: "General", groupKey: "company-setup", order: 10, iconKey: "settings", description: "Configure your onePOS system preferences and regional settings.", action: { type: "tab", tab: "General" } },
  { key: "company", label: "Company", groupKey: "company-setup", order: 20, iconKey: "building", description: "Company identity, contact details and regional defaults.", action: { type: "tab", tab: "Company" } },
  { key: "store-till", label: "Store & Till", groupKey: "company-setup", order: 30, iconKey: "store", description: "Manage your stores, tills and invoice settings.", action: { type: "tab", tab: "Store & Till" } },
  { key: "client-web-shop", label: "Client Web Shop", groupKey: "company-setup", order: 40, iconKey: "shopping-cart", description: "Configure your public storefront and guest checkout.", gate: "settings-manage", action: { type: "tab", tab: "Client Web Shop" } },

  { key: "tax-vat", label: "Tax / VAT", groupKey: "sales-tax", order: 10, iconKey: "receipt", description: "VAT registration, rates and how tax is applied at the till.", action: { type: "tab", tab: "Tax / VAT" } },
  { key: "receipts", label: "Receipts", groupKey: "sales-tax", order: 20, iconKey: "receipt", description: "How receipts are presented and printed at the till.", action: { type: "tab", tab: "Receipts" } },
  { key: "payment-terminals", label: "Payment Terminals", groupKey: "sales-tax", order: 30, iconKey: "credit-card", description: "Card payment terminals connected to this company.", action: { type: "tab", tab: "Payment Terminals" } },
  { key: "customer-loyalty", label: "Customer Loyalty", groupKey: "sales-tax", order: 40, iconKey: "sparkles", description: "Configure the customer loyalty programme.", gate: "settings-manage", action: { type: "tab", tab: "Customer Loyalty" } },

  { key: "hardware", label: "Hardware", groupKey: "hardware", order: 10, iconKey: "hard-drive", description: "Barcode scanners, cash drawers and receipt printers.", action: { type: "tab", tab: "Hardware" } },
  { key: "connections", label: "Connection Health", groupKey: "hardware", order: 20, iconKey: "cable", description: "Device and integration health at a glance.", action: { type: "tab", tab: "Connections" } },

  { key: "security-identity", label: "Security & Identity", groupKey: "security-identity", order: 10, iconKey: "shield", description: "Login IP ranges, trusted networks, login hours, password and session policies, login history and active sessions.", gate: "settings-manage", action: { type: "tab", tab: "Security & Identity" } },
  { key: "mfa-administration", label: "MFA Administration", groupKey: "security-identity", order: 20, iconKey: "shield", description: "Delegated MFA support, temporary verification codes, trusted devices and identity verification history.", gate: "mfa-manage", action: { type: "tab", tab: "MFA Administration" } },

  { key: "users", label: "Users", groupKey: "users", order: 10, iconKey: "shield", description: "People who can sign in and what they can access.", action: { type: "tab", tab: "Users" } },
  { key: "roles-permissions", label: "Roles & Permissions", groupKey: "users", order: 20, iconKey: "shield", description: "Roles and the permissions each role holds.", action: { type: "tab", tab: "Roles & Permissions" } },

  { key: "ai-assistant", label: "AI assistant", groupKey: "ai-assistant", order: 10, iconKey: "sparkles", description: "JARVES licence allowance and availability.", action: { type: "tab", tab: "AI assistant" } },

  { key: "uber-eats", label: "Uber Eats", groupKey: "integrations", order: 20, iconKey: "cable", description: "Uber Eats ordering integration for this company.", action: { type: "tab", tab: "Uber Eats" } },
  { key: "deliveroo", label: "Deliveroo", groupKey: "integrations", order: 30, iconKey: "cable", description: "Deliveroo ordering integration for this company.", action: { type: "tab", tab: "Deliveroo" } },
  { key: "whatsapp-assistant", label: "WhatsApp Assistant", groupKey: "integrations", order: 40, iconKey: "cable", description: "Workflow-driven WhatsApp Business assistant for this company.", gate: "settings-manage", action: { type: "tab", tab: "WhatsApp Assistant" } },

  { key: "sms-delivery", label: "SMS Delivery", groupKey: "communications", order: 10, iconKey: "credit-card", description: "Invoice and receipt delivery by SMS.", action: { type: "tab", tab: "SMS Delivery" } },
  { key: "email-delivery", label: "Email Delivery", groupKey: "communications", order: 20, iconKey: "credit-card", description: "Invoice and receipt delivery by email.", action: { type: "tab", tab: "Email Delivery" } },

  { key: "server-api", label: "Server / API Configuration", groupKey: "system", order: 10, iconKey: "monitor-cog", description: "Device-level server and API connection settings.", gate: "oneengine-manage", action: { type: "tab", tab: "Server / API Configuration" } },

  { key: "objects", label: "Objects", groupKey: "developer", order: 10, iconKey: "layout-grid", description: "Objects, fields, relationships, rules, approvals and object metadata.", gate: "oneengine-manage", action: { type: "tab", tab: "Objects" } },
  { key: "assignment-rules", label: "Assignment Rules", groupKey: "developer", order: 20, iconKey: "layout-grid", description: "Object-scoped record assignment and routing rules.", gate: "oneengine-manage", action: { type: "tab", tab: "Assignment Rules" } },
  { key: "sharing-rules", label: "Sharing Rules", groupKey: "developer", order: 30, iconKey: "shield", description: "Object-scoped record sharing and access rules.", gate: "oneengine-manage", action: { type: "tab", tab: "Sharing Rules" } },
  { key: "platform", label: "Builders", groupKey: "developer", order: 40, iconKey: "layout-grid", description: "Workflow, Approval Flow, Page, Dashboard and Report canvases.", gate: "oneengine-manage", action: { type: "tab", tab: "Platform" } },
  { key: "workflow-runs", label: "Workflow Runs", groupKey: "developer", order: 50, iconKey: "workflow", description: "Inspect workflow execution history and outcomes.", gate: "oneengine-manage", action: { type: "tab", tab: "Workflow Runs" } },
  { key: "work-items", label: "Work Items", groupKey: "developer", order: 60, iconKey: "list", description: "Review workflow and approval work items.", gate: "oneengine-manage", action: { type: "tab", tab: "Work Items" } },
  { key: "platform-apps", label: "Platform Apps", groupKey: "developer", order: 70, iconKey: "layout-grid", description: "Manage platform app metadata and composition.", gate: "oneengine-manage", action: { type: "tab", tab: "Platform Apps" } },
  { key: "deployments", label: "Deployments", groupKey: "developer", order: 80, iconKey: "rocket", description: "Manage metadata deployments and promotion.", gate: "oneengine-manage", action: { type: "tab", tab: "Deployments" } },
  { key: "notifications", label: "Notifications", groupKey: "developer", order: 90, iconKey: "bell", description: "Manage platform notification subscriptions.", gate: "oneengine-manage", action: { type: "tab", tab: "Notifications" } },
  { key: "value-sets", label: "Value Sets", groupKey: "developer", order: 100, iconKey: "list", description: "Reusable picklist and value-set metadata.", gate: "oneengine-manage", action: { type: "tab", tab: "Value Sets" } },
  { key: "message-templates", label: "Message Templates", groupKey: "developer", order: 110, iconKey: "receipt", description: "Message templates used across communications.", gate: "settings-manage", action: { type: "tab", tab: "Message Templates" } },
];

export function settingsSectionAllowed(section, { permissions = [] } = {}) {
  const codes = new Set(Array.isArray(permissions) ? permissions : []);
  switch (section.gate) {
    case "settings-manage": return codes.has("settings.manage");
    case "mfa-manage": return codes.has("settings.manage") || codes.has("security.mfa.manage") || codes.has("security.identity_verification_history.view");
    case "oneengine-manage": return codes.has("oneengine.manage");
    default: return true;
  }
}

export function buildSettingsCatalog(access = {}) {
  const sections = SETTINGS_SECTIONS
    .filter((section) => settingsSectionAllowed(section, access))
    .map(({ gate, ...section }) => ({ ...section }));

  const activeGroups = new Set(sections.map((section) => section.groupKey));
  const groups = SETTINGS_GROUPS.filter((group) => activeGroups.has(group.key));
  return { groups, sections };
}
