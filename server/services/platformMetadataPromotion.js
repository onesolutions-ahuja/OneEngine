const SAFE_KEY = /^[a-z_][a-z0-9_]{0,99}$/;

function requiredCompanyId(value) {
  const companyId = String(value || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(companyId)) throw new Error("A valid source company ID is required");
  return companyId;
}

function normalizeObject(object) {
  if (!SAFE_KEY.test(object.object_key) || !SAFE_KEY.test(object.source_table || "")) {
    throw new Error(`Object ${object.object_key || object.id} has an unsupported or unsafe source table`);
  }
  return {
    objectKey: object.object_key,
    label: object.label,
    pluralLabel: object.plural_label || null,
    description: object.description || null,
    sourceTable: object.source_table,
    companyScoped: object.company_scoped !== false,
    storeScoped: object.store_scoped === true,
    ...(object.company_id === null ? { metadataScope: "global" } : {}),
    fields: [],
  };
}

function normalizeField(field, warnings) {
  const config = field.config && typeof field.config === "object" ? { ...field.config } : {};
  if (config.valueSetId || config.value_set_id) {
    warnings.push(`Reusable value set on ${field.api_name} was flattened to field options.`);
    delete config.valueSetId;
    delete config.value_set_id;
  }
  return {
    apiName: field.api_name,
    label: field.label,
    fieldType: field.field_type,
    sourceColumn: field.source_column || null,
    required: field.required === true,
    readable: field.readable !== false,
    writable: field.writable === true,
    options: Array.isArray(field.promotion_options) ? field.promotion_options : field.options || [],
    config,
    displayOrder: Number(field.display_order) || 0,
    ...(field.company_id === null ? { metadataScope: "global" } : {}),
  };
}

function normalizeLayout(layout, objectKey) {
  const base = {
    objectKey,
    pageType: layout.page_type,
    name: layout.name,
    layoutKey: layout.layout_key,
    definition: layout.definition,
    isDefault: layout.is_default === true,
    required: layout.package_required === true,
    ...(layout.company_id === null ? { metadataScope: "global" } : {}),
  };
  return ["create", "edit", "quick_create"].includes(layout.page_type)
    ? { ...base, pageType: layout.page_type }
    : base;
}

