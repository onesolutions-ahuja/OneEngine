import {
  applyCrossBlockFormulas,
  joinReportBlocks,
  runAnalytics,
} from "./reportAnalyticsRuntime.js";

/**
 * Execute a normalized report definition using an injected secure datasource
 * executor. The executor is responsible for tenant/store/RBAC/FLS/sharing.
 * This orchestration layer only shapes already-authorized rows.
 */
export async function executeAnalyticsDefinition(definition, executeBase, { preview = false } = {}) {
  if (typeof executeBase !== "function") throw new Error("A report datasource executor is required");

  if (definition.format === "joined") {
    const blocks = [];
    for (const [index, block] of (definition.blocks || []).entries()) {
      const blockDefinition = {
        ...definition,
        ...block,
        format: (block.rowGroups || []).length ? "summary" : "tabular",
        blocks: [],
        commonGroups: [],
        crossBlockFormulas: [],
        buckets: block.buckets || [],
        rowFormulas: block.rowFormulas || [],
        summaryFormulas: block.summaryFormulas || [],
        conditionalFormatting: block.conditionalFormatting || [],
        drillAction: block.drillAction || definition.drillAction || null,
        rowLimit: preview ? Math.min(Number(block.rowLimit || 100), 100) : Number(block.rowLimit || definition.rowLimit || 1000),
      };
      const raw = await executeBase(blockDefinition, { preview, blockIndex: index });
      const shaped = runAnalytics(raw.rows || [], blockDefinition);
      blocks.push({
        key: block.key || `block_${index + 1}`,
        label: block.label || `Block ${index + 1}`,
        definition: blockDefinition,
        rows: raw.rows || [],
        shaped,
        columns: raw.columns || [],
      });
    }

    let joined = joinReportBlocks(blocks, definition);
    joined = applyCrossBlockFormulas(joined, definition.crossBlockFormulas || []);
    return {
      format: "joined",
      columns: joined.rows.length ? Object.keys(joined.rows[0]).filter((key) => !key.startsWith("__")) : [],
      rows: joined.rows,
      commonGroups: joined.commonGroups,
      blocks: blocks.map(({ key, label, columns, shaped }) => ({ key, label, columns, shaped })),
    };
  }

  const raw = await executeBase(definition, { preview });
  const shaped = runAnalytics(raw.rows || [], definition);
  return {
    format: definition.format || "tabular",
    columns: raw.columns || [],
    ...shaped,
  };
}
