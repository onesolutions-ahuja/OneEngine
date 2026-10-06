import { JarvisError, JARVIS_ERROR_CODES } from "../errors.js";

/*
 * Jarvis has no business-specific server tools in core. Business analytics
 * must be exposed through metadata Reports/Flows and generic assistant actions.
 * This registry remains as the generic extension point for metadata-driven
 * tools without embedding object names, fields or SQL in Jarvis code.
 */
export function createJarvisTools() {
  function matchTool() {
    return null;
  }

  async function executeTool(name) {
    throw new JarvisError(JARVIS_ERROR_CODES.TOOL_UNAVAILABLE, {
      detail: `unregistered metadata tool '${String(name || "")}'`,
    });
  }

  return { matchTool, executeTool };
}

export function formatToolResultBlock(result) {
  const grounding = result?.grounding;
  return typeof grounding === "string" ? grounding : "";
}
