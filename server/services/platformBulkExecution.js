export async function executeBulk({
  items = [],
  concurrency = 4,
  keyForItem = (_item, index) => String(index),
  handler,
  onDuplicate = null,
}) {
  if (!Array.isArray(items)) throw new Error("Bulk items must be an array");
  if (typeof handler !== "function") throw new Error("Bulk handler is required");

  const width = Math.min(Math.max(Number(concurrency) || 1, 1), 20);
  const results = new Array(items.length);
  const claimed = new Set();
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;

      const item = items[index];
      const key = String(keyForItem(item, index) ?? index);
      if (claimed.has(key)) {
        results[index] = typeof onDuplicate === "function"
          ? await onDuplicate(item, index, key)
          : { status: "skipped", duplicate: true, key };
        continue;
      }
      claimed.add(key);

      try {
        results[index] = await handler(item, index, key);
      } catch (error) {
        results[index] = {
          status: "failed",
          item,
          error: {
            message: String(error?.message || error).slice(0, 2000),
            code: error?.code || null,
            status: error?.status || null,
          },
        };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(width, Math.max(items.length, 1)) }, () => worker()));
  return results;
}
