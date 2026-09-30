import { roundCurrency } from "../src/utils/saleTotals.js";

const money = (value) => roundCurrency(Number(value) || 0);
const quantity = (value) => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
const cents = (value) => Math.round((Number(value) + Number.EPSILON) * 100);

export function calculateHospitalityServiceCharge({ subtotal, type, value, taxable = false, vatEnabled = true, vatRate = 0 }) {
  const normalizedType = String(type || "").toUpperCase();
  const base = Number(subtotal);
  const amountValue = Number(value);
  if (!Number.isFinite(base) || base < 0 || !Number.isFinite(amountValue) || amountValue < 0) {
    throw new Error("Service charge values must be non-negative numbers");
  }
  if (!["PERCENTAGE", "FIXED"].includes(normalizedType)) throw new Error("Service charge type must be PERCENTAGE or FIXED");
  if (normalizedType === "PERCENTAGE" && amountValue > 100) throw new Error("Service charge percentage cannot exceed 100");
  const amount = money(normalizedType === "PERCENTAGE" ? base * amountValue / 100 : amountValue);
  const rate = Number(vatRate);
  if (taxable && vatEnabled && (!Number.isFinite(rate) || rate < 0 || rate > 100)) throw new Error("Invalid service charge VAT rate");
  const tax = taxable && vatEnabled ? money(amount * rate / 100) : 0;
  return { type: normalizedType, value: amountValue, amount, tax };
}

function allocateLine(line, movedQuantity) {
  const originalQuantity = quantity(line.quantity);
  const moved = quantity(movedQuantity);
  const ratio = moved / originalQuantity;
  const movedLine = { ...line, quantity: moved };
  const remainingLine = { ...line, quantity: quantity(originalQuantity - moved) };
  for (const key of ["discount", "tax", "total"]) {
    const total = money(line[key]);
    movedLine[key] = money(total * ratio);
    remainingLine[key] = money(total - movedLine[key]);
  }
  return { moved: movedLine, remaining: remainingLine };
}

export function splitHospitalityLines(items, { mode, selections = [], shares = 2 } = {}) {
  if (!Array.isArray(items) || items.length === 0) throw new Error("The bill has no items to split");
  if (mode === "EQUAL") {
    const count = Number(shares);
    if (!Number.isInteger(count) || count < 2 || count > 20) throw new Error("Equal split must have between 2 and 20 shares");
    const result = Array.from({ length: count }, () => []);
    for (const item of items) {
      const baseQuantity = quantity(Math.floor((quantity(item.quantity) / count) * 1000) / 1000);
      let remaining = { ...item };
      for (let index = 0; index < count - 1; index += 1) {
        const partQuantity = Math.min(baseQuantity, quantity(remaining.quantity));
        if (partQuantity <= 0) continue;
        const allocation = allocateLine(remaining, partQuantity);
        result[index].push(allocation.moved);
        remaining = allocation.remaining;
      }
      if (Number(remaining.quantity) > 0) result[count - 1].push(remaining);
    }
    return result;
  }
  if (!["ITEMS", "QUANTITY"].includes(mode)) throw new Error("Split mode must be ITEMS, QUANTITY or EQUAL");
  if (!Array.isArray(selections) || selections.length === 0) throw new Error("Select bill items to split");
  const byId = new Map(items.map((item) => [String(item.id), item]));
  const moves = new Map();
  for (const selection of selections) {
    const id = String(selection.itemId || "");
    const item = byId.get(id);
    const selectedQuantity = mode === "ITEMS" ? Number(item?.quantity) : Number(selection.quantity);
    if (!item || !Number.isFinite(selectedQuantity) || selectedQuantity <= 0 || selectedQuantity > Number(item.quantity)) {
      throw new Error("Selected item quantity is invalid");
    }
    moves.set(id, quantity((moves.get(id) || 0) + selectedQuantity));
    if (moves.get(id) > Number(item.quantity)) throw new Error("Selected quantity exceeds the bill quantity");
  }
  const remaining = [];
  const moved = [];
  for (const item of items) {
    const movedQuantity = moves.get(String(item.id)) || 0;
    if (!movedQuantity) { remaining.push({ ...item }); continue; }
    const allocation = allocateLine(item, movedQuantity);
    moved.push(allocation.moved);
    if (allocation.remaining.quantity > 0) remaining.push(allocation.remaining);
  }
  return [remaining, moved];
}

export function updateHospitalityItems(items, { lineIds, action, course, sequence, at = new Date().toISOString() } = {}) {
  if (!Array.isArray(items) || !Array.isArray(lineIds) || !lineIds.length) throw new Error("Select at least one order item");
  const selected = new Set(lineIds.map(String));
  const found = new Set();
  const normalizedAction = String(action || "").toUpperCase();
  if (!["HOLD", "FIRE", "COURSE"].includes(normalizedAction)) throw new Error("Invalid hospitality item action");
  if (normalizedAction === "COURSE" && course != null && (typeof course !== "string" || course.trim().length > 80)) throw new Error("Course must be 80 characters or fewer");
  if (sequence != null && (!Number.isInteger(Number(sequence)) || Number(sequence) < 1 || Number(sequence) > 99)) throw new Error("Course sequence must be between 1 and 99");
  const updated = items.map((item) => {
    const id = String(item.line_id || item.lineId || "");
    if (!selected.has(id)) return item;
    found.add(id);
    if (normalizedAction === "HOLD") {
      if (item.fired_at) throw new Error("An item already fired to the kitchen cannot be held");
      return { ...item, held: true, held_at: item.held_at || at };
    }
    if (normalizedAction === "FIRE") {
      if (!item.held || item.fired_at) throw new Error("Only held, unfired items can be fired");
      return { ...item, held: false, fired_at: at };
    }
    return { ...item, course: course == null ? null : course.trim() || null, course_sequence: sequence == null ? item.course_sequence ?? null : Number(sequence) };
  });
  if (found.size !== selected.size) throw new Error("One or more selected order items were not found");
  return updated;
}

export function validateHospitalityPayment({ amount, balance, tip = 0 }) {
  const paymentCents = cents(amount);
  const balanceCents = cents(balance);
  const tipCents = cents(tip);
  if (!Number.isFinite(Number(amount)) || paymentCents <= 0) throw new Error("Payment amount must be greater than zero");
  if (!Number.isFinite(Number(balance)) || balanceCents < 0 || paymentCents > balanceCents) throw new Error("Payment cannot exceed the remaining balance");
  if (!Number.isFinite(Number(tip)) || tipCents < 0) throw new Error("Tip must be zero or greater");
  return { amount: paymentCents / 100, tip: tipCents / 100, remaining: (balanceCents - paymentCents) / 100 };
}
