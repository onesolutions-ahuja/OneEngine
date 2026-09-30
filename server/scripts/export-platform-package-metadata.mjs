import "dotenv/config";
import pg from "pg";
import { exportPlatformMetadataManifest } from "../services/platformMetadataPromotion.js";

const [companyId, ...objectKeys] = process.argv.slice(2);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exitCode = 1;
} else if (!companyId || !objectKeys.length) {
  console.error("Usage: npm run platform:metadata:export -- <company-id> <object-key> [object-key ...]");
  process.exitCode = 1;
} else {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  try {
    const exported = await exportPlatformMetadataManifest((sql, params) => pool.query(sql, params), { companyId, objectKeys });
    process.stdout.write(`${JSON.stringify(exported, null, 2)}\n`);
  } catch (error) {
    console.error(error.message || "Unable to export Platform metadata.");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}