import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pythonAdapter, setPythonProcessRunnerForTests, validatePythonWorkerResponseForTests } from "../src/languages/python.js";
import type { DiscoveredRepository } from "../src/types.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  delete process.env.CONTEXTPACK_PYTHON;
  setPythonProcessRunnerForTests(null);
});

function repository(root: string, sourceFiles: string[]): DiscoveredRepository {
  return {
    snapshot: {
      root, commit: "unavailable", branch: null, packageManager: "unknown", projectType: [],
      isGitRepository: false, isShallow: false,
    },
    sourceFiles, configFiles: [], packages: [], rules: [], warnings: [],
  };
}

async function fixture(): Promise<{ root: string; files: string[]; repository: DiscoveredRepository }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-python-"));
  roots.push(root);
  await fs.mkdir(path.join(root, "src", "accounts"), { recursive: true });
  await fs.mkdir(path.join(root, "tests"), { recursive: true });
  await fs.writeFile(path.join(root, "src", "accounts", "models.py"), "class Account:\n    pass\n");
  await fs.writeFile(path.join(root, "src", "accounts", "service.py"), [
    "from .models import Account", "", "@decorator", "async def refresh_accounts(value: int):", "    return value", "",
    "class Service:", "    @staticmethod", "    def run():", "        return Account", "", "_private = 1", "PUBLIC: int = 2", "",
  ].join("\n"));
  await fs.writeFile(path.join(root, "src", "accounts", "__init__.py"), "\n");
  await fs.writeFile(path.join(root, "tests", "test_service.py"), "from src.accounts.service import Service\n\ndef test_run():\n    return Service.run()\n");
  const files = ["src/accounts/__init__.py", "src/accounts/models.py", "src/accounts/service.py", "tests/test_service.py"];
  return { root, files, repository: repository(root, files) };
}

