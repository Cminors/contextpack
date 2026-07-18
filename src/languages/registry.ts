import { ContextPackError } from "../errors.js";
import type { LanguageAdapter, LanguageAdapterRegistry } from "./types.js";

const uniquePatterns = (adapters: readonly LanguageAdapter[], key: "sourcePatterns" | "configPatterns"): string[] => {
  const patterns = new Set<string>();
  for (const adapter of adapters) {
    for (const pattern of adapter[key]) patterns.add(pattern);
  }
  return [...patterns];
};

export const createLanguageAdapterRegistry = (
  adapters: readonly LanguageAdapter[],
): LanguageAdapterRegistry => {
  const registeredAdapters = [...adapters];
  const sourcePatterns = uniquePatterns(registeredAdapters, "sourcePatterns");
  const configPatterns = uniquePatterns(registeredAdapters, "configPatterns");

  return {
    adapters: registeredAdapters,
    sourcePatterns,
    configPatterns,
    ownerFor: (filePath) => {
      const owners = registeredAdapters.filter((adapter) => adapter.owns(filePath));
      if (owners.length === 1) return owners[0]!;
      if (owners.length === 0) {
        throw new ContextPackError(
          `No language adapter owns ${filePath}.`,
          3,
          "LANGUAGE_ADAPTER_OWNERSHIP",
        );
      }
      throw new ContextPackError(
        `Multiple language adapters own ${filePath}: ${owners.map((adapter) => adapter.id).join(", ")}.`,
        3,
        "LANGUAGE_ADAPTER_OWNERSHIP",
      );
    },
  };
};
