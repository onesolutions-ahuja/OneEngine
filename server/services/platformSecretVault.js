import crypto from "node:crypto";

function encryptionKey() {
  const secret = process.env.PLATFORM_SECRET || process.env.ONLINE_PLATFORMS_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("A platform encryption secret is required");
  return crypto.createHash("sha256").update(String(secret)).digest();
}

export function encryptSecret(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value).trim(), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(value) {
  if (typeof value !== "string" || !value.startsWith("enc:v1:")) return value || null;
  const [, , ivB64, tagB64, dataB64] = value.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
