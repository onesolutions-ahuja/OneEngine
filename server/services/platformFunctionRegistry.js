import { packageFunctions } from "../packages/functionsIndex.js";

// Business-specific executable functions are forbidden. Runtime behavior must be
// expressed as metadata Flows using generic/core actions.
const CORE_PLATFORM_FUNCTIONS = Object.freeze([]);

export const PLATFORM_FUNCTIONS = Object.freeze([...CORE_PLATFORM_FUNCTIONS, ...packageFunctions]);

const duplicates = PLATFORM_FUNCTIONS.map((item) => item.key).filter((key,index,all)=>all.indexOf(key)!==index);
if (duplicates.length) throw new Error(`Duplicate registered function keys: ${[...new Set(duplicates)].join(", ")}`);

export const PLATFORM_FUNCTION_MAP = new Map(PLATFORM_FUNCTIONS.map((item)=>[item.key,item]));
export function getPlatformFunction(key){ return PLATFORM_FUNCTION_MAP.get(String(key||"").trim()) || null; }
export function listPlatformFunctions(){ return PLATFORM_FUNCTIONS.slice(); }