export async function exportPlatformMetadataManifest(db, { companyId: rawCompanyId, objectKeys: rawObjectKeys } = {}) {
  if (typeof db !== "function") throw new Error("A database query function is required");
  const companyId = requiredCompanyId(rawCompanyId);
  const objectKeys = [...new Set((Array.isArray(rawObjectKeys) ? rawObjectKeys : [])
    .map((key) => String(key || "").trim()).filter(Boolean))];
  if (!objectKeys.length || objectKeys.some((key) => !SAFE_KEY.test(key))) {
    throw new Error("At least one safe object key is required");
  }

  const objectResult = await db(
    "SELECT * FROM platform_objects WHERE object_key=ANY($1::text[]) AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY object_key",
    [objectKeys, companyId]
  );
  const objects = objectResult.rows || [];
  const foundKeys = new Set(objects.map((object) => object.object_key));
  const missing = objectKeys.filter((key) => !foundKeys.has(key));
  if (missing.length) throw new Error(`Objects are unavailable in the source company: ${missing.join(", ")}`);

  const ids = objects.map((object) => object.id);
  const objectKeyById = new Map(objects.map((object) => [String(object.id), object.object_key]));
  const warnings = [];
  const [fieldResult, relationshipResult, layoutResult, listViewResult, ruleResult, reportResult, recordTypeResult, appResult, pageResult, packageResult] = await Promise.all([
    db("SELECT * FROM platform_fields WHERE object_id=ANY($1::uuid[]) AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY object_id,display_order,api_name", [ids, companyId]),
    db("SELECT r.*,p.object_key AS parent_object_key,c.object_key AS child_object_key,f.api_name AS child_field_api_name FROM platform_relationships r JOIN platform_objects p ON p.id=r.parent_object_id JOIN platform_objects c ON c.id=r.child_object_id LEFT JOIN platform_fields f ON f.id=r.child_field_id WHERE (r.parent_object_id=ANY($1::uuid[]) OR r.child_object_id=ANY($1::uuid[])) AND r.active=true AND (p.company_id IS NULL OR p.company_id=$2) AND (c.company_id IS NULL OR c.company_id=$2) ORDER BY r.relationship_key", [ids, companyId]),
    db("SELECT * FROM platform_layouts WHERE object_id=ANY($1::uuid[]) AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY object_id,page_type,layout_key", [ids, companyId]),
    db("SELECT v.*,o.object_key FROM platform_list_views v JOIN platform_objects o ON o.id=v.object_id WHERE v.object_id=ANY($1::uuid[]) AND v.active=true AND v.company_id=$2 AND v.owner_user_id IS NULL ORDER BY o.object_key,v.view_key", [ids, companyId]),
    db("SELECT r.*,o.object_key FROM platform_rules r JOIN platform_objects o ON o.id=r.object_id WHERE r.object_id=ANY($1::uuid[]) AND r.active=true AND r.company_id=$2 AND r.source_package_id IS NULL ORDER BY o.object_key,r.name", [ids, companyId]),
    db("SELECT r.*,o.object_key FROM platform_reports r JOIN platform_objects o ON o.id=r.object_id WHERE r.object_id=ANY($1::uuid[]) AND r.active=true AND r.company_id=$2 AND r.source_package_id IS NULL ORDER BY o.object_key,r.report_key", [ids, companyId]),
    db("SELECT t.*,o.object_key FROM platform_record_types t JOIN platform_objects o ON o.id=t.object_id WHERE t.object_id=ANY($1::uuid[]) AND t.active=true AND t.company_id=$2 ORDER BY o.object_key,t.record_type_key", [ids, companyId]),
    db("SELECT * FROM platform_apps WHERE company_id=$1 AND active=true ORDER BY app_key", [companyId]),
    db("SELECT p.*,a.app_key FROM platform_pages p JOIN platform_apps a ON a.id=p.app_id WHERE p.company_id=$1 AND p.active=true AND a.active=true ORDER BY a.app_key,p.page_key", [companyId]),
    db("SELECT p.package_key,p.version,p.manifest FROM company_package_installations i JOIN package_registry p ON p.id=i.package_id WHERE i.company_id=$1 AND i.status='active' AND p.active=true ORDER BY p.package_key", [companyId]),
  ]);

  const fields = fieldResult.rows || [];
  for (const field of fields) {
    const valueSetId = field.config?.valueSetId || field.config?.value_set_id;
    if (valueSetId) {
      const values = await db(
        "SELECT v.value,v.label,v.active,v.display_order FROM platform_value_set_values v JOIN platform_value_sets s ON s.id=v.value_set_id WHERE s.id=$1 AND s.company_id=$2 AND s.active=true ORDER BY v.display_order,v.label",
        [valueSetId, companyId]
      );
      field.promotion_options = values.rows.map((value) => ({
        value: value.value,
        label: value.label,
        active: value.active !== false,
        displayOrder: Number(value.display_order) || 0,
      }));
    }
  }

  const manifestObjects = objects.map(normalizeObject);
  const manifestObjectById = new Map(objects.map((object, index) => [String(object.id), manifestObjects[index]]));
  for (const field of fields) {
    manifestObjectById.get(String(field.object_id))?.fields.push(normalizeField(field, warnings));
  }

  const relationships = (relationshipResult.rows || []).map((relationship) => ({
    parentObjectKey: relationship.parent_object_key,
    childObjectKey: relationship.child_object_key,
    relationshipKey: relationship.relationship_key,
    relationshipType: relationship.relationship_type,
    ...(relationship.child_field_api_name ? { childFieldApiName: relationship.child_field_api_name } : {}),
    required: relationship.package_required === true,
  }));
  const layouts = (layoutResult.rows || []).map((layout) => normalizeLayout(layout, objectKeyById.get(String(layout.object_id))));
  const listViews = (listViewResult.rows || []).map((view) => ({
    objectKey: view.object_key,
    viewKey: view.view_key,
    label: view.label,
    description: view.description || null,
    columns: view.columns || [],
    filters: view.filters || {},
    sort: view.sort || { field: null, direction: "asc" },
    pageSize: Number(view.page_size) || 50,
    isDefault: view.is_default === true,
  }));
  const rules = (ruleResult.rows || []).map((rule) => ({
    objectKey: rule.object_key,
    name: rule.name,
    triggerKey: rule.trigger_key,
    conditions: rule.conditions || [],
    action: rule.action,
    active: rule.active === true,
    lifecycleStatus: rule.lifecycle_status || (rule.active ? "ACTIVE" : "INACTIVE"),
    required: rule.package_required === true,
  }));
  const recordTypes = (recordTypeResult.rows || []).map((type) => ({
    objectKey: type.object_key,
    recordTypeKey: type.record_type_key,
    label: type.label,
    description: type.description || null,
    defaultValues: type.default_values || {},
    isDefault: type.is_default === true,
    active: type.active !== false,
  }));
  const reports = (reportResult.rows || []).map((report) => ({
    objectKey: report.object_key,
    reportKey: report.report_key,
    label: report.label,
    description: report.description || null,
    config: report.config || {},
    required: report.package_required === true,
  }));
  const recordForms = layouts.filter((layout) => ["create", "edit", "quick_create"].includes(layout.pageType));
  const portableLayouts = layouts.filter((layout) => !["create", "edit", "quick_create"].includes(layout.pageType));

  const apps = (appResult.rows || []).map((app) => ({ appKey: app.app_key, label: app.label, description: app.description || null, config: app.config || {} }));
  const pages = (pageResult.rows || []).map((page) => ({ appKey: page.app_key, pageKey: page.page_key, label: page.label, routePath: page.route_path, pageType: page.page_type, definition: page.definition || {} }));
  const packages = (packageResult.rows || []).map((pkg) => ({ packageKey: pkg.package_key, version: pkg.version, dependencies: pkg.manifest?.dependencies || [] }));

  return {
    schemaVersion: 1,
    sourceCompanyId: companyId,
    manifest: {
      objects: manifestObjects,
      relationships,
      layouts: portableLayouts,
      recordForms,
      listViews,
      rules,
      reports,
      recordTypes,
      apps,
      pages,
      packages,
    },
    warnings: [...new Set(warnings)],
  };
}

