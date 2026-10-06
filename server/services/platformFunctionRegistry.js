// Legacy registered-function execution has been retired.
// Business behaviour must be expressed as metadata + Flow using generic core actions.
// This empty compatibility export remains temporarily so old tests/imports fail safely
// without reintroducing executable business handlers.
export const PLATFORM_FUNCTIONS = Object.freeze([]);
export const PLATFORM_FUNCTION_MAP = new Map();
export function getPlatformFunction() { return null; }
export function listPlatformFunctions() { return []; }
