import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeFiles } from "../src/analysis/ast.js";
import { javascriptTypeScriptAdapter } from "../src/languages/javascript-typescript.js";
import { discoverRepository } from "../src/repository/discover.js";

const created: string[] = [];

afterEach(async () => Promise.all(created.splice(0).map((item) => fs.rm(item, { recursive: true, force: true }))));

describe("JavaScript and TypeScript AST analysis", () => {
  it("analyzes setup.py once as Python source and config", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-ast-python-config-"));
    created.push(root);
    await fs.writeFile(path.join(root, "setup.py"), "from setuptools import setup\nsetup(name='fixture')\n");

    const repository = await discoverRepository(root);
    const files = await analyzeFiles(repository);
    const setupFiles = files.filter((file) => file.path === "setup.py");

    expect(repository.sourceFiles).toEqual(["setup.py"]);
    expect(repository.configFiles).toEqual(["setup.py"]);
    expect(setupFiles).toEqual([expect.objectContaining({
      language: "python",
      isConfig: true,
      packageDirectory: ".",
    })]);
  });

  it("exposes the JavaScript and TypeScript language adapter contract", () => {
    expect(javascriptTypeScriptAdapter.id).toBe("javascript-typescript");
    expect(javascriptTypeScriptAdapter.sourcePatterns).toEqual(["**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"]);
    expect(javascriptTypeScriptAdapter.configPatterns).toEqual([
      "package.json",
      "**/package.json",
      "tsconfig.json",
      "**/tsconfig*.json",
      "next.config.*",
      "vite.config.*",
      "eslint.config.*",
    ]);
    expect(javascriptTypeScriptAdapter.owns("src/file.ts")).toBe(true);
    expect(javascriptTypeScriptAdapter.owns("src/file.mjs")).toBe(true);
    expect(javascriptTypeScriptAdapter.owns("README.md")).toBe(false);
  });

  it("preserves deterministic mixed-source analysis behavior", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-ast-"));
    created.push(root);
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "ast-fixture" }));
    await fs.writeFile(
      path.join(root, "src", "b.js"),
      "export const value = 42;\n",
    );
    await fs.writeFile(
      path.join(root, "src", "a.ts"),
      "import { value } from \"./b.js\";\nexport function answer(): number {\n  return value;\n}\n",
    );
    await fs.writeFile(
      path.join(root, "src", "a.test.ts"),
      "import { answer } from \"./a\";\nexport const result = answer();\n",
    );

    const repository = await discoverRepository(root);
    const files = await analyzeFiles(repository);

    const projected = files.filter((file) => file.language !== "json");
    expect(projected.map((file) => file.path)).toEqual(["src/a.test.ts", "src/a.ts", "src/b.js"]);
    expect(projected).toContainEqual(expect.objectContaining({
      path: "src/a.ts",
      language: "typescript",
      imports: ["src/b.js"],
      importedBy: ["src/a.test.ts"],
      references: [],
      referencedBy: [],
      referenceSymbols: {},
      symbols: [{
        name: "answer",
        kind: "function",
        startLine: 2,
        endLine: 4,
        exported: true,
        text: "export function answer(): number {\n  return value;\n}",
      }],
      isTest: false,
      isConfig: false,
      packageDirectory: ".",
    }));
    expect(projected).toContainEqual(expect.objectContaining({
      path: "src/a.test.ts",
      language: "typescript",
      imports: ["src/a.ts"],
      importedBy: [],
      isTest: true,
      isConfig: false,
      packageDirectory: ".",
    }));
    expect(projected).toContainEqual(expect.objectContaining({
      path: "src/b.js",
      language: "javascript",
      imports: [],
      importedBy: ["src/a.ts"],
      symbols: [{
        name: "value",
        kind: "variable",
        startLine: 1,
        endLine: 1,
        exported: true,
        text: "export const value = 42;",
      }],
      isTest: false,
      isConfig: false,
      packageDirectory: ".",
    }));
  });
});
