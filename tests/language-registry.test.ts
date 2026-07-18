import { describe, expect, it } from "vitest";
import { ContextPackError } from "../src/errors.js";
import { createLanguageAdapterRegistry } from "../src/languages/registry.js";
import type { LanguageAdapter } from "../src/languages/types.js";

const adapter = (
  id: string,
  sourcePatterns: readonly string[],
  configPatterns: readonly string[],
  ownedPaths: readonly string[] = [],
): LanguageAdapter => ({
  id,
  sourcePatterns,
  configPatterns,
  owns: (filePath) => ownedPaths.includes(filePath),
  analyzeFiles: async () => [],
});

describe("createLanguageAdapterRegistry", () => {
  it("deduplicates patterns by first occurrence in declaration order", () => {
    const first = adapter(
      "first",
      ["**/*.ts", "**/*.tsx"],
      ["**/tsconfig.json", "**/package.json"],
    );
    const second = adapter(
      "second",
      ["**/*.tsx", "**/*.py", "**/*.ts"],
      ["**/package.json", "**/pyproject.toml"],
    );

    const registry = createLanguageAdapterRegistry([first, second]);

    expect(registry.adapters).toEqual([first, second]);
    expect(registry.sourcePatterns).toEqual(["**/*.ts", "**/*.tsx", "**/*.py"]);
    expect(registry.configPatterns).toEqual([
      "**/tsconfig.json",
      "**/package.json",
      "**/pyproject.toml",
    ]);
  });

  it("copies the adapter list at creation time", () => {
    const first = adapter("first", ["**/*.ts"], []);
    const second = adapter("second", ["**/*.py"], []);
    const adapters = [first];

    const registry = createLanguageAdapterRegistry(adapters);
    adapters.push(second);

    expect(registry.adapters).toEqual([first]);
    expect(registry.sourcePatterns).toEqual(["**/*.ts"]);
  });

  it("returns the single adapter that owns a path", () => {
    const first = adapter("first", ["**/*.ts"], [], ["src/a.ts"]);
    const second = adapter("second", ["**/*.py"], [], ["src/a.py"]);
    const registry = createLanguageAdapterRegistry([first, second]);

    expect(registry.ownerFor("src/a.ts")).toBe(first);
    expect(registry.ownerFor("src/a.py")).toBe(second);
  });

  it("throws a typed ownership error when no adapter owns a path", () => {
    const registry = createLanguageAdapterRegistry([
      adapter("typescript", ["**/*.ts"], [], ["src/a.ts"]),
    ]);

    expect(() => registry.ownerFor("README.md")).toThrowError(
      expect.objectContaining({
        name: "ContextPackError",
        code: "LANGUAGE_ADAPTER_OWNERSHIP",
        message: expect.stringMatching(/no language adapter/i),
      }),
    );
    expect(() => registry.ownerFor("README.md")).toThrow(ContextPackError);
  });

  it("throws a typed ownership error when multiple adapters own a path", () => {
    const registry = createLanguageAdapterRegistry([
      adapter("first", ["**/*.ts"], [], ["src/a.ts"]),
      adapter("second", ["**/*.ts"], [], ["src/a.ts"]),
    ]);

    expect(() => registry.ownerFor("src/a.ts")).toThrowError(
      expect.objectContaining({
        name: "ContextPackError",
        code: "LANGUAGE_ADAPTER_OWNERSHIP",
        message: expect.stringMatching(/multiple language adapters/i),
      }),
    );
  });

  it("supports an empty registry", () => {
    const registry = createLanguageAdapterRegistry([]);

    expect(registry.adapters).toEqual([]);
    expect(registry.sourcePatterns).toEqual([]);
    expect(registry.configPatterns).toEqual([]);
    expect(() => registry.ownerFor("src/a.ts")).toThrowError(
      expect.objectContaining({ code: "LANGUAGE_ADAPTER_OWNERSHIP" }),
    );
  });
});
