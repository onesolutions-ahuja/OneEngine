const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export function toSafeApiName(label, fallback = "field") {
  const normalized = String(label || "").trim().replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase().slice(0, 100).replace(/_+$/g, "");
  return normalized || fallback;
}

export function isSafeIdentifier(value) {
  return typeof value === "string" && IDENTIFIER.test(value);
}
