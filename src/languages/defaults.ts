import { javascriptTypeScriptAdapter } from "./javascript-typescript.js";
import { createLanguageAdapterRegistry } from "./registry.js";

export const defaultLanguageAdapterRegistry = createLanguageAdapterRegistry([
  javascriptTypeScriptAdapter,
]);
