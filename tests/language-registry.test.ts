import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeFiles, enrichSemanticReferences } from "../src/analysis/ast.js";
import { ContextPackError } from "../src/errors.js";
import { javascriptTypeScriptAdapter } from "../src/languages/javascript-typescript.js";
import { createLanguageAdapterRegistry } from "../src/languages/registry.js";
import type { LanguageAdapter } from "../src/languages/types.js";
import type { DiscoveredRepository, FileAnalysis } from "../src/types.js";

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

const created: string[] = [];

afterEach(async () => Promise.all(created.splice(0).map((item) => fs.rm(item, { recursive: true, force: true }))));

const repository = (sourceFiles: string[], root = "/repo"): DiscoveredRepository => ({
  snapshot: {
    root,
    commit: "unavailable",
    branch: null,
    packageManager: "unknown",
    projectType: [],
    isGitRepository: false,
    isShallow: false,
  },
  sourceFiles,
  configFiles: [],
  packages: [],
  rules: [],
  warnings: [],
});

const analysis = (filePath: string): FileAnalysis => ({
  path: filePath,
  absolutePath: `/repo/${filePath}`,
  language: filePath.endsWith(".ts") ? "typescript" : "javascript",
  content: "",
  lineCount: 1,
  imports: [],
  importedBy: [],
  references: [],
  referencedBy: [],
  referenceSymbols: {},
  symbols: [],
  isTest: false,
  isConfig: false,
  packageDirectory: null,
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

describe("language adapter dispatch", () => {
  it("groups source paths and invokes adapters sequentially in registry order", async () => {
    const calls: string[] = [];
    const first: LanguageAdapter = {
      ...adapter("first", ["**/*.ts"], [], ["src/a.ts", "src/c.ts"]),
      analyzeFiles: async (_repository, sourceFiles) => {
        calls.push(`first:${sourceFiles.join(",")}`);
        return [analysis("src/c.ts"), analysis("src/a.ts")];
      },
    };
    const second: LanguageAdapter = {
      ...adapter("second", ["**/*.js"], [], ["src/b.js"]),
      analyzeFiles: async (_repository, sourceFiles) => {
        calls.push(`second:${sourceFiles.join(",")}`);
        return [analysis("src/b.js")];
      },
    };
    const registry = createLanguageAdapterRegistry([first, second]);

    const files = await analyzeFiles(repository(["src/c.ts", "src/b.js", "src/a.ts"]), registry);

    expect(calls).toEqual(["first:src/c.ts,src/a.ts", "second:src/b.js"]);
    expect(files.map((file) => file.path)).toEqual(["src/a.ts", "src/b.js", "src/c.ts"]);
  });

  it("analyzes config-only files once across multiple adapters", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-registry-config-"));
    created.push(root);
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "package.json"), "{\n  \"name\": \"fixture\"\n}\n");
    await fs.writeFile(path.join(root, "src", "a.ts"), "export const a = true;\n");
    await fs.writeFile(path.join(root, "src", "b.js"), "export const b = true;\n");
    const first: LanguageAdapter = {
      ...javascriptTypeScriptAdapter,
      id: "typescript",
      owns: (filePath) => filePath.endsWith(".ts"),
    };
    const second: LanguageAdapter = {
      ...javascriptTypeScriptAdapter,
      id: "javascript",
      owns: (filePath) => filePath.endsWith(".js"),
    };
    const registry = createLanguageAdapterRegistry([first, second]);
    const discovered = repository(["src/a.ts", "src/b.js"], root);
    discovered.configFiles = ["package.json"];
    discovered.packages = [{ directory: ".", name: "fixture", scripts: {} }];

    const files = await analyzeFiles(discovered, registry);
    const configFiles = files.filter((file) => file.path === "package.json");

    expect(configFiles).toEqual([expect.objectContaining({
      language: "json",
      isConfig: true,
      packageDirectory: ".",
    })]);
    expect(files.map((file) => file.path)).toEqual(["package.json", "src/a.ts", "src/b.js"]);
  });

  it("enriches source focus paths by owner in registry order", () => {
    const calls: string[] = [];
    const first: LanguageAdapter = {
      ...adapter("first", ["**/*.ts"], [], ["src/a.ts"]),
      enrichSemanticReferences: (_repository, _files, focusPaths) => {
        calls.push(`first:${focusPaths.join(",")}`);
        return false;
      },
    };
    const second: LanguageAdapter = {
      ...adapter("second", ["**/*.js"], [], ["src/b.js"]),
      enrichSemanticReferences: (_repository, _files, focusPaths) => {
        calls.push(`second:${focusPaths.join(",")}`);
        return true;
      },
    };
    const registry = createLanguageAdapterRegistry([first, second]);
    const discovered = repository(["src/a.ts", "src/b.js"]);
    const files = [analysis("src/a.ts"), analysis("src/b.js")];

    const enriched = enrichSemanticReferences(
      discovered,
      files,
      ["src/b.js", "package.json", "src/a.ts", "src/b.js", "src/a.ts"],
      registry,
    );

    expect(calls).toEqual(["first:src/a.ts", "second:src/b.js"]);
    expect(enriched).toBe(true);
  });
});
