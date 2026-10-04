/*
 * T10R - Wastage & Breakage reason helpers (shared server + tests).
 *
 * No new ledger, no new table, no new permission: decreases keep writing the
 * SAME inventory_movements row (ADJUSTMENT_OUT) via the SAME
 * createInventoryMovement path. This module only classifies the free-text
 * `reason` column into the canonical buckets the report filters on:
 * Wastage / Breakage / Other. Legacy rows (any other reason text) read as
 * "Other" so existing history keeps working untouched.
 */

export const ADJUSTMENT_REASONS = ["Wastage", "Breakage", "Other"];

export default { ADJUSTMENT_REASONS };
