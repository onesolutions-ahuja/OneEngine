import express from "express";
import ExcelJS from "exceljs";

function qident(value) {
  return '"' + String(value).replaceAll('"', '""') + '"';
}

function safeSheetName(base, used) {
  let name = String(base).replace(/[\\/*?:\[\]]/g, "_").slice(0, 31) || "Sheet";
  let candidate = name;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = `_${n++}`;
    candidate = name.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function cellValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

export default function createTemporaryDbExportRouter({ pool, env = process.env }) {
  const router = express.Router();

  router.get("/internal/temp-db-export", async (req, res) => {
    const expected = String(env.TEMP_DB_EXPORT_TOKEN || "");
    if (!expected || String(req.query.token || "") !== expected) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      const tables = await client.query(`
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE table_type='BASE TABLE'
          AND table_schema NOT IN ('pg_catalog','information_schema')
        ORDER BY table_schema, table_name
      `);

      const wb = new ExcelJS.Workbook();
      wb.creator = "OneEngine";
      wb.created = new Date();

      const summary = wb.addWorksheet("Summary");
      summary.columns = [
        { header: "Schema", key: "schema", width: 24 },
        { header: "Table", key: "table", width: 36 },
        { header: "Rows", key: "rows", width: 14 },
        { header: "Sheet", key: "sheet", width: 31 },
      ];
      summary.getRow(1).font = { bold: true };
      summary.views = [{ state: "frozen", ySplit: 1 }];
      summary.autoFilter = "A1:D1";

      const used = new Set(["summary"]);
      for (const t of tables.rows) {
        const result = await client.query(
          `SELECT * FROM ${qident(t.table_schema)}.${qident(t.table_name)}`
        );
        const sheetName = safeSheetName(
          t.table_schema === "public" ? t.table_name : `${t.table_schema}_${t.table_name}`,
          used
        );
        const ws = wb.addWorksheet(sheetName);
        const fields = result.fields.map((f) => f.name);
        if (fields.length) {
          ws.columns = fields.map((name) => ({
            header: name,
            key: name,
            width: Math.min(Math.max(String(name).length + 2, 12), 40),
          }));
          ws.getRow(1).font = { bold: true };
          ws.views = [{ state: "frozen", ySplit: 1 }];
          ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: fields.length } };
        }
        for (const row of result.rows) {
          const converted = {};
          for (const name of fields) converted[name] = cellValue(row[name]);
          ws.addRow(converted);
        }
        summary.addRow({
          schema: t.table_schema,
          table: t.table_name,
          rows: result.rowCount,
          sheet: sheetName,
        });
      }

      await client.query("ROLLBACK");
      const buffer = await wb.xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="OneEngine_All_SQL_Data.xlsx"');
      res.setHeader("Cache-Control", "no-store");
      return res.send(Buffer.from(buffer));
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("Temporary DB export failed", error);
      return res.status(500).json({ success: false, message: "Export failed" });
    } finally {
      client.release();
    }
  });

  return router;
}
