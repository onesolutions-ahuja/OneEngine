import crypto from "crypto";

/*
 * Online platform configuration storage (Uber Eats / Deliveroo)
 *
 * Platform credentials are stored per company in the existing `integrations`
 * table (provider = 'uber' | 'deliveroo'). Secret fields are encrypted with
 * AES-256-GCM before they touch the database and are never returned to the
 * frontend - only a "configured" flag and a masked hint.
 *
 * The platform services receive a flattened, decrypted runtime config:
 *   { platform, enabled, environment, client_id, client_secret,
 *     store_location_id, api_key, webhook_secret, notes }
 * so that when the real APIs are wired up they can read credentials from
 * here instead of the stubs.
 */

const SECRET_FIELDS = ["client_secret", "api_key", "webhook_secret"];
const PLAIN_FIELDS = ["environment", "client_id", "store_location_id", "store_id", "brand_id", "order_acceptance", "notes"];
// Boolean settings stored as-is (default false).
const BOOLEAN_FIELDS = ["require_otp_on_completion"];

export function sanitizeUberStoreMappings(value) {
  if (!Array.isArray(value)) {
    const error = new Error("Uber store mappings must be an array");
    error.code = "INVALID_UBER_STORE_MAPPINGS";
    throw error;
  }
  const externalIds = new Set();
  return value.map((mapping) => {
    const uberStoreId = String(mapping?.uber_store_id || "").trim();
    const oneposStoreId = String(mapping?.onepos_store_id || "").trim();
    if (!uberStoreId || !oneposStoreId) {
      const error = new Error("Each Uber store mapping requires uber_store_id and onepos_store_id");
      error.code = "INVALID_UBER_STORE_MAPPINGS";
      throw error;
    }
    if (externalIds.has(uberStoreId)) {
      const error = new Error(`Uber store ${uberStoreId} is mapped more than once`);
      error.code = "INVALID_UBER_STORE_MAPPINGS";
      throw error;
    }
    externalIds.add(uberStoreId);
    return { uber_store_id: uberStoreId, onepos_store_id: oneposStoreId };
  });
}

function encryptionKey() {
  const secret =
    process.env.ONLINE_PLATFORMS_SECRET || process.env.JWT_SECRET;

  return crypto.createHash("sha256").update(String(secret)).digest();
}

export function encryptSecret(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value).trim(), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `enc:v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(value) {
  if (typeof value !== "string" || !value.startsWith("enc:v1:")) {
    return value || null;
  }

  try {
    const [, , ivB64, tagB64, dataB64] = value.split(":");
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch (error) {
    console.error("Decrypt platform secret failed:", error.message);
    return null;
  }
}

