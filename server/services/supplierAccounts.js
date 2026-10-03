export function invoiceStatus(total, paid) {
  const balance = Math.max(0, Number(total) - Number(paid));
  if (balance <= 0.005) return "PAID";
  if (Number(paid) > 0) return "PARTIALLY_PAID";
  return "OPEN";
}

