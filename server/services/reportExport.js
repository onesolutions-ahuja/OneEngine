import ExcelJS from "exceljs";

function safeSheetName(value) {
  return String(value || "Report").replace(/[\\/*?:[\]]/g, " ").slice(0, 31) || "Report";
}

function csvCell(value) {
  if (value == null) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildDetailsCsv({ columns = [], rows = [] }) {
  const keys = columns.map((column) => typeof column === "string" ? column : column.key);
  const labels = columns.map((column) => typeof column === "string" ? column : column.label || column.key);
  return [
    labels.map(csvCell).join(","),
    ...rows.map((row) => keys.map((key) => csvCell(row?.[key])).join(",")),
  ].join("\r\n");
}

export async function buildFormattedXlsx({ report = {}, columns = [], rows = [], totals = {}, filters = [], groups = [], rowGroups = [], columnGroups = [] }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OneEngine";
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet(safeSheetName(report.name || "Report"), { views: [{ state: "frozen", ySplit: 5 }] });
  worksheet.mergeCells("A1:F1");
  worksheet.getCell("A1").value = report.name || "Report";
  worksheet.getCell("A1").font = { bold: true, size: 16 };
  if (report.description) { worksheet.mergeCells("A2:F2"); worksheet.getCell("A2").value = report.description; }
  worksheet.getCell("A3").value = "Format";
  worksheet.getCell("B3").value = report.format || "tabular";
  worksheet.getCell("D3").value = "Generated";
  worksheet.getCell("E3").value = new Date();
  const filterText = (filters || []).map((filter, index) => `${index + 1}. ${filter.field || ""} ${filter.operator || ""} ${Array.isArray(filter.value) ? filter.value.join(", ") : filter.value ?? ""}`.trim()).join(" | ");
  worksheet.mergeCells("A4:F4");
  worksheet.getCell("A4").value = filterText ? `Filters: ${filterText}` : "Filters: None";
  const keys = columns.map((column) => typeof column === "string" ? column : column.key);
  const labels = columns.map((column) => typeof column === "string" ? column : column.label || column.key);
  const headerRow = worksheet.addRow(labels); headerRow.font = { bold: true };
  for (const row of rows || []) worksheet.addRow(keys.map((key) => row?.[key] ?? null));
  if (totals && Object.keys(totals).length) { worksheet.addRow([]); const totalRow = worksheet.addRow(keys.map((key, index) => index === 0 ? "Grand Total" : totals[key] ?? null)); totalRow.font = { bold: true }; }
  worksheet.columns.forEach((column, index) => { let max = labels[index]?.length || 10; column.eachCell({ includeEmpty: true }, (cell) => { max = Math.max(max, String(cell.value ?? "").length); }); column.width = Math.min(Math.max(max + 2, 10), 40); });
  if (groups?.length || rowGroups?.length || columnGroups?.length) { const metadata = workbook.addWorksheet("Report Structure"); metadata.addRow(["Type", "Group", "Value", "Depth"]); for (const group of groups || []) metadata.addRow(["Summary", group.field || group.__groupField || "", group.value ?? group.__groupValue ?? "", group.depth ?? group.__depth ?? ""]); for (const [index, field] of (rowGroups || []).entries()) metadata.addRow(["Matrix row", field, "", index]); for (const [index, field] of (columnGroups || []).entries()) metadata.addRow(["Matrix column", field, "", index]); }
  return workbook.xlsx.writeBuffer();
}
