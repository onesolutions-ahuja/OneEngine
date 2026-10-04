import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

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

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

export async function logDatabaseWorkbook(pool) {
  const filePath = path.join(os.tmpdir(), `oneengine-db-export-${Date.now()}.xlsx`);
  const client = await pool.connect();
  let workbook;
  try {
    console.log("DBXLSX|PREPARE");
    await client.query("BEGIN READ ONLY");
    const tables = await client.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_type='BASE TABLE'
        AND table_schema NOT IN ('pg_catalog','information_schema')
      ORDER BY table_schema, table_name
    `);

    workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      filename: filePath,
      useStyles: false,
      useSharedStrings: false,
    });

    const summary = workbook.addWorksheet("Summary");
    summary.columns = [
      { header: "Schema", key: "schema", width: 24 },
      { header: "Table", key: "table", width: 36 },
      { header: "Rows", key: "rows", width: 14 },
      { header: "Sheet", key: "sheet", width: 31 },
    ];

    const used = new Set(["summary"]);
    let tableIndex = 0;

    for (const t of tables.rows) {
      tableIndex += 1;
      const sheetName = safeSheetName(
        t.table_schema === "public" ? t.table_name : `${t.table_schema}_${t.table_name}`,
        used
      );
      const ws = workbook.addWorksheet(sheetName);

      const cols = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema=$1 AND table_name=$2
        ORDER BY ordinal_position
      `, [t.table_schema, t.table_name]);
      const fields = cols.rows.map((r) => r.column_name);

      if (fields.length) {
        ws.columns = fields.map((name) => ({
          header: name,
          key: name,
          width: Math.min(Math.max(String(name).length + 2, 12), 40),
        }));
      }

      const cursor = `dbxlsx_cursor_${tableIndex}`;
      await client.query(`DECLARE ${qident(cursor)} NO SCROLL CURSOR FOR SELECT * FROM ${qident(t.table_schema)}.${qident(t.table_name)}`);
      let rowCount = 0;
      while (true) {
        const batch = await client.query(`FETCH FORWARD 1000 FROM ${qident(cursor)}`);
        if (!batch.rows.length) break;
        for (const row of batch.rows) {
          const out = {};
          for (const name of fields) out[name] = cellValue(row[name]);
          ws.addRow(out).commit();
          rowCount += 1;
        }
      }
      await client.query(`CLOSE ${qident(cursor)}`);
      ws.commit();
      summary.addRow({ schema: t.table_schema, table: t.table_name, rows: rowCount, sheet: sheetName }).commit();
      console.log(`DBXLSX|TABLE|${tableIndex}|${tables.rowCount}|${t.table_schema}|${t.table_name}|${rowCount}`);
    }

    summary.commit();
    await workbook.commit();
    await client.query("ROLLBACK");

    const stat = await fs.stat(filePath);
    const sha256 = await sha256File(filePath);
    const chunkBytes = 3500;
    const total = Math.ceil(stat.size / chunkBytes);
    console.log(`DBXLSX|START|${stat.size}|${sha256}|${total}`);

    let index = 0;
    for await (const chunk of createReadStream(filePath, { highWaterMark: chunkBytes })) {
      index += 1;
      console.log(`DBXLSX|CHUNK|${String(index).padStart(6, "0")}|${String(total).padStart(6, "0")}|${chunk.toString("base64")}`);
    }
    console.log(`DBXLSX|END|${total}|${sha256}`);
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("DBXLSX|ERROR|" + String(error?.stack || error?.message || error));
  } finally {
    client.release();
    try { await fs.unlink(filePath); } catch {}
  }
}
