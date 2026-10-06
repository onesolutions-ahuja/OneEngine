import { compileFilterLogic, normalizeAdvancedReportDefinition } from "./reportAnalyticsDefinition.js";

export const CUSTOM_REPORT_FIELDS = [
  { key: "date", label: "Date", sql: "(s.created_at AT TIME ZONE c.timezone)::date", groupable: true },
  { key: "store", label: "Store", sql: "st.name", groupable: true },
  { key: "user", label: "Operator", sql: "COALESCE(u.full_name, u.username, 'Unknown')", groupable: true },
  { key: "product", label: "Product", sql: "p.name", groupable: true },
  { key: "category", label: "Category", sql: "COALESCE(pc.name, 'Uncategorised')", groupable: true },
  { key: "method", label: "Payment method", sql: "COALESCE(s.payment_method, h.payment_data->0->>'method', 'Unknown')", groupable: true },
  { key: "sku", label: "SKU", sql: "p.sku", groupable: true },
  { key: "quantity", label: "Quantity sold", sql: "COALESCE(SUM(s.quantity), 0)", aggregate: true },
  { key: "gross_sales", label: "Gross sales", sql: "COALESCE(SUM(s.total), 0)", aggregate: true },
  { key: "net_sales", label: "Net sales", sql: "COALESCE(SUM(s.total - s.tax), 0)", aggregate: true },
  { key: "total", label: "Total", sql: "COALESCE(SUM(s.total), 0)", aggregate: true },
  { key: "vat", label: "VAT", sql: "COALESCE(SUM(s.tax), 0)", aggregate: true },
  { key: "discount", label: "Discounts", sql: "COALESCE(SUM(s.discount), 0)", aggregate: true },
  { key: "transactions", label: "Transactions", sql: "COUNT(DISTINCT s.transaction_id)", aggregate: true },
];

export const CUSTOM_DATE_FILTERS = [
  { key: "all_time", label: "All time" },
  { key: "today", label: "Today" }, { key: "yesterday", label: "Yesterday" },
  { key: "this_week", label: "This week" }, { key: "last_7_days", label: "Last 7 days" },
  { key: "this_month", label: "This month" }, { key: "this_quarter", label: "This quarter" },
  { key: "fiscal_year", label: "Fiscal year" }, { key: "custom", label: "Custom dates" },
];

const CUSTOM_FIELD_MAP = new Map(CUSTOM_REPORT_FIELDS.map((field) => [field.key, field]));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateUuidList(values, label) {
  const normalized = [...new Set((Array.isArray(values) ? values : []).filter((value) => value !== null && value !== undefined).map((value) => String(value).trim()).filter(Boolean))];
  if (normalized.some((value) => !UUID_RE.test(value))) throw new Error(`Invalid ${label} identifier`);
  return normalized;
}

export function customDateRange(filters = [], now = new Date()) {
  const dateFilter = filters.find((filter) => filter && filter.field === "date");
  const operator = dateFilter?.operator || "this_week";
  const iso = (date) => date.toISOString().slice(0, 10);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (operator === "all_time") return { from: null, to: null };
  if (operator === "custom") return { from: dateFilter.from || dateFilter.dateFrom || null, to: dateFilter.to || dateFilter.dateTo || null };
  if (operator === "today") return { from: iso(start), to: iso(start) };
  if (operator === "yesterday") { start.setUTCDate(start.getUTCDate() - 1); return { from: iso(start), to: iso(start) }; }
  if (operator === "last_7_days") { start.setUTCDate(start.getUTCDate() - 6); return { from: iso(start), to: iso(now) }; }
  if (operator === "this_month") return { from: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), to: iso(now) };
  if (operator === "this_quarter") {
    const quarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
    return { from: iso(new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth, 1))), to: iso(now) };
  }
  if (operator === "fiscal_year") return { from: iso(new Date(Date.UTC(now.getUTCFullYear(), 0, 1))), to: iso(now) };
  const day = start.getUTCDay() || 7;
  start.setUTCDate(start.getUTCDate() - day + 1);
  return { from: iso(start), to: iso(now) };
}

