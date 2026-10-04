import http from "node:http";
import pg from "pg";
import ExcelJS from "exceljs";

const DATABASE_URL = process.env.DATABASE_URL;
const EXPORT_TOKEN = process.env.EXPORT_TOKEN;
const PORT = Number(process.env.PORT || 10000);

if (!DATABASE_URL) throw new Error("DATABASE_URL is required");
if (!EXPORT_TOKEN) throw new Error("EXPORT_TOKEN is required");

const { Pool } = pg;
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

function qident(value) {
  return '"' + String(value).replaceAll('"', '""') + '"';
}

function safeSheetName(base, used) {
  let name = String(base)
    .replace(/[\\/*?:\[\]]/g, "_")
    .slice(0, 31) || "Sheet";
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

async function buildWorkbook() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const tablesResult = await client.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
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

    const usedSheets = new Set(["summary"]);
    for (const { table_schema, table_name } of tablesResult.rows) {
      const fullName = `${qident(table_schema)}.${qident(table_name)}`;
      const result = await client.query(`SELECT * FROM ${fullName}`);
      const sheetName = safeSheetName(
        table_schema === "public" ? table_name : `${table_schema}_${table_name}`,
        usedSheets
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
        schema: table_schema,
        table: table_name,
        rows: result.rowCount,
        sheet: sheetName,
      });
    }

    await client.query("ROLLBACK");
    return wb.xlsx.writeBuffer();
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/health") {
      res.writeHead(200, { "content-type": "text/plain" });
      return res.end("ok");
    }

    if (url.pathname !== "/export") {
      res.writeHead(404, { "content-type": "text/plain" });
      return res.end("Not found");
    }

    if (url.searchParams.get("token") !== EXPORT_TOKEN) {
      res.writeHead(401, { "content-type": "text/plain" });
      return res.end("Unauthorized");
    }

    const buffer = await buildWorkbook();
    res.writeHead(200, {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="OneEngine_All_SQL_Data.xlsx"',
      "content-length": String(buffer.byteLength),
      "cache-control": "no-store",
    });
    res.end(Buffer.from(buffer));
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("Export failed");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`temporary export server listening on ${PORT}`);
});
