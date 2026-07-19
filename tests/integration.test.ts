import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeTask } from "../src/analysis/analyze.js";
import { analyzeFiles, enrichSemanticReferences } from "../src/analysis/ast.js";
import { analyzeConfigFiles, packageDirectoryFor } from "../src/analysis/config-files.js";
import { discoverRepository } from "../src/repository/discover.js";
import { renderContext } from "../src/output/markdown.js";

const created: string[] = [];
afterEach(async () => Promise.all(created.splice(0).map((item) => fs.rm(item, { recursive: true, force: true }))));

describe("task analysis", () => {
  it("suggests configured Python verification commands in deterministic order", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-python-commands-"));
    created.push(root);
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(
      path.join(root, "pyproject.toml"),
      [
        "[build-system]",
        "requires = ['setuptools']",
        "[tool.pytest.ini_options]",
        "testpaths = ['tests']",
        "[tool.ruff]",
        "line-length = 100",
        "[tool.mypy]",
        "strict = true",
      ].join("\n"),
    );
    await fs.writeFile(path.join(root, "pytest.ini"), "[pytest]\ntestpaths = tests\n");
    await fs.writeFile(path.join(root, "src", "session.py"), "def refresh():\n    return True\n");

    const manifest = await analyzeTask({ root, task: "refresh session", budget: 4000, historyCount: 1 });

    expect(manifest.commands).toEqual([
      { name: "test", command: "python -m pytest", directory: ".", reason: "Pytest configuration detected" },
      { name: "lint", command: "python -m ruff check .", directory: ".", reason: "Ruff configuration detected" },
      { name: "typecheck", command: "python -m mypy .", directory: ".", reason: "mypy configuration detected" },
      { name: "build", command: "python -m build", directory: ".", reason: "Python build system detected" },
    ]);
  });

  it("uses unittest for Python tests without pytest evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-python-unittest-"));
    created.push(root);
    await fs.mkdir(path.join(root, "tests"), { recursive: true });
    await fs.writeFile(path.join(root, "tests", "test_session.py"), "def test_refresh():\n    assert True\n");

    const manifest = await analyzeTask({ root, task: "refresh session", budget: 4000, historyCount: 1 });

    expect(manifest.commands).toContainEqual({
      name: "test",
      command: "python -m unittest discover",
      directory: ".",
      reason: "Python test files detected",
    });
    expect(manifest.commands.some((item) => item.command === "python -m pytest")).toBe(false);
  });

  it("does not treat JavaScript test directories as unittest evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-js-test-directory-"));
    created.push(root);
    await fs.mkdir(path.join(root, "tests"), { recursive: true });
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "js-only" }));
    await fs.writeFile(path.join(root, "tests", "session.test.ts"), "export const ready = true;\n");

    const manifest = await analyzeTask({ root, task: "check session", budget: 4000, historyCount: 1 });

    expect(manifest.commands.some((item) => item.command.includes("unittest"))).toBe(false);
  });

  it("keeps npm commands first and caps mixed verification suggestions at five", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-mixed-commands-"));
    created.push(root);
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify({
      name: "mixed",
      scripts: { test: "vitest", typecheck: "tsc --noEmit" },
    }));
    await fs.writeFile(path.join(root, "src", "index.ts"), "export const ready = true;\n");
    await fs.writeFile(path.join(root, "src", "session.py"), "ready = True\n");
    await fs.writeFile(
      path.join(root, "pyproject.toml"),
      "[build-system]\nrequires = ['setuptools']\n[tool.pytest.ini_options]\n[tool.ruff]\n[tool.mypy]\n",
    );

    const manifest = await analyzeTask({ root, task: "check readiness", budget: 4000, historyCount: 1 });

    expect(manifest.commands).toHaveLength(5);
    expect(manifest.commands.map((item) => item.command)).toEqual([
      "npm test",
      "npm run typecheck",
      "python -m pytest",
      "python -m ruff check .",
      "python -m mypy .",
    ]);
  });

  it("detects pytest dependencies and standalone Ruff and mypy configs", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-python-tool-files-"));
    created.push(root);
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "src", "session.py"), "ready = True\n");
    await fs.writeFile(
      path.join(root, "requirements-dev.txt"),
      "# pytest>=7 is no longer supported\npytest[testing]==8.3.2 # pinned test runner\npytest-cov>=5\n",
    );
    await fs.writeFile(path.join(root, "ruff.toml"), "line-length = 100\n");
    await fs.writeFile(path.join(root, "mypy.ini"), "[mypy]\nstrict = true\n");

    const manifest = await analyzeTask({ root, task: "check session", budget: 4000, historyCount: 1 });

    expect(manifest.commands.map((item) => item.command)).toEqual([
      "python -m pytest",
      "python -m ruff check .",
      "python -m mypy .",
    ]);
  });

  it("ignores pytest mentions in dependency comments and prose", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-python-dependency-comments-"));
    created.push(root);
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "src", "session.py"), "ready = True\n");
    await fs.writeFile(
      path.join(root, "requirements-dev.txt"),
      "# pytest>=8 was removed\npytest-cov>=5\npytest>=8 was previously used\n",
    );
    await fs.writeFile(
      path.join(root, "setup.cfg"),
      "[metadata]\ndescription = pytest>=8 was removed\n# tests_require = pytest\n",
    );

    const manifest = await analyzeTask({ root, task: "check session", budget: 4000, historyCount: 1 });

    expect(manifest.commands.some((item) => item.command === "python -m pytest")).toBe(false);
  });

  it("detects a pinned pytest token in setup dependency configuration", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-python-setup-dependency-"));
    created.push(root);
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "src", "session.py"), "ready = True\n");
    await fs.writeFile(
      path.join(root, "setup.cfg"),
      "[options.extras_require]\ntest =\n    pytest~=8.3 # supported test runner\n",
    );

    const manifest = await analyzeTask({ root, task: "check session", budget: 4000, historyCount: 1 });

    expect(manifest.commands).toContainEqual({
      name: "test",
      command: "python -m pytest",
      directory: ".",
      reason: "Pytest configuration detected",
    });
  });

  it("retrieves Python behavior evidence from comments and docstrings", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-python-ranking-"));
    created.push(root);
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "pyproject.toml"), "[project]\nname = 'sessions'\n");
    await fs.writeFile(
      path.join(root, "src", "session.py"),
      "def refresh():\n    \"\"\"Reconcile orphaned sessions safely.\"\"\"\n    return True\n",
    );
    await fs.writeFile(path.join(root, "src", "cache.py"), "def warm_cache():\n    return True\n");

    const manifest = await analyzeTask({
      root,
      task: "reconcile orphaned sessions safely",
      budget: 4000,
      historyCount: 10,
    });

    expect(manifest.candidates[0]?.path).toBe("src/session.py");
    expect(manifest.candidates[0]?.reasons.join(" ")).toContain("content match");
  });

  it("classifies Python config files and resolves the nearest Python package root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-python-config-"));
    created.push(root);
    await fs.mkdir(path.join(root, "services", "api", "src"), { recursive: true });
    await fs.writeFile(path.join(root, "pyproject.toml"), "[project]\nname = 'root'\n");
    await fs.writeFile(path.join(root, "services", "api", "setup.cfg"), "[metadata]\nname = api\n");
    await fs.writeFile(path.join(root, "services", "api", "src", "app.py"), "app = True\n");
    const repository = await discoverRepository(root);
    const analyses = await analyzeConfigFiles(repository);

    expect(packageDirectoryFor("services/api/src/app.py", repository)).toBe("services/api");
    expect(analyses).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "pyproject.toml", language: "text", isConfig: true, packageDirectory: "." }),
      expect.objectContaining({ path: "services/api/setup.cfg", language: "text", isConfig: true, packageDirectory: "services/api" }),
    ]));
  });

  it("builds a bounded, explainable context pack without Git history", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-fixture-"));
    created.push(root);
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "vitest", typecheck: "tsc --noEmit" }, devDependencies: { typescript: "5" } }));
    await fs.writeFile(path.join(root, "src", "auth.ts"), "export function loginWithGithub(user: string) { return { user }; }\n");
    await fs.writeFile(path.join(root, "src", "auth.test.ts"), "import { loginWithGithub } from './auth';\ntest('login', () => loginWithGithub('a'));\n");
    await fs.writeFile(path.join(root, ".env"), "API_KEY=should-not-appear\n");
    const manifest = await analyzeTask({ root, task: "add GitHub login", budget: 4000, historyCount: 50 });
    const markdown = renderContext(manifest);
    expect(manifest.candidates[0]?.path).toBe("src/auth.ts");
    expect(manifest.selected.length).toBeLessThanOrEqual(16);
    expect(manifest.selected.some((item) => item.path === "src/auth.test.ts")).toBe(true);
    expect(manifest.warnings.some((item) => item.code === "NO_GIT_REPOSITORY")).toBe(true);
    expect(markdown).not.toContain("should-not-appear");
    expect(manifest.budget.estimatedTokens).toBeLessThanOrEqual(4200);
    const { totalMs, ...phases } = manifest.timings;
    expect(Object.values(phases).every((value) => value >= 0)).toBe(true);
    expect(totalMs).toBeGreaterThanOrEqual(Object.values(phases).reduce((sum, value) => sum + value, 0));
    expect(manifest.timings.rerankingMs).toBe(0);
    for (let section = 1; section <= 10; section += 1) expect(markdown).toContain(`## ${section}.`);
  });

  it("hard-limits the final rendered pack to 105 percent of budget", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-budget-"));
    created.push(root);
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "vitest" } }));
    for (let index = 0; index < 12; index += 1) {
      const body = Array.from({ length: 100 }, (_, line) => `  const oauthValue${line} = "${"x".repeat(30)}";`).join("\n");
      await fs.writeFile(path.join(root, `oauth-${index}.ts`), `export function oauthHandler${index}() {\n${body}\n}\n`);
    }
    const manifest = await analyzeTask({ root, task: "add OAuth handlers", budget: 4000, historyCount: 10 });
    const markdown = renderContext(manifest);
    expect(manifest.budget.estimatedTokens).toBeLessThanOrEqual(4200);
    expect(manifest.budget.truncated).toBe(true);
    expect(markdown).toContain("Estimated total");
  });

  it("resolves NodeNext .js specifiers and workspace package imports", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-imports-"));
    created.push(root);
    await fs.mkdir(path.join(root, "packages", "core", "src"), { recursive: true });
    await fs.mkdir(path.join(root, "packages", "app", "src"), { recursive: true });
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ private: true, workspaces: ["packages/*"] }));
    await fs.writeFile(path.join(root, "packages", "core", "package.json"), JSON.stringify({ name: "@fixture/core" }));
    await fs.writeFile(path.join(root, "packages", "app", "package.json"), JSON.stringify({ name: "@fixture/app" }));
    await fs.writeFile(path.join(root, "packages", "core", "src", "feature.ts"), "export const feature = true;\n");
    await fs.writeFile(path.join(root, "packages", "core", "src", "index.ts"), "export { feature } from './feature.js';\n");
    await fs.writeFile(path.join(root, "packages", "app", "src", "app.ts"), "import { feature } from '@fixture/core';\nexport { feature };\n");
    const repository = await discoverRepository(root);
    const files = await analyzeFiles(repository);
    const byPath = new Map(files.map((item) => [item.path, item]));
    expect(byPath.get("packages/core/src/index.ts")?.imports).toContain("packages/core/src/feature.ts");
    expect(byPath.get("packages/app/src/app.ts")?.imports).toContain("packages/core/src/index.ts");
  });

  it("uses TypeScript path aliases and follows imported symbols through barrels", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-program-"));
    created.push(root);
    await fs.mkdir(path.join(root, "packages", "core", "src"), { recursive: true });
    await fs.mkdir(path.join(root, "packages", "app", "src"), { recursive: true });
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ private: true, workspaces: ["packages/*"] }));
    await fs.writeFile(
      path.join(root, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@core/*": ["packages/core/src/*"] } } }),
    );
    await fs.writeFile(
      path.join(root, "packages", "core", "src", "feature.ts"),
      "export interface OAuthMetadata { issuer: string; }\n",
    );
    await fs.writeFile(
      path.join(root, "packages", "core", "src", "index.ts"),
      "export type { OAuthMetadata } from './feature.js';\n",
    );
    await fs.writeFile(
      path.join(root, "packages", "app", "src", "app.ts"),
      "import type { OAuthMetadata } from '@core/index';\nexport type AppAuth = OAuthMetadata;\n",
    );
    const repository = await discoverRepository(root);
    const files = await analyzeFiles(repository);
    enrichSemanticReferences(repository, files, ["packages/app/src/app.ts"]);
    const byPath = new Map(files.map((item) => [item.path, item]));
    const app = byPath.get("packages/app/src/app.ts");
    expect(app?.imports).toContain("packages/core/src/index.ts");
    expect(app?.references).toContain("packages/core/src/feature.ts");
    expect(byPath.get("packages/core/src/feature.ts")?.referencedBy).toContain("packages/app/src/app.ts");
  });

  it("does not inherit a TypeScript config from outside the repository root", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-parent-config-"));
    created.push(parent);
    const root = path.join(parent, "project");
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(parent, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true } }));
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "fixture" }));
    await fs.writeFile(path.join(root, "src", "index.ts"), "export const value = true;\n");
    const repository = await discoverRepository(root);
    const files = await analyzeFiles(repository);
    expect(enrichSemanticReferences(repository, files, ["src/index.ts"])).toBe(false);
  });

  it("builds a context pack from behavior evidence without path or symbol hints", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-content-"));
    created.push(root);
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "content-fixture" }));
    await fs.writeFile(
      path.join(root, "src", "processor.ts"),
      "export function processRequest(input: unknown) {\n  // Reject malformed payloads before dispatch.\n  return Boolean(input);\n}\n",
    );
    await fs.writeFile(path.join(root, "src", "cache.ts"), "export function warmCache() { return true; }\n");
    const manifest = await analyzeTask({
      root,
      task: "reject malformed payloads before dispatch",
      budget: 4000,
      historyCount: 10,
    });
    expect(manifest.candidates[0]?.path).toBe("src/processor.ts");
    expect(manifest.candidates[0]?.reasons.join(" ")).toContain("content match");
    expect(manifest.selected[0]?.snippet).toContain("Reject malformed payloads");
  });
});