export function validateCustomReportDefinition(input = {}) {
  const source = input || {};
  if (source.dataSource && !["sales", "platform_object"].includes(source.dataSource)) throw new Error("Unsupported report data source");
  const advanced = normalizeAdvancedReportDefinition(source);
  if (source.dataSource === "platform_object") {
    return { ...advanced, dataSource: "platform_object", objectId: String(source.objectId || ""), reportTypeId: source.reportTypeId || source.report_type_id || null };
  }
  const fields = advanced.fields;
  if (!fields.length || fields.some((field) => !CUSTOM_FIELD_MAP.has(field))) throw new Error("Select at least one valid report field");
  const rowGroups = advanced.rowGroups;
  const columnGroups = advanced.columnGroups;
  for (const field of [...rowGroups, ...columnGroups]) {
    if (!CUSTOM_FIELD_MAP.has(field) || !CUSTOM_FIELD_MAP.get(field).groupable) throw new Error("Invalid grouping field");
    if (!fields.includes(field)) throw new Error("Grouped fields must be selected");
  }
  if (advanced.sort.some((item) => !item || !CUSTOM_FIELD_MAP.has(String(item.field)) || !fields.includes(String(item.field)))) throw new Error("Invalid sort field");
  for (const filter of advanced.filters) {
    if (!filter || (filter.field && !["date", "store", "user", "product"].includes(String(filter.field)))) throw new Error("Invalid report filter");
    if (filter.field === "date" && filter.operator && !CUSTOM_DATE_FILTERS.some((item) => item.key === filter.operator) && filter.operator !== "relative_date") throw new Error("Invalid date filter");
    if (filter.field && filter.field !== "date" && !["equals", "in"].includes(filter.operator)) throw new Error("Invalid report filter operator");
  }
  return {
    ...advanced,
    dataSource: "sales",
    groupBy: rowGroups,
    storeIds: validateUuidList(source.storeIds, "store"),
    userIds: validateUuidList(source.userIds, "user"),
  };
}

export function buildCustomSalesQuery(definition, dateRange, storeIds, userIds) {
  const params = [dateRange.from || null, dateRange.to || null];
  const where = [
    "s.company_id = $3", "s.status = 'completed'",
    "($1::date IS NULL OR (s.created_at AT TIME ZONE c.timezone)::date >= $1::date)",
    "($2::date IS NULL OR (s.created_at AT TIME ZONE c.timezone)::date <= $2::date)",
  ];
  params.push(null);
  let next = 4;
  if (storeIds.length) { where.push(`s.store_id = ANY($${next}::uuid[])`); params.push(storeIds); next += 1; }
  if (userIds.length) { where.push(`s.user_id = ANY($${next}::uuid[])`); params.push(userIds); next += 1; }
  const filterClauses = [];
  for (const filter of definition.filters) {
    if (!filter || filter.field === "date" || !["store", "user", "product"].includes(filter.field)) continue;
    const values = (Array.isArray(filter.value) ? filter.value : [filter.value]).filter(Boolean).map(String);
    if (!values.length) continue;
    const column = filter.field === "store" ? "s.store_id" : filter.field === "user" ? "s.user_id" : "s.product_id";
    filterClauses.push(`${column} ${filter.operator === "in" ? `= ANY($${next}::uuid[])` : `= $${next}`}`);
    params.push(filter.operator === "in" ? values : values[0]); next += 1;
  }
  if (filterClauses.length) {
    const mode = String(definition.filterLogic || "all").toLowerCase();
    const logic = mode === "all" || mode === "any" ? filterClauses.join(mode === "any" ? " OR " : " AND ") : compileFilterLogic(definition.filterLogic, filterClauses);
    where.push(`(${logic})`);
  }
  const fields = definition.fields.map((key) => CUSTOM_FIELD_MAP.get(key));
  const select = fields.map((field) => `${field.sql} AS "${field.key}"`);
  const explicitGroups = [...new Set([...(definition.rowGroups || definition.groupBy || []), ...(definition.columnGroups || [])])].map((key) => CUSTOM_FIELD_MAP.get(key).sql);
  const groupByExprs = new Set(explicitGroups);
  for (const field of fields) if (field.groupable && !field.aggregate && !groupByExprs.has(field.sql)) groupByExprs.add(field.sql);
  const groups = [...groupByExprs];
  const order = (definition.sort.length ? definition.sort : [{ field: (definition.rowGroups || definition.groupBy || [])[0] || definition.fields[0], direction: "desc" }])
    .map((item) => `"${item.field}" ${item.direction === "asc" ? "ASC" : "DESC"}`).join(", ");
  const sql = `SELECT ${select.join(", ")} FROM sale_ledger s
    INNER JOIN companies c ON c.id=s.company_id
    INNER JOIN products p ON p.id=s.product_id
    LEFT JOIN categories pc ON pc.id=p.category_id
    LEFT JOIN sale_ledger h ON h.transaction_id=s.transaction_id AND h.source_record_type='SALE_HEADER'
    LEFT JOIN users u ON u.id=s.user_id
    INNER JOIN stores st ON st.id=s.store_id
    WHERE s.source_record_type='SALE_LINE' AND ${where.join(" AND ")}
    ${groups.length ? `GROUP BY ${groups.join(", ")}` : ""}
    ORDER BY ${order} LIMIT ${Math.min(Math.max(Number(definition.rowLimit || 1000),1),1000)}`;
  return { sql, params };
}
