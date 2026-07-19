import { javascriptTypeScriptAdapter } from "./javascript-typescript.js";
import { pythonAdapter } from "./python.js";
import { createLanguageAdapterRegistry } from "./registry.js";

export const defaultLanguageAdapterRegistry = createLanguageAdapterRegistry([
  javascriptTypeScriptAdapter,
  pythonAdapter,
]);