export async function exportDashboardMetadataManifest(db, { companyId: rawCompanyId, dashboardKeys: rawDashboardKeys } = {}) {
  const companyId = requiredCompanyId(rawCompanyId);
  const dashboardKeys = [...new Set((Array.isArray(rawDashboardKeys) ? rawDashboardKeys : []).map((key) => String(key || "").trim()).filter(Boolean))];
  if (!dashboardKeys.length || dashboardKeys.some((key) => !SAFE_KEY.test(key))) throw new Error("At least one safe dashboard key is required");
  const result = await db("SELECT * FROM dashboards WHERE company_id=$1 AND api_key=ANY($2::text[]) AND archived_at IS NULL ORDER BY api_key", [companyId, dashboardKeys]);
  const dashboards = [];
  const warnings = [];
  for (const dashboard of result.rows || []) {
    const convert = async (entries) => Promise.all((Array.isArray(entries) ? entries : []).map(async (entry) => {
      const type = String(entry.principal_type || "").toUpperCase();
      if (type === "COMPANY") return { principalType: type, principalKey: "company", accessLevel: entry.access_level, priority: entry.priority, active: entry.active !== false };
      if (type === "USER") {
        const principal = await db("SELECT username FROM users WHERE id=$1 AND company_id=$2", [entry.principal_id, companyId]);
        if (!principal.rows?.[0]?.username) {
          warnings.push(`Dashboard ${dashboard.api_key} has an unresolved direct USER reference; it is non-portable.`);
          return { principalType: type, principalKey: null, sourcePrincipalId: String(entry.principal_id), portable: false, accessLevel: entry.access_level, priority: entry.priority, active: entry.active !== false };
        }
        return { principalType: type, principalKey: principal.rows[0].username, accessLevel: entry.access_level, priority: entry.priority, active: entry.active !== false };
      }
      if (type === "PUBLIC_GROUP") {
        const principal = await db("SELECT api_key FROM platform_public_groups WHERE id=$1 AND company_id=$2 AND active=true", [entry.principal_id, companyId]);
        return { principalType: type, principalKey: principal.rows?.[0]?.api_key || null, portable: Boolean(principal.rows?.[0]?.api_key), accessLevel: entry.access_level, priority: entry.priority, active: entry.active !== false };
      }
      if (type === "ROLE") {
        const principal = await db("SELECT api_key FROM roles WHERE id=$1 AND company_id=$2 AND api_key IS NOT NULL", [entry.principal_id, companyId]);
        if (principal.rows?.[0]?.api_key) return { principalType: type, principalKey: principal.rows[0].api_key, accessLevel: entry.access_level, priority: entry.priority, active: entry.active !== false };
      }
      warnings.push(`Dashboard ${dashboard.api_key} ${type} reference has no canonical stable key; it is non-portable.`);
      return { principalType: type, principalKey: null, sourcePrincipalId: String(entry.principal_id), portable: false, accessLevel: entry.access_level, priority: entry.priority, active: entry.active !== false };
    }));
    dashboards.push({
      dashboardKey: dashboard.api_key,
      name: dashboard.name,
      description: dashboard.description || "",
      run_as_mode: "VIEWER",
      components: dashboard.components || [],
      filters: dashboard.filters || [],
      access: await convert(dashboard.access),
      defaultAssignments: await convert(dashboard.default_assignments),
    });
  }
  const found = new Set(dashboards.map((dashboard) => dashboard.dashboardKey));
  const missing = dashboardKeys.filter((key) => !found.has(key));
  if (missing.length) throw new Error(`Dashboards are unavailable in the source company: ${missing.join(", ")}`);
  return { schemaVersion: 1, sourceCompanyId: companyId, manifest: { dashboards }, warnings: [...new Set(warnings)] };
}