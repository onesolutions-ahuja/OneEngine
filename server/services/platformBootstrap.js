import { seedInternalAppCatalog } from "./internalAppCatalog.js";
import { platformSchema } from "./platformSchema.js";

function splitSqlStatements(sql) {
  const statements = [];
  let start = 0;
  let i = 0;
  let state = "normal";
  let dollarTag = null;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (state === "single") {
      if (ch === "'" && next === "'") { i += 2; continue; }
      if (ch === "'") state = "normal";
      i += 1; continue;
    }
    if (state === "double") {
      if (ch === '"' && next === '"') { i += 2; continue; }
      if (ch === '"') state = "normal";
      i += 1; continue;
    }
    if (state === "line-comment") {
      if (ch === "\n") state = "normal";
      i += 1; continue;
    }
    if (state === "block-comment") {
      if (ch === "*" && next === "/") { state = "normal"; i += 2; continue; }
      i += 1; continue;
    }
    if (state === "dollar") {
      if (sql.startsWith(dollarTag, i)) { i += dollarTag.length; state = "normal"; dollarTag = null; continue; }
      i += 1; continue;
    }

    if (ch === "'") { state = "single"; i += 1; continue; }
    if (ch === '"') { state = "double"; i += 1; continue; }
    if (ch === "-" && next === "-") { state = "line-comment"; i += 2; continue; }
    if (ch === "/" && next === "*") { state = "block-comment"; i += 2; continue; }
    if (ch === "$") {
      const match = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) { dollarTag = match[0]; state = "dollar"; i += dollarTag.length; continue; }
    }
    if (ch === ";") {
      const statement = sql.slice(start, i + 1).trim();
      if (statement) statements.push(statement);
      start = i + 1;
    }
    i += 1;
  }
  const tail = sql.slice(start).trim();
  if (tail) statements.push(tail);
  return statements;
}

export async function initializePlatformMetadata(pool) {
  const bootstrapQuery = async (label, sql, params = []) => {
    const startedAt = Date.now();
    console.log(`onePOS: platform bootstrap step start: ${label}`);
    const result = await pool.query({ text: sql, values: params, query_timeout: 30000 });
    console.log(`onePOS: platform bootstrap step ready: ${label} (${Date.now() - startedAt}ms)`);
    return result;
  };

  const schemaStatements = splitSqlStatements(platformSchema);
  console.log(`onePOS: platform bootstrap schema statements: ${schemaStatements.length}`);
  for (let index = 0; index < schemaStatements.length; index += 1) {
    await bootstrapQuery(`schema ${index + 1}/${schemaStatements.length}`, schemaStatements[index]);
  }

  // The package catalogue is already synchronized before the HTTP listener is
  // exposed. Do not rewrite the same package_registry rows during metadata
  // bootstrap; overlapping startup instances can otherwise deadlock here.
  // Package manifests contain package identity, dependency and entitlement configuration only.
  // Business metadata is database-owned and must never be provisioned from package manifests at startup.
  // This prevents legacy persisted manifest payloads from reintroducing hardcoded objects, fields,
  // relationships, views, rules, workflows, reports, layouts or other business definitions.
}
