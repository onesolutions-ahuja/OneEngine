import { readFileSync } from "node:fs";

const loaded = JSON.parse(readFileSync(new URL("../metadata/manifests/one_assistant.json", import.meta.url), "utf8"));
export const oneAssistantManifest = Object.freeze(loaded);

export function oneAssistantAppointmentRouterWorkflow() {
  const workflows = Array.isArray(oneAssistantManifest.workflows) ? oneAssistantManifest.workflows : [];
  return workflows.find((workflow) => String(workflow?.action?.apiName || "") === "OneAssistant_Booking_Channel_Router")
    || workflows.find((workflow) => String(workflow?.name || "").toLowerCase().includes("booking"))
    || workflows[0]
    || null;
}
