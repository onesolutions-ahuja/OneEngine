import { apiRequest } from "./api.js";

export async function getIntegrationFieldCatalogue() {
  const response = await apiRequest("/api/integrations/field-catalogue");
  return Array.isArray(response?.data) ? response.data : [];
}

export default { getIntegrationFieldCatalogue };
