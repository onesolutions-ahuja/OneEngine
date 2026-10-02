export const PLATFORM_FIELD_TYPES = Object.freeze([
  "text",
  "long_text",
  "rich_text",
  "url",
  "time",
  "percent",
  "auto_number",
  "address",
  "location",
  "number",
  "decimal",
  "currency",
  "boolean",
  "date",
  "datetime",
  "email",
  "phone",
  "select",
  "picklist",
  "multiselect",
  "lookup",
  "formula",
  "rollup",
  "json",
]);

export const PLATFORM_FIELD_TYPE_SQL = PLATFORM_FIELD_TYPES
  .map((type) => `'${type}'`)
  .join(",");

export const PLATFORM_FIELD_TYPE_SET = new Set(PLATFORM_FIELD_TYPES);
