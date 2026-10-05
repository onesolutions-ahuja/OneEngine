/**
 * Preview-only match of canonical feed rows against the company's products.
 * EAN first, then supplierCode-as-SKU. Never creates anything.
 *
 * Each match returns only neutral match/proposal data. Follow-through is selected by metadata/workflows, never by this adapter.
 */
import { gtinIdentity } from "./supplierFeedAdapter.js";

function text(value) {
  if (value === null || value === undefined) return null;
  const out = String(value).trim();
  return out ? out : null;
}

function normKey(value) {
  if (value === null || value === undefined) return null;
  const out = String(value).trim().toLowerCase();
  return out ? out : null;
}

export function matchSupplierFeed(canonicalRows, { products, companyId } = {}) {
  const wanted = normKey(companyId);
  const byEan = new Map();
  const bySku = new Map();
  for (const p of Array.isArray(products) ? products : []) {
    if (!p || typeof p !== "object") continue;
    if (wanted && p.company_id !== undefined && p.company_id !== null) {
      if (normKey(p.company_id) !== wanted) continue;
    }
    const ean = text(p.barcode ?? p.ean);
    if (ean) {
      for (const key of [ean, gtinIdentity(ean)]) {
        if (!byEan.has(key)) byEan.set(key, []);
        if (!byEan.get(key).includes(p)) byEan.get(key).push(p);
      }
    }
    const sku = text(p.sku);
    if (sku) {
      const key = sku.toLowerCase();
      if (!bySku.has(key)) bySku.set(key, []);
      bySku.get(key).push(p);
    }
  }
  const matches = [];
  const errors = [];
  for (const feedRow of Array.isArray(canonicalRows) ? canonicalRows : []) {
    let candidates = [];
    let via = null;
    if (feedRow.ean) {
      const hits = byEan.get(feedRow.ean) || byEan.get(gtinIdentity(feedRow.ean)) || [];
      if (hits.length) {
        candidates = hits;
        via = "ean";
      }
    }
    if (!candidates.length && feedRow.supplierCode) {
      const hits = bySku.get(feedRow.supplierCode.trim().toLowerCase()) || [];
      if (hits.length) {
        candidates = hits;
        via = "sku";
      }
    }
    const rowNo = feedRow.row ?? null;
    if (candidates.length > 1) {
      matches.push({
        row: rowNo, status: "ambiguous", productId: null,
        productName: feedRow.name, resolvedVia: null,
        productPreview: toProductPreview(feedRow),
      });
      errors.push({ row: rowNo, errors: [`Ambiguous match: feed row matches ${candidates.length} products.`] });
      continue;
    }
    if (candidates.length === 1) {
      const product = candidates[0];
      matches.push({
        row: rowNo, status: "matched", productId: product.id ?? null,
        productName: product.name ?? feedRow.name, resolvedVia: via,
        productPreview: null,
      });
      continue;
    }
    matches.push({
      row: rowNo, status: "no_match", productId: null,
      productName: feedRow.name, resolvedVia: null,
      productPreview: toProductPreview(feedRow),
    });
  }
  return { matches, errors };
}

function toProductPreview(feedRow) {
  return {
    name: feedRow.name,
    barcode: feedRow.ean,
    description: feedRow.supplierRef ? `Supplier ref: ${feedRow.supplierRef}` : null,
  };
}


export default { matchSupplierFeed, gtinIdentity };
