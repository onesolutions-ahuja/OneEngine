/*
 * Generic metadata-driven JARVES read-only tools.
 *
 * Tool intent, permissions, data views, formulas and output labels live in
 * package manifests. This runtime knows only how to discover configured tools,
 * enforce their declared permissions, execute generic aggregate views and
 * format non-secret summaries for the assistant prompt.
 */
import { JarvisError, JARVIS_ERROR_CODES } from "../errors.js";
import { runConfiguredAggregateView } from "../../platformRuntimeViews.js";
import { evaluateFormula } from "../../reportAnalyticsRuntime.js";

async function configuredTools(db, companyId) {
  if (!companyId) return [];
  const result = await db(
    `SELECT metadata
       FROM package_registry
      WHERE company_id=$1 AND active=TRUE`,
    [companyId]
  );
  return (result.rows || [])
    .flatMap((row) => Array.isArray(row?.metadata?.assistantTools) ? row.metadata.assistantTools : [])
    .filter((tool) => tool?.key);
}

function compilePattern(pattern) {
  const raw = String(pattern || "");
  if (!raw) return null;
  const insensitive = raw.startsWith("(?i)");
  try {
    return new RegExp(insensitive ? raw.slice(4) : raw, insensitive ? "i" : undefined);
  } catch {
    return null;
  }
}

function toolMatches(tool, question) {
  const text = String(question || "").trim();
  if (!text) return false;
  const patterns = Array.isArray(tool?.match?.anyRegex) ? tool.match.anyRegex : [];
  return patterns.some((pattern) => compilePattern(pattern)?.test(text) === true);
}

async function canUseTool(context, tool, { canViewCompanyScope } = {}) {
  const required = Array.isArray(tool?.permissionAny) ? tool.permissionAny.filter(Boolean) : [];
  if (!required.length) return true;
  const granted = Array.isArray(context?.permissions) ? context.permissions : [];
  if (required.some((code) => granted.includes(code))) return true;
  if (typeof canViewCompanyScope === "function") {
    try {
      if (await canViewCompanyScope(context)) return true;
    } catch (error) {
      console.error("JARVES administrative permission check failed:", error?.message || error);
    }
  }
  return false;
}

async function companyDateContext(db, companyId, toolKey) {
  const result = await db("SELECT timezone FROM companies WHERE id=$1", [companyId]);
  const timezone = result.rows?.[0]?.timezone;
  if (!timezone) {
    throw new JarvisError(JARVIS_ERROR_CODES.TOOL_UNAVAILABLE, {
      detail: `company timezone not found for tool '${toolKey}'`,
    });
  }
  const todayResult = await db("SELECT (NOW() AT TIME ZONE $1)::date AS today", [timezone]);
  const today = todayResult.rows?.[0]?.today ?? null;
  if (!today) {
    throw new JarvisError(JARVIS_ERROR_CODES.TOOL_UNAVAILABLE, {
      detail: `company date could not be resolved for tool '${toolKey}'`,
    });
  }
  return { timezone, today: String(today) };
}

function flattenAggregateResults(results) {
  const flat = {};
  for (const [alias, values] of Object.entries(results || {})) {
    for (const [key, value] of Object.entries(values || {})) flat[`${alias}.${key}`] = Number(value ?? 0);
  }
  return flat;
}

function readConfiguredValue(path, flat) {
  return flat[String(path || "")] ?? null;
}

async function executeConfiguredTool(tool, context, { db, canViewCompanyScope }) {
  if (!context?.companyId) {
    throw new JarvisError(JARVIS_ERROR_CODES.TOOL_UNAVAILABLE, {
      detail: `session has no company scope; tool '${tool.key}' is unavailable`,
    });
  }
  if (!(await canUseTool(context, tool, { canViewCompanyScope }))) {
    throw new JarvisError(JARVIS_ERROR_CODES.TOOL_PERMISSION_DENIED, {
      detail: `user ${context.userId ?? "unknown"} lacks a declared permission for tool '${tool.key}'`,
    });
  }

  const { timezone, today } = await companyDateContext(db, context.companyId, tool.key);
  const aggregateResults = {};
  for (const view of Array.isArray(tool.aggregateViews) ? tool.aggregateViews : []) {
    const alias = String(view?.alias || view?.viewKey || "").trim();
    if (!alias || !view?.viewKey) continue;
    aggregateResults[alias] = await runConfiguredAggregateView({
      db,
      companyId: context.companyId,
      storeId: context.storeId || null,
      viewKey: view.viewKey,
      values: { today, timezone },
    }) || {};
  }

  const flat = flattenAggregateResults(aggregateResults);
  const summary = {};
  for (const [key, path] of Object.entries(tool?.output?.fields || {})) {
    summary[key] = Number(readConfiguredValue(path, flat) ?? 0);
  }
  for (const [key, expression] of Object.entries(tool?.output?.formulas || {})) {
    summary[key] = Number(evaluateFormula(expression, flat) ?? 0);
  }

  return {
    tool: tool.key,
    date: today,
    timezone,
    summary,
    labels: tool?.output?.labels || {},
    currencyFields: Array.isArray(tool?.output?.currencyFields) ? tool.output.currencyFields : [],
  };
}

export function createJarvisTools({ db, canViewCompanyScope = null } = {}) {
  if (typeof db !== "function") throw new Error("createJarvisTools requires the existing db helper");
  async function matchTool(question, context = {}) {
    const tools = await configuredTools(db, context.companyId);
    const tool = tools.find((candidate) => toolMatches(candidate, question));
    return tool ? { name: tool.key } : null;
  }

  async function executeTool(name, context) {
    const tools = await configuredTools(db, context?.companyId);
    const tool = tools.find((candidate) => String(candidate.key) === String(name));
    if (!tool) {
      throw new JarvisError(JARVIS_ERROR_CODES.TOOL_UNAVAILABLE, {
        detail: `unknown tool '${name}'`,
      });
    }
    return executeConfiguredTool(tool, context, { db, canViewCompanyScope });
  }

  return { matchTool, executeTool };
}

export function formatToolResultBlock(result) {
  if (!result?.tool || !result?.summary) return "";
  const currencyFields = new Set(result.currencyFields || []);
  const lines = [
    "TOOL RESULT (server-computed, authoritative - use ONLY these figures):",
    `- tool: ${result.tool}`,
  ];
  if (result.date) lines.push(`- date: ${result.date}${result.timezone ? ` (company timezone: ${result.timezone})` : ""}`);
  for (const [key, value] of Object.entries(result.summary)) {
    const label = result.labels?.[key] || key;
    lines.push(`- ${label}: ${currencyFields.has(key) ? Number(value || 0).toFixed(2) : value}`);
  }
  lines.push("Use only these figures when answering this question. Do not invent, extrapolate or estimate additional values.");
  return lines.join("\n");
}
