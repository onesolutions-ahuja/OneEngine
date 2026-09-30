import { randomUUID } from "node:crypto";

const HOSPITALITY_SESSION_TRANSITIONS = Object.freeze({
  OPEN: ["ORDERING", "CANCELLED"],
  ORDERING: ["SERVED", "CANCELLED"],
  SERVED: ["ORDERING", "CHECK_REQUESTED", "COMPLETED"],
  CHECK_REQUESTED: ["SERVED", "COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
});

export function validateHospitalitySessionTransition(currentStatus, nextStatus) {
  const current = String(currentStatus || "").toUpperCase();
  const next = String(nextStatus || "").toUpperCase();
  if (!Object.hasOwn(HOSPITALITY_SESSION_TRANSITIONS, current) || !HOSPITALITY_SESSION_TRANSITIONS[current].includes(next)) {
    throw new Error(`Invalid hospitality session transition: ${current || "UNKNOWN"} to ${next || "UNKNOWN"}`);
  }
  return next;
}

export function buildKitchenPrintPayload(ticket = {}) {
  const items = Array.isArray(ticket.items) ? ticket.items : [];
  return {
    title: "KITCHEN ORDER",
    orderNumber: ticket.order_number || "Order",
    tableNumber: ticket.table_number || null,
    station: ticket.station || null,
    notes: ticket.notes || null,
    createdAt: ticket.created_at || new Date().toISOString(),
    items: items.map((item) => ({
      name: item.name || item.product_name || "Item",
      quantity: Number(item.quantity || 1),
      notes: item.notes || null,
      course: item.course || null,
      courseSequence: item.course_sequence || null,
    })),
  };
}

export function validateQrOrderItems(items) {
  if (!Array.isArray(items) || items.length === 0) throw new Error("At least one item is required");
  return items.map((item) => {
    const quantity = Number(item.quantity || 0);
    if (!item.productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error("Invalid order item");
    return {
      productId: String(item.productId),
      quantity,
      notes: item.notes ? String(item.notes).slice(0, 500) : null,
      lineId: randomUUID(),
      course: null,
      courseSequence: null,
      held: false,
    };
  });
}
