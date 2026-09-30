/*
 * Product Master — barcode format validation helpers.
 */
export function gs1ChecksumValid(digits) {
  if (!/^[0-9]+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length - 1; i += 1) {
    const positionFromRight = digits.length - 2 - i;
    sum += Number(digits[i]) * (positionFromRight % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}
function upceAccepted(digits) { return /^[01][0-9]{7}$/.test(digits); }
export function validateBarcode(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return { format: "unknown", valid: false, message: "No barcode" };
  if (/^[0-9]{13}$/.test(value)) return gs1ChecksumValid(value)
    ? { format: "EAN-13", valid: true, message: "EAN-13 (checksum OK)" }
    : { format: "EAN-13", valid: false, message: "EAN-13 check digit is wrong — check the label" };
  if (/^[0-9]{8}$/.test(value)) {
    if (/^[01]/.test(value)) return upceAccepted(value)
      ? { format: "UPC-E", valid: true, message: "UPC-E" }
      : { format: "UPC-E", valid: false, message: "UPC-E must start with 0 or 1" };
    return gs1ChecksumValid(value)
      ? { format: "EAN-8", valid: true, message: "EAN-8 (checksum OK)" }
      : { format: "EAN-8", valid: false, message: "EAN-8 check digit is wrong — check the label" };
  }
  if (/^[0-9]{12}$/.test(value)) return gs1ChecksumValid(value)
    ? { format: "UPC-A", valid: true, message: "UPC-A (checksum OK)" }
    : { format: "UPC-A", valid: false, message: "UPC-A check digit is wrong — check the label" };
  if (/^[0-9]{14}$/.test(value)) return gs1ChecksumValid(value)
    ? { format: "EAN-13", valid: true, message: "GTIN-14 (carton code, checksum OK)" }
    : { format: "EAN-13", valid: false, message: "GTIN-14 check digit is wrong — check the label" };
  if (/^[0-9]{6}$/.test(value)) return { format: "UPC-E", valid: true, message: "UPC-E (6-digit zero-compressed form)" };
  if (/^[\x20-\x7E]{1,48}$/.test(value)) return { format: "CODE128", valid: true, message: "Code 128" };
  return { format: "unknown", valid: false, message: "Not a recognised EAN/UPC/Code-128 barcode" };
}
export function ean13IdentityError(raw) {
  const value = String(raw ?? "").trim();
  if (!/^[0-9]{13}$/.test(value)) return null;
  if (gs1ChecksumValid(value)) return null;
  return "Barcode is a 13-digit EAN but its check digit is invalid — re-scan or enter the number exactly as printed.";
}
