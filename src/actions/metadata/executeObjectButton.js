export function buildRuntimeExecutionQuery({ formFactor = "", appKey = "" } = {}) {
  const query = new URLSearchParams();
  if (formFactor) query.set("formFactor", formFactor);
  if (appKey) query.set("appKey", appKey);
  return query.toString();
}

export async function executeObjectButton({
  request,
  objectKey,
  recordId,
  button,
  formFactor = "",
  appKey = "",
  body = {},
}) {
  if (typeof request !== "function") throw new Error("A request function is required.");
  if (!objectKey) throw new Error("Object metadata is incomplete.");
  if (!recordId) throw new Error("A record is required.");
  if (!button?.button_key) throw new Error("Button metadata is incomplete.");

  const query = buildRuntimeExecutionQuery({ formFactor, appKey });
  const endpoint = `/api/platform/objects/${encodeURIComponent(objectKey)}/records/${encodeURIComponent(recordId)}/buttons/${encodeURIComponent(button.button_key)}/execute${query ? `?${query}` : ""}`;
  const response = await request(endpoint, {
    method: "POST",
    body: JSON.stringify(body || {}),
  });
  if (response?.success === false) throw new Error(response.message || "Unable to execute configured action.");
  return response;
}

export async function executeObjectButtonForRecords(options, recordIds = []) {
  const responses = [];
  for (const recordId of recordIds) {
    responses.push(await executeObjectButton({ ...options, recordId }));
  }
  return responses;
}
