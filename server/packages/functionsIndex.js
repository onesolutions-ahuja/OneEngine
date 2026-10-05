import { packageFunctions as purchasingCoreFunctions } from "./purchasing_core/functions.js";
import { packageFunctions as financeCoreFunctions } from "./finance_core/functions.js";

export const packageFunctions = Object.freeze([
  ...purchasingCoreFunctions,
  ...financeCoreFunctions,
]);

export default packageFunctions;
