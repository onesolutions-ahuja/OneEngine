/**
 * Legacy compatibility tombstone.
 *
 * The hardcoded Sales report engine was removed from active runtime. Reports
 * must resolve object, field, relationship, filter and aggregation behaviour
 * from platform metadata/report types through reportableSources.js.
 *
 * This file intentionally exports no business report implementation. It remains
 * only to make accidental legacy imports fail loudly during development rather
 * than silently restoring hardcoded Sales behaviour.
 */

const removed = () => {
  throw new Error("Legacy Sales report definitions were removed; use metadata-backed report types");
};

export const CUSTOM_REPORT_FIELDS = Object.freeze([]);
export const CUSTOM_DATE_FILTERS = Object.freeze([]);
export const buildCustomSalesQuery = removed;
export const customDateRange = removed;
export const validateCustomReportDefinition = removed;
