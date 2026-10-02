const HISTORICAL_OPERATORS = new Set(["equals","not_equals","gt","gte","lt","lte"]);

function endOfSnapshot(dateValue) {
  const value = String(dateValue || "").slice(0, 10);
  const date = new Date(`${value}T23:59:59.999Z`);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid historical snapshot date");
  return date;
}

export function historicalRetentionStart(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  start.setUTCMonth(start.getUTCMonth() - 3);
  return start;
}

export function validateHistoricalTrendForObject(trend = {}, object = {}, fields = []) {
  if (trend?.enabled !== true) return { enabled: false, snapshotDates: [], historicalFilters: [], trackedFields: [] };
  const configured = object?.config?.historicalTrending;
  if (configured?.enabled !== true) throw new Error("Historical Trending is not enabled for this object");
  const configuredFields = [...new Set((Array.isArray(configured.fields) ? configured.fields : []).map(String))].slice(0, 8);
  const readable = new Map((fields || []).filter((field) => field.readable !== false).map((field) => [String(field.api_name), field]));
  const trackedFields = configuredFields.filter((key) => readable.has(key));
  if (!trackedFields.length) throw new Error("No readable Historical Trending fields are configured for this object");
  const snapshotDates = [...new Set((Array.isArray(trend.snapshotDates) ? trend.snapshotDates : []).map((value) => String(value).slice(0,10)).filter(Boolean))].slice(0,5);
  if (!snapshotDates.length) throw new Error("Historical Trending requires at least one snapshot date");
  const retentionStart = historicalRetentionStart();
  const enabledAt = configured?.enabledAt ? new Date(configured.enabledAt) : null;
  const todayEnd = endOfSnapshot(new Date().toISOString().slice(0,10));
  for (const value of snapshotDates) {
    const snapshot = endOfSnapshot(value);
    if (enabledAt && snapshot < enabledAt) throw new Error("Historical snapshot predates Historical Trending enablement");
    if (snapshot < retentionStart) throw new Error("Historical snapshot is outside the retained historical window");
    if (snapshot > todayEnd) throw new Error("Historical snapshot cannot be in the future");
  }
  const historicalFilters = (Array.isArray(trend.historicalFilters) ? trend.historicalFilters : []).slice(0,4).map((filter) => {
    const field = String(filter?.field || "");
    const operator = String(filter?.operator || "equals");
    if (!trackedFields.includes(field)) throw new Error(`Historical filter field ${field} is not configured for trending`);
    if (!HISTORICAL_OPERATORS.has(operator)) throw new Error("Invalid historical filter operator");
    const rawSnapshotMode = String(filter?.snapshotMode || "").toUpperCase();
    const snapshotMode = rawSnapshotMode === "ANY" || rawSnapshotMode === "ALL" ? "ANY" : "SPECIFIC";
    const snapshotDate = filter?.snapshotDate ? String(filter.snapshotDate).slice(0,10) : snapshotDates[0];
    if (snapshotMode === "SPECIFIC" && !snapshotDates.includes(snapshotDate)) throw new Error("Specific historical filter snapshot must be one of the selected snapshot dates");
    return { field, operator, value: filter?.value ?? null, snapshotMode, snapshotDate };
  });
  return { enabled: true, snapshotDates, historicalFilters, trackedFields, enabledAt: configured?.enabledAt || null };
}

function compare(operator, actual, expected) {
  if (operator === "equals") return String(actual ?? "") === String(expected ?? "");
  if (operator === "not_equals") return String(actual ?? "") !== String(expected ?? "");
  const left = Number(actual), right = Number(expected);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  if (operator === "gt") return left > right;
  if (operator === "gte") return left >= right;
  if (operator === "lt") return left < right;
  if (operator === "lte") return left <= right;
  return false;
}

export async function reconstructHistoricalRows({ db, companyId, objectId, currentRows = [], trend }) {
  if (!trend?.enabled || !currentRows.length) return currentRows;
  const recordIds = [...new Set(currentRows.map((row) => row.__recordId).filter(Boolean).map(String))];
  if (!recordIds.length) throw new Error("Historical Trending requires record identifiers");
  const history = await db(
    `SELECT record_id,field_api_name,old_value,new_value,action,created_at
       FROM platform_record_history
      WHERE company_id=$1 AND object_id=$2 AND record_id=ANY($3::uuid[]) AND field_api_name=ANY($4::text[])
        AND created_at >= $5
      ORDER BY record_id,field_api_name,created_at ASC`,
    [companyId, objectId, recordIds, trend.trackedFields, historicalRetentionStart()]
  );
  const changesByRecordField = new Map();
  const createdAtByRecord = new Map();
  for (const change of history.rows || []) {
    const recordId = String(change.record_id);
    if (change.action === "create") {
      const at = new Date(change.created_at);
      const previous = createdAtByRecord.get(recordId);
      if (!previous || at < previous) createdAtByRecord.set(recordId, at);
    }
    const key = `${recordId}::${change.field_api_name}`;
    if (!changesByRecordField.has(key)) changesByRecordField.set(key, []);
    changesByRecordField.get(key).push(change);
  }
  const expanded = [];
  for (const row of currentRows) {
    const recordId = String(row.__recordId || "");
    for (const snapshotDate of trend.snapshotDates) {
      const cutoff = endOfSnapshot(snapshotDate);
      const createdAt = createdAtByRecord.get(recordId);
      if (createdAt && createdAt > cutoff) continue;
      const next = { ...row, __snapshotDate: snapshotDate };
      let established = false;
      for (const field of trend.trackedFields) {
        const changes = changesByRecordField.get(`${recordId}::${field}`) || [];
        const atOrBefore = changes.filter((change) => new Date(change.created_at) <= cutoff);
        const lastAtOrBefore = atOrBefore.length ? atOrBefore[atOrBefore.length - 1] : null;
        const firstAfter = changes.find((change) => new Date(change.created_at) > cutoff);
        const value = lastAtOrBefore ? lastAtOrBefore.new_value : firstAfter ? firstAfter.old_value : undefined;
        if (value !== undefined) established = true;
        next[`${field}__historical`] = value === undefined ? null : value;
      }
      if (established) expanded.push(next);
    }
  }
  if (!trend.historicalFilters.length) return expanded;
  const rowsByRecord = new Map();
  for (const row of expanded) {
    const id = String(row.__recordId);
    if (!rowsByRecord.has(id)) rowsByRecord.set(id, []);
    rowsByRecord.get(id).push(row);
  }
  const keep = new Set();
  for (const [recordId, rows] of rowsByRecord) {
    const matched = trend.historicalFilters.every((filter) => {
      const candidates = filter.snapshotMode === "SPECIFIC" ? rows.filter((row) => row.__snapshotDate === filter.snapshotDate) : rows;
      if (!candidates.length) return false;
      const results = candidates.map((row) => compare(filter.operator, row[`${filter.field}__historical`], filter.value));
      return filter.snapshotMode === "ANY" ? results.every(Boolean) : results.some(Boolean);
    });
    if (matched) keep.add(recordId);
  }
  return expanded.filter((row) => keep.has(String(row.__recordId)));
}
