import { packageFunctions as purchasingCoreFunctions } from "./purchasing_core/functions.js";

// Package-owned executable capabilities are aggregated outside the core runtime.
// Core code imports only this generic package index and remains unaware of
// business package names or function keys.
export const packageFunctions = Object.freeze([
  ...purchasingCoreFunctions,
]);

export default packageFunctions;
