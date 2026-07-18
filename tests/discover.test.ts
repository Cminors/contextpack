import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ContextPackError } from "../src/errors.js";
import { defaultLanguageAdapterRegistry } from "../src/languages/defaults.js";
import { createLanguageAdapterRegistry } from "../src/languages/registry.js";
import type { LanguageAdapter } from "../src/languages/types.js";
import { discoverRepository } from "../src/repository/discover.js";

const created: string[] = [];

afterEach(async () => Promise.all(created.splice(0).map((item) => fs.rm(item, { recursive: true, force: true }))));

describe("repository discovery", () => {
  it("uses the default registry's source and config patterns", () => {
    expect(defaultLanguageAdapterRegistry.adapters.map((adapter) => adapter.id)).toEqual(["javascript-typescript"]);
    expect(defaultLanguageAdapterRegistry.sourcePatterns).toEqual(["**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"]);
    expect(defaultLanguageAdapterRegistry.configPatterns).toEqual([
      "package.json",
      "**/package.json",
      "tsconfig.json",
      "**/tsconfig*.json",
      "next.config.*",
      "vite.config.*",
      "eslint.config.*",
    ]);
  });

  it("retains filtering, POSIX normalization, and sorted file lists", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-discover-"));
    created.push(root);
    await fs.mkdir(path.join(root, "src", "nested"), { recursive: true });
    await fs.mkdir(path.join(root, "dist"), { recursive: true });
    await fs.mkdir(path.join(root, "src", "secrets"), { recursive: true });
    await fs.writeFile(path.join(root, "package.json"), "{}");
    await fs.writeFile(path.join(root, "src", "z.ts"), "export const z = true;\n");
    await fs.writeFile(path.join(root, "src", "nested", "a.ts"), "export const a = true;\n");
    await fs.writeFile(path.join(root, "dist", "ignored.ts"), "export const ignored = true;\n");
    await fs.writeFile(path.join(root, "src", "secrets", "token.ts"), "secret");
    await fs.writeFile(path.join(root, ".env.ts"), "secret");
    await fs.writeFile(path.join(root, "vite.config.ts"), "export default {};\n");
    await fs.writeFile(path.join(root, ".gitignore"), "src/nested/\n");

    const repository = await discoverRepository(root);

    expect(repository.sourceFiles).toEqual(["src/z.ts", "vite.config.ts"]);
    expect(repository.configFiles).toEqual(["package.json", "vite.config.ts"]);
  });

  it("rejects a discovered source path without exactly one owner", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-discover-owner-"));
    created.push(root);
    await fs.writeFile(path.join(root, "package.json"), "{}");
    await fs.writeFile(path.join(root, "src.ts"), "export const value = true;\n");
    const adapter: LanguageAdapter = {
      id: "never-owner",
      sourcePatterns: ["**/*.ts"],
      configPatterns: [],
      owns: () => false,
      analyzeFiles: async () => [],
    };

    await expect(discoverRepository(root, createLanguageAdapterRegistry([adapter]))).rejects.toThrowError(
      expect.objectContaining({ code: "LANGUAGE_ADAPTER_OWNERSHIP" }),
    );
    await expect(discoverRepository(root, createLanguageAdapterRegistry([adapter]))).rejects.toThrow(ContextPackError);
  });
});
