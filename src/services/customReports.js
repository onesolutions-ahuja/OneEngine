import { apiDownload, apiRequest } from "./api.js";

export function getCustomReportMetadata() {
  return apiRequest("/api/reports/custom/metadata");
}

export function getPlatformReportFields(objectId, reportTypeId = null) {
  const query = reportTypeId ? `?reportTypeId=${encodeURIComponent(reportTypeId)}` : "";
  return apiRequest(`/api/reports/custom/platform-objects/${encodeURIComponent(objectId)}/metadata${query}`);
}

export function getCustomReports() {
  return apiRequest("/api/reports/custom");
}

export function getCustomReport(id) {
  return apiRequest(`/api/reports/custom/${encodeURIComponent(id)}`);
}

export function createCustomReport(definition) {
  return apiRequest("/api/reports/custom", {
    method: "POST",
    body: JSON.stringify(definition),
  });
}

export function updateCustomReport(id, definition) {
  return apiRequest(`/api/reports/custom/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(definition),
  });
}

export function runCustomReport(id, definition) {
  return apiRequest(`/api/reports/custom/${encodeURIComponent(id)}/run`, {
    method: "POST",
    body: JSON.stringify(definition || {}),
  });
}

export function previewCustomReport(definition) {
  return apiRequest("/api/reports/custom/preview", {
    method: "POST",
    body: JSON.stringify(definition),
  });
}

export function duplicateCustomReport(id) {
  return apiRequest(`/api/reports/custom/${encodeURIComponent(id)}/duplicate`, {
    method: "POST",
  });
}

export function archiveCustomReport(id) {
  return apiRequest(`/api/reports/custom/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function updateCustomReportUsers(id, userIds) {
  return apiRequest(`/api/reports/custom/${encodeURIComponent(id)}/users`, {
    method: "PUT",
    body: JSON.stringify({ userIds }),
  });
}

export function getReportFolders() { return apiRequest("/api/reports/custom/folders"); }
export function createReportFolder(folder) { return apiRequest("/api/reports/custom/folders", { method:"POST", body:JSON.stringify(folder) }); }
export function updateReportFolder(id, folder) { return apiRequest(`/api/reports/custom/folders/${encodeURIComponent(id)}`, { method:"PUT", body:JSON.stringify(folder) }); }
export function moveReportToFolder(id, folderId) { return apiRequest(`/api/reports/custom/${encodeURIComponent(id)}/folder`, { method:"PUT", body:JSON.stringify({ folderId }) }); }
export function setReportFavourite(id, favourite) { return apiRequest(`/api/reports/custom/${encodeURIComponent(id)}/favourite`, { method:"PUT", body:JSON.stringify({ favourite }) }); }
export function getReportNavigation() { return apiRequest("/api/reports/custom/navigation"); }
export function getReportSubscriptions(id) { return apiRequest(`/api/reports/custom/${encodeURIComponent(id)}/subscriptions`); }
export function createReportSubscription(id, definition) { return apiRequest(`/api/reports/custom/${encodeURIComponent(id)}/subscriptions`, { method:"POST", body:JSON.stringify(definition) }); }
export function deleteReportSubscription(id, subscriptionId) { return apiRequest(`/api/reports/custom/${encodeURIComponent(id)}/subscriptions/${encodeURIComponent(subscriptionId)}`, { method:"DELETE" }); }
export function getReportHistory(id) { return apiRequest(`/api/reports/custom/${encodeURIComponent(id)}/history`); }
export function exportCustomReport(id, { view="DETAILS", format="CSV" } = {}) {
  const query = new URLSearchParams({ view, format });
  return apiDownload(`/api/reports/custom/${encodeURIComponent(id)}/export?${query.toString()}`);
}
