/** Convert user-facing currency amounts to integer cents. */
export function toCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

/** Convert integer cents to a user-facing currency amount. */
export function fromCents(cents) {
  return Math.round(Number(cents) || 0) / 100;
}
