function roundCurrency(v) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}
export function resolveEffectivePrice({ cataloguePrice, priceOverride, canOverridePrice }) {
  const cp = Number(cataloguePrice) || 0;
  const po = Number(priceOverride) || 0;
  if (canOverridePrice && po > 0) return { price: roundCurrency(po), overridden: true, originalPrice: cp };
  return { price: cp, overridden: false, originalPrice: cp };
}
const lineDiscount = (item) => {
  const type = item.discountType;
  if (type !== "percent" && type !== "fixed") return 0;
  const val = Number(item.discountValue) || 0;
  if (!val) return 0;
  const gross = Number(item.price || 0) * item.quantity;
  const amt = type === "percent" ? Math.min(gross, gross * (val / 100)) : Math.min(gross, Math.max(0, val));
  return roundCurrency(amt);
};
export { roundCurrency };
export function lineTaxFor(line, { vatEnabled = true, vatRate = 0 } = {}) {
  if (!vatEnabled || line.vatApplicable === false) return 0;
  const ownRate = line.vatRate == null ? null : Number(line.vatRate) / 100;
  const rate = ownRate !== null && Number.isFinite(ownRate) ? ownRate : Number(vatRate) || 0;
  return roundCurrency((Number(line.price) || 0) * (Number(line.quantity) || 0) * rate);
}
export function computeBasketTotals(basket, { vatEnabled = true, vatRate = 0, discountType = null, discountValue = 0 } = {}) {
  const lineDiscounts = basket.map((item) => ({ line: item, lineDiscount: lineDiscount(item) }));
  const grossSubtotal = basket.reduce((total, item) => total + Number(item.price || 0) * item.quantity, 0);
  const totalLineDiscount = lineDiscounts.reduce((sum, ld) => sum + ld.lineDiscount, 0);
  const netSubtotal = Math.max(0, grossSubtotal - totalLineDiscount);
  const orderDiscountAmount = discountType === "percent"
    ? Math.min(netSubtotal, netSubtotal * (Number(discountValue) / 100))
    : Math.min(netSubtotal, Math.max(0, Number(discountValue) || 0));
  const discountAmount = roundCurrency(totalLineDiscount + orderDiscountAmount);
  const subtotal = Math.max(0, grossSubtotal - discountAmount);
  const vatApplicableGross = basket.reduce((sum, item) => item.vatApplicable === false ? sum : sum + Number(item.price || 0) * item.quantity, 0);
  const vat = lineDiscounts.reduce((sum, { line, lineDiscount }) => {
    if (!vatEnabled || line.vatApplicable === false) return sum;
    const lineGross = Number(line.price || 0) * line.quantity;
    const lineNet = Math.max(0, lineGross - lineDiscount);
    const orderShare = netSubtotal > 0 ? lineNet / netSubtotal : lineNet / vatApplicableGross;
    const discountedLine = Math.max(0, lineNet - orderDiscountAmount * orderShare);
    return sum + lineTaxFor({ ...line, price: discountedLine, quantity: 1 }, { vatEnabled, vatRate });
  }, 0);
  const roundedVat = roundCurrency(vat);
  return {
    grossSubtotal: roundCurrency(grossSubtotal),
    lineDiscounts: lineDiscounts.map((ld, i) => ({ index: i, discountType: ld.line.discountType || null, discountValue: ld.line.discountValue || 0, amount: ld.lineDiscount })),
    orderDiscount: roundCurrency(orderDiscountAmount),
    discountAmount,
    subtotal: roundCurrency(subtotal),
    vat: roundedVat,
    total: roundCurrency(subtotal + roundedVat),
  };
}
