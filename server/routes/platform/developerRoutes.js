export function registerPlatformDeveloperRoutes({ router, authenticate, db, resolveActingCompany, hasOneEngineManageAccess }) {
  router.get("/platform/workflow-providers", authenticate, resolveActingCompany, async (req, res, next) => {
    try {
      const result = await db(
        `SELECT c.id,c.name,c.provider_name,c.base_url,c.auth_type,c.connector_configuration,
                c.timeout_ms,c.connection_status,c.enabled,
                d.connector_key,d.name AS connector_name,d.credentials_schema
           FROM integration_connections c
           LEFT JOIN platform_connector_definitions d ON d.id=c.connector_definition_id
          WHERE c.company_id=$1 AND c.enabled=true
          ORDER BY COALESCE(d.name,c.name,c.provider_name),c.updated_at DESC`,
        [req.platformCompanyId || req.user.companyId]
      );
      const seen = new Set();
      const providers = [];
      const secretName = /(password|token|secret|api[_-]?key|authorization|cookie|credential|private[_-]?key|client[_-]?secret)/i;
      for (const row of result.rows || []) {
        const providerKey = String(row.provider_name || row.connector_key || "").trim();
        if (!providerKey || seen.has(providerKey.toLowerCase())) continue;
        seen.add(providerKey.toLowerCase());
        const configuration = row.connector_configuration && typeof row.connector_configuration === "object" && !Array.isArray(row.connector_configuration)
          ? row.connector_configuration
          : {};
        const schema = Array.isArray(row.credentials_schema)
          ? row.credentials_schema
          : Object.entries(row.credentials_schema || {}).map(([key,value]) => ({ key, ...(value || {}) }));
        const fixed = [
          { key: "name", label: "Name", value: row.connector_name || row.name || providerKey, secure: false },
          { key: "providerKey", label: "Provider Key", value: providerKey, secure: false },
          { key: "baseUrl", label: "Base URL", value: row.base_url || "", secure: false },
          { key: "authType", label: "Auth Type", value: row.auth_type || "none", secure: false },
          { key: "timeoutMs", label: "Timeout (ms)", value: Number(row.timeout_ms || 15000), secure: false },
          { key: "status", label: "Status", value: row.connection_status || "", secure: false },
        ];
        const configFields = Object.entries(configuration)
          .filter(([key]) => !secretName.test(key))
          .map(([key,value]) => ({ key, label: key, value, secure: false }));
        const credentialFields = schema
          .map((field) => {
            const key = String(field?.key || field?.name || "").trim();
            if (!key) return null;
            return { key, label: field?.label || field?.name || key, value: "********", secure: true };
          })
          .filter(Boolean);
        providers.push({
          id: row.id,
          providerKey,
          name: row.connector_name || row.name || providerKey,
          variableName: `Provider_${providerKey.replace(/[^A-Za-z0-9_]/g, "_")}`,
          fields: [...fixed, ...configFields, ...credentialFields],
        });
      }
      res.json({ success: true, data: providers });
    } catch (error) {
      next(error);
    }
  });

  router.get("/platform/developer/companies", authenticate, async (req, res) => {
    const oneEngineManager = await hasOneEngineManageAccess(req);
    if (!oneEngineManager) {
      return res.status(403).json({ success: false, message: "OneEngine Manager permission required" });
    }

    const result = await db("SELECT c.id,c.name FROM companies c WHERE c.active=true ORDER BY c.name");
    res.json({ success: true, data: result.rows });
  });

  router.put("/platform/developer/acting-company", authenticate, async (req, res) => {
    const companyId = req.body?.actingCompanyId;
    const oneEngineManager = await hasOneEngineManageAccess(req);
    if (!oneEngineManager) {
      return res.status(403).json({ success: false, message: "OneEngine Manager permission required" });
    }

    const result = await db("SELECT c.id,c.name FROM companies c WHERE c.id=$1 AND c.active=true", [companyId]);

    if (!result.rows.length) {
      return res.status(403).json({ success: false, message: "You are not authorised for the selected company" });
    }
    res.json({ success: true, data: { actingCompanyId: result.rows[0].id, company: result.rows[0] } });
  });


}
