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
    expect(defaultLanguageAdapterRegistry.adapters.map((adapter) => adapter.id)).toEqual(["javascript-typescript", "python"]);
    expect(defaultLanguageAdapterRegistry.sourcePatterns).toEqual(["**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}", "**/*.py"]);
    expect(defaultLanguageAdapterRegistry.configPatterns).toEqual([
      "package.json",
      "**/package.json",
      "tsconfig.json",
      "**/tsconfig*.json",
      "next.config.*",
      "vite.config.*",
      "eslint.config.*",
      "pyproject.toml",
      "**/pyproject.toml",
      "setup.py",
      "**/setup.py",
      "setup.cfg",
      "**/setup.cfg",
      "tox.ini",
      "**/tox.ini",
      "pytest.ini",
      "**/pytest.ini",
      "requirements*.txt",
      "**/requirements*.txt",
      "ruff.toml",
      "**/ruff.toml",
      ".ruff.toml",
      "**/.ruff.toml",
      "mypy.ini",
      "**/mypy.ini",
      ".mypy.ini",
      "**/.mypy.ini",
      "Pipfile",
      "**/Pipfile",
      "poetry.lock",
      "**/poetry.lock",
      "uv.lock",
      "**/uv.lock",
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

  it("ignores Python virtual environments and cache directories", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-discover-python-ignore-"));
    created.push(root);
    await fs.mkdir(path.join(root, ".venv"), { recursive: true });
    await fs.mkdir(path.join(root, "__pycache__"), { recursive: true });
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, ".venv", "ignored.py"), "ignored = True\n");
    await fs.writeFile(path.join(root, "__pycache__", "ignored.py"), "ignored = True\n");
    await fs.writeFile(path.join(root, "src", "app.py"), "app = True\n");
    await fs.writeFile(path.join(root, "pyproject.toml"), "[project]\nname = 'fixture'\n");
    await fs.writeFile(path.join(root, "setup.cfg"), "[metadata]\nname = fixture\n");

    const repository = await discoverRepository(root);

    expect(repository.sourceFiles).toEqual(["src/app.py"]);
    expect(repository.configFiles).toEqual(["pyproject.toml", "setup.cfg"]);
  });

  it("detects Python-only and mixed project types", async () => {
    const pythonRoot = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-discover-python-only-"));
    const mixedRoot = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-discover-mixed-"));
    created.push(pythonRoot, mixedRoot);
    await fs.writeFile(path.join(pythonRoot, "app.py"), "print('ok')\n");
    await fs.writeFile(path.join(pythonRoot, "pyproject.toml"), "[project]\nname = 'fixture'\n");
    await fs.writeFile(path.join(mixedRoot, "app.py"), "print('ok')\n");
    await fs.writeFile(path.join(mixedRoot, "app.ts"), "export const ok = true;\n");

    expect((await discoverRepository(pythonRoot)).snapshot.projectType).toEqual(["Python"]);
    expect((await discoverRepository(mixedRoot)).snapshot.projectType).toEqual(["JavaScript/TypeScript", "Python"]);
  });

  it("rejects config-only Python directories with a generic unsupported message", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-discover-python-config-only-"));
    created.push(root);
    await fs.writeFile(path.join(root, "pyproject.toml"), "[project]\nname = 'fixture'\n");

    await expect(discoverRepository(root)).rejects.toThrowError(
      expect.objectContaining({
        code: "UNSUPPORTED_REPOSITORY",
        message: "No supported source files were found.",
      }),
    );
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
