/**
 * Canonical OneSolutions development/demo seed.
 *
 * Keep startup deliberately small and platform-core only.
 * Business/app data belongs to installable package metadata + flows, not to
 * the server bootstrap. This seeder must never recreate legacy business
 * tables that were intentionally removed from the platform schema.
 */
export async function seedOneSolutionsDemo(pool, seed = {}) {
  const companyConfig = seed.company || {};
  const storeConfig = seed.store || {};
  const companyName = String(companyConfig.name || process.env.INITIAL_COMPANY_NAME || "").trim();
  if (!companyName) return { companyId: null, storeId: null, skipped: true };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let company = (await client.query(
      "SELECT id FROM companies WHERE LOWER(name)=LOWER($1) ORDER BY created_at,id LIMIT 1",
      [companyName]
    )).rows[0];

    if (!company) {
      company = (await client.query(
        `INSERT INTO companies(name,legal_name,email,currency,timezone,active)
         VALUES($1,$2,$3,$4,$5,TRUE)
         RETURNING id`
        , [companyName, companyConfig.legalName || companyName, companyConfig.email || null, companyConfig.currency || "GBP", companyConfig.timezone || "Europe/London"]
      )).rows[0];
    }



    const storeCode = String(storeConfig.code || process.env.INITIAL_STORE_CODE || "").trim();
    let storeId = null;
    if (storeCode) {
      let store = (await client.query(
        "SELECT id FROM stores WHERE company_id=$1 AND code=$2 ORDER BY created_at,id LIMIT 1",
        [company.id, storeCode]
      )).rows[0];
      if (!store) {
        store = (await client.query(
          "INSERT INTO stores(company_id,name,code,city,postcode,active) VALUES($1,$2,$3,$4,$5,TRUE) RETURNING id",
          [company.id, storeConfig.name || storeCode, storeCode, storeConfig.city || null, storeConfig.postcode || null]
        )).rows[0];
      }
      storeId = store.id;
    }

    await client.query("COMMIT");
    return { companyId: company.id, storeId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
