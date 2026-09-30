import { comparePackageVersions } from "./packageRegistry.js";

export const PLATFORM_RUNTIME_CONTRACT_VERSION = "1.0.0";
export const PLATFORM_METADATA_SCHEMA_VERSION = 10;
export const PLATFORM_API_VERSION = "2026-09";

export function platformRuntimeContract() {
  return Object.freeze({
    runtime: "OneEngine",
    runtimeContractVersion: PLATFORM_RUNTIME_CONTRACT_VERSION,
    metadataSchemaVersion: PLATFORM_METADATA_SCHEMA_VERSION,
    apiVersion: PLATFORM_API_VERSION,
  });
}

export function validatePlatformCompatibility(requiredVersion, currentVersion = PLATFORM_RUNTIME_CONTRACT_VERSION) {
  if (!requiredVersion) return { compatible: true, requiredVersion: null, currentVersion };
  const compatible = comparePackageVersions(currentVersion, requiredVersion) >= 0;
  return {
    compatible,
    requiredVersion: String(requiredVersion),
    currentVersion: String(currentVersion),
  };
}

export function assertPlatformCompatibility(requiredVersion, currentVersion = PLATFORM_RUNTIME_CONTRACT_VERSION) {
  const result = validatePlatformCompatibility(requiredVersion, currentVersion);
  if (!result.compatible) {
    const error = new Error(
      `Package requires platform runtime ${result.requiredVersion} but current runtime is ${result.currentVersion}`
    );
    error.code = "PLATFORM_RUNTIME_INCOMPATIBLE";
    error.status = 409;
    error.compatibility = result;
    throw error;
  }
  return result;
}

export function normalizeTraceEnvelope({
  correlationId = null,
  transactionId = null,
  workflowRunId = null,
  eventId = null,
  source = null,
  executionMode = null,
  runtimeContractVersion = PLATFORM_RUNTIME_CONTRACT_VERSION,
} = {}) {
  return {
    correlationId: correlationId || transactionId || null,
    transactionId: transactionId || null,
    workflowRunId: workflowRunId || null,
    eventId: eventId || null,
    source: source || null,
    executionMode: executionMode || null,
    runtimeContractVersion,
  };
}