describe("pythonAdapter", () => {
  it("owns Python files and normalizes AST symbols and internal imports", async () => {
    const item = await fixture();
    const analyses = await pythonAdapter.analyzeFiles(item.repository, item.files);
    const byPath = new Map(analyses.map((analysis) => [analysis.path, analysis]));
    expect(pythonAdapter.id).toBe("python");
    expect(pythonAdapter.sourcePatterns).toEqual(["**/*.py"]);
    expect(pythonAdapter.owns("src/app.py")).toBe(true);
    expect(pythonAdapter.owns("src/app.ts")).toBe(false);
    expect(byPath.get("src/accounts/service.py")).toMatchObject({
      language: "python", imports: ["src/accounts/models.py"], importedBy: ["tests/test_service.py"],
      references: [], referencedBy: [], referenceSymbols: {}, isTest: false, isConfig: false,
    });
    expect(byPath.get("tests/test_service.py")?.isTest).toBe(true);
    const service = byPath.get("src/accounts/service.py")!;
    expect(service.symbols).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "refresh_accounts", kind: "function", startLine: 3, endLine: 5, exported: true }),
      expect.objectContaining({ name: "Service.run", kind: "method", exported: true }),
      expect.objectContaining({ name: "_private", kind: "variable", exported: false }),
      expect.objectContaining({ name: "PUBLIC", kind: "variable", exported: true }),
    ]));
    expect(service.symbols.find((symbol) => symbol.name === "refresh_accounts")?.text).toContain("@decorator");
  });

  it("adds a module fallback for a non-empty symbol-free module", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-python-module-"));
    roots.push(root);
    await fs.writeFile(path.join(root, "module.py"), "# module comment\n\nif True:\n    print('ok')\n");
    const analyses = await pythonAdapter.analyzeFiles(repository(root, ["module.py"]), ["module.py"]);
    expect(analyses[0]?.symbols).toEqual([expect.objectContaining({ kind: "module", name: "module.py" })]);
  });

  it("returns a controlled unavailable warning and lexical fallback", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-python-fallback-"));
    roots.push(root);
    await fs.writeFile(path.join(root, "app.py"), "def run():\n    return 1\n");
    const repo = repository(root, ["app.py"]);
    process.env.CONTEXTPACK_PYTHON = "contextpack-python-does-not-exist";
    const analyses = await pythonAdapter.analyzeFiles(repo, ["app.py"]);
    expect(analyses[0]).toMatchObject({ language: "python", content: expect.stringContaining("def run") });
    expect(analyses[0]?.symbols).toEqual([]);
    expect(repo.warnings).toHaveLength(1);
    expect(repo.warnings[0]?.code).toBe("PYTHON_UNAVAILABLE");
  });

  it("falls back only malformed files and remains deterministic", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-python-parse-"));
    roots.push(root);
    await fs.writeFile(path.join(root, "valid.py"), "def run():\n    return 1\n");
    await fs.writeFile(path.join(root, "invalid.py"), "def broken(:\n");
    const repo = repository(root, ["invalid.py", "valid.py"]);
    const first = await pythonAdapter.analyzeFiles(repo, ["invalid.py", "valid.py"]);
    const warningCodes = repo.warnings.map((warning) => warning.code);
    repo.warnings.length = 0;
    const second = await pythonAdapter.analyzeFiles(repo, ["valid.py", "invalid.py"]);
    expect(first).toEqual(second);
    expect(warningCodes).toEqual(["PYTHON_PARSE_FAILED"]);
    expect(first.find((analysis) => analysis.path === "invalid.py")?.symbols).toEqual([]);
    expect(first.find((analysis) => analysis.path === "valid.py")?.symbols).toHaveLength(1);
  });

  it("rejects escaping source paths without reading outside the repository", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-python-containment-"));
    roots.push(root);
    const outside = path.join(path.dirname(root), "contextpack-python-outside.py");
    await fs.writeFile(outside, "SECRET = 'must not be read'\n");
    try {
      const absoluteOutside = outside.replaceAll("\\", "/");
      const repo = repository(root, ["../contextpack-python-outside.py", absoluteOutside]);
      const analyses = await pythonAdapter.analyzeFiles(repo, repo.sourceFiles);
      expect(analyses).toHaveLength(2);
      expect(analyses.every((item) => item.content === "")).toBe(true);
      expect(analyses.every((item) => path.relative(root, item.absolutePath).startsWith("..") === false)).toBe(true);
      expect(repo.warnings).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "PYTHON_ANALYSIS_FAILED", path: "../contextpack-python-outside.py" }),
        expect.objectContaining({ code: "PYTHON_ANALYSIS_FAILED", path: absoluteOutside }),
      ]));
    } finally {
      await fs.rm(outside, { force: true });
    }
  });

  it("rejects source symlinks whose real path escapes the repository", async ({ skip }) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-python-symlink-"));
    roots.push(root);
    const outside = path.join(path.dirname(root), "contextpack-python-symlink-outside.py");
    const linked = path.join(root, "linked.py");
    await fs.writeFile(outside, "SECRET = 'must not be read'\n");
    try {
      try {
        await fs.symlink(outside, linked, "file");
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (["EPERM", "EACCES", "ENOSYS", "ENOTSUP", "EOPNOTSUPP"].includes(code ?? "")) {
          skip();
          return;
        }
        throw error;
      }
      const repo = repository(root, ["linked.py"]);
      const analyses = await pythonAdapter.analyzeFiles(repo, repo.sourceFiles);
      expect(analyses[0]?.content).toBe("");
      expect(path.relative(root, analyses[0]?.absolutePath ?? "").startsWith("..")).toBe(false);
      expect(repo.warnings).toEqual([expect.objectContaining({ code: "PYTHON_ANALYSIS_FAILED", path: "linked.py" })]);
    } finally {
      await fs.rm(outside, { force: true });
    }
  });

  it("does not use unrelated suffix matches for relative imports", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-python-relative-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "pkg"), { recursive: true });
    await fs.mkdir(path.join(root, "other"), { recursive: true });
    await fs.writeFile(path.join(root, "pkg", "service.py"), "from . import models\n");
    await fs.writeFile(path.join(root, "pkg", "models.py"), "VALUE = 1\n");
    await fs.writeFile(path.join(root, "pkg", "missing_service.py"), "from . import external\n");
    await fs.writeFile(path.join(root, "other", "models.py"), "VALUE = 1\n");
    await fs.writeFile(path.join(root, "other", "external.py"), "VALUE = 1\n");
    const repo = repository(root, ["pkg/service.py", "pkg/models.py", "pkg/missing_service.py", "other/models.py", "other/external.py"]);
    const analyses = await pythonAdapter.analyzeFiles(repo, repo.sourceFiles);
    expect(analyses.find((item) => item.path === "pkg/service.py")?.imports).toEqual(["pkg/models.py"]);
    expect(analyses.find((item) => item.path === "pkg/missing_service.py")?.imports).toEqual([]);
  });

  it("classifies a started non-worker executable as analysis failure", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-python-worker-failure-"));
    roots.push(root);
    await fs.writeFile(path.join(root, "app.py"), "VALUE = 1\n");
    const repo = repository(root, ["app.py"]);
    process.env.CONTEXTPACK_PYTHON = process.execPath;
    const analyses = await pythonAdapter.analyzeFiles(repo, repo.sourceFiles);
    expect(analyses[0]?.symbols).toEqual([]);
    expect(repo.warnings[0]?.code).toBe("PYTHON_ANALYSIS_FAILED");
  });

  it("rejects malformed nested worker responses and incomplete paths", () => {
    const valid = {
      version: 1,
      files: [{ path: "app.py", symbols: [], imports: [], isTest: false, isConfig: false }],
      errors: [],
    };
    expect(validatePythonWorkerResponseForTests(valid, ["app.py"])).toBe(true);
    expect(validatePythonWorkerResponseForTests({ ...valid, files: [{ ...valid.files[0], symbols: [{ name: "x" }] }] }, ["app.py"])).toBe(false);
    expect(validatePythonWorkerResponseForTests(valid, ["app.py", "other.py"])).toBe(false);
  });

  it("classifies malformed worker output as analysis failure", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-python-malformed-worker-"));
    roots.push(root);
    await fs.writeFile(path.join(root, "app.py"), "VALUE = 1\n");
    setPythonProcessRunnerForTests(() => ({ status: 0, signal: null, stdout: "{not-json" }));
    const repo = repository(root, ["app.py"]);
    const analyses = await pythonAdapter.analyzeFiles(repo, repo.sourceFiles);
    expect(analyses[0]?.symbols).toEqual([]);
    expect(repo.warnings).toEqual([expect.objectContaining({ code: "PYTHON_ANALYSIS_FAILED" })]);
  });
});
