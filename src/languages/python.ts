import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { packageDirectoryFor } from "../analysis/config-files.js";
import type { ContextWarning, DiscoveredRepository, FileAnalysis } from "../types.js";
import { isWithinRoot, toPosixPath } from "../utils/path.js";
import type { LanguageAdapter } from "./types.js";
import {
  PYTHON_WORKER_SOURCE,
  type PythonImportRecord,
  type PythonWorkerRequest,
  type PythonWorkerResponse,
} from "./python-worker.js";

const pythonConfigPatterns = [
  "pyproject.toml", "**/pyproject.toml", "setup.py", "**/setup.py", "setup.cfg", "**/setup.cfg",
  "tox.ini", "**/tox.ini", "pytest.ini", "**/pytest.ini", "requirements*.txt", "**/requirements*.txt",
  "Pipfile", "**/Pipfile", "poetry.lock", "**/poetry.lock", "uv.lock", "**/uv.lock",
];

const interpreterCandidates = (): Array<{ command: string; prefix: string[] }> => {
  if (process.env.CONTEXTPACK_PYTHON) return [{ command: process.env.CONTEXTPACK_PYTHON, prefix: [] }];
  return process.platform === "win32"
    ? [{ command: "py", prefix: ["-3"] }, { command: "python", prefix: [] }, { command: "python3", prefix: [] }]
    : [{ command: "python3", prefix: [] }, { command: "python", prefix: [] }];
};

function warning(repository: DiscoveredRepository, code: string, message: string, filePath?: string): void {
  const item: ContextWarning = { code, message };
  if (filePath) item.path = filePath;
  repository.warnings.push(item);
}

function isPythonTest(filePath: string): boolean {
  const normalized = toPosixPath(filePath);
  const base = path.posix.basename(normalized).toLowerCase();
  return /(?:^|\/)(?:tests?|spec)(?:\/|$)/i.test(normalized)
    || base.startsWith("test_") || base.endsWith("_test.py");
}

function isPythonConfig(filePath: string): boolean {
  return /(?:^|\/)setup\.py$/i.test(toPosixPath(filePath));
}

function fallbackAbsolutePath(repository: DiscoveredRepository, relativePath: string, safe: boolean): string {
  const candidate = path.resolve(repository.snapshot.root, relativePath);
  if (safe && isWithinRoot(repository.snapshot.root, candidate)) return candidate;
  const stableName = relativePath.replace(/[^A-Za-z0-9_-]/g, "_") || "unknown";
  return path.join(repository.snapshot.root, ".contextpack-invalid-python", `${stableName}.py`);
}

function fallbackAnalysis(repository: DiscoveredRepository, relativePath: string, content: string, safe = true): FileAnalysis {
  return {
    path: relativePath,
    absolutePath: fallbackAbsolutePath(repository, relativePath, safe),
    language: "python",
    content,
    lineCount: content.split(/\r?\n/).length,
    imports: [], importedBy: [], references: [], referencedBy: [], referenceSymbols: {}, symbols: [],
    isTest: isPythonTest(relativePath), isConfig: isPythonConfig(relativePath),
    packageDirectory: packageDirectoryFor(relativePath, repository),
  };
}

const symbolKinds = new Set(["function", "class", "interface", "type", "enum", "variable", "method", "module"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validSymbol(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.name === "string" && typeof value.kind === "string" && symbolKinds.has(value.kind)
    && Number.isInteger(value.startLine) && Number.isInteger(value.endLine)
    && (value.startLine as number) >= 1 && (value.endLine as number) >= (value.startLine as number)
    && typeof value.exported === "boolean" && typeof value.text === "string";
}

function validWorkerFile(value: unknown): value is PythonWorkerResponse["files"][number] {
  if (!isRecord(value) || typeof value.path !== "string" || !Array.isArray(value.symbols)
    || !value.symbols.every(validSymbol) || !Array.isArray(value.imports)
    || !value.imports.every((item) => isRecord(item) && typeof item.module === "string"
      && Number.isInteger(item.level) && (item.level as number) >= 0)
    || typeof value.isTest !== "boolean" || typeof value.isConfig !== "boolean") return false;
  return true;
}

function validResponse(value: unknown, requestedPaths: readonly string[]): value is PythonWorkerResponse {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.files) || !Array.isArray(value.errors)) return false;
  if (!value.files.every(validWorkerFile)) return false;
  if (!value.errors.every((item) => isRecord(item) && typeof item.path === "string"
    && (item.code === "PYTHON_PARSE_FAILED" || item.code === "PYTHON_READ_FAILED")
    && typeof item.message === "string")) return false;
  const expected = new Set(requestedPaths.map(toPosixPath));
  const returned = [...value.files.map((item) => toPosixPath(item.path)), ...value.errors.map((item) => toPosixPath(item.path))];
  if (returned.length !== expected.size || new Set(returned).size !== returned.length) return false;
  return returned.every((item) => expected.has(item));
}

/** Test-only schema probe used to keep malformed worker output covered. */
export function validatePythonWorkerResponseForTests(value: unknown, requestedPaths: readonly string[]): boolean {
  return validResponse(value, requestedPaths);
}

function moduleCandidates(moduleName: string, fromPath: string, level: number, knownFiles: Set<string>): string[] {
  const fromDirectory = path.posix.dirname(fromPath);
  let baseDirectory = level > 0 ? fromDirectory : "";
  for (let index = 1; index < level; index += 1) baseDirectory = path.posix.dirname(baseDirectory);
  const modulePath = moduleName ? moduleName.split(".").join("/") : "";
  const bases = [path.posix.normalize(path.posix.join(baseDirectory, modulePath))];
  if (level === 0) bases.push(path.posix.join("src", modulePath));
  const candidates: string[] = [];
  for (const base of bases) {
    if (base && base !== ".") candidates.push(`${base}.py`, path.posix.join(base, "__init__.py"));
    else candidates.push("__init__.py");
  }
  return candidates.filter((candidate) => knownFiles.has(candidate));
}

function resolveImport(
  fromPath: string,
  record: PythonImportRecord,
  knownFiles: Set<string>,
): string | null {
  const direct = moduleCandidates(record.module, fromPath, record.level, knownFiles);
  if (direct.length > 0) return direct[0] ?? null;
  if (record.level !== 0) return null;
  const suffix = record.module ? `/${record.module.split(".").join("/")}` : "";
  const matches = [...knownFiles].filter((candidate) => candidate.endsWith(`${suffix}.py`) || candidate.endsWith(path.posix.join(suffix, "__init__.py")));
  return matches.length === 1 ? matches[0]! : null;
}

async function safeSourcePath(root: string, relativePath: string): Promise<boolean> {
  const normalized = toPosixPath(relativePath);
  if (path.isAbsolute(relativePath) || normalized.startsWith("/") || normalized.split("/").includes("..")) return false;
  const absolute = path.resolve(root, relativePath);
  if (!isWithinRoot(root, absolute)) return false;
  try {
    const [realRoot, realPath] = await Promise.all([fs.realpath(root), fs.realpath(absolute)]);
    return isWithinRoot(realRoot, realPath);
  } catch {
    return false;
  }
}

async function readContents(repository: DiscoveredRepository, sourceFiles: readonly string[]): Promise<Map<string, string>> {
  const contents = new Map<string, string>();
  for (const relativePath of sourceFiles) {
    try {
      const [realRoot, absolutePath] = await Promise.all([
        fs.realpath(repository.snapshot.root),
        fs.realpath(path.resolve(repository.snapshot.root, relativePath)),
      ]);
      if (!isWithinRoot(realRoot, absolutePath)) throw new Error("source path escaped repository root");
      contents.set(relativePath, await fs.readFile(absolutePath, "utf8"));
    } catch {
      contents.set(relativePath, "");
    }
  }
  return contents;
}

interface PythonWorkerRunResult {
  response?: PythonWorkerResponse;
  unavailable: boolean;
  failed: boolean;
}

interface PythonProcessResult {
  error?: NodeJS.ErrnoException;
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
}

type PythonProcessRunner = (
  command: string,
  args: string[],
  options: { input: string; encoding: "utf8"; windowsHide: true; timeout: number; maxBuffer: number },
) => PythonProcessResult;

const spawnPythonProcess: PythonProcessRunner = (command, args, options) => {
  const result = spawnSync(command, args, options);
  const normalized: PythonProcessResult = { status: result.status, signal: result.signal, stdout: result.stdout };
  if (result.error) normalized.error = result.error;
  return normalized;
};

let processRunner: PythonProcessRunner = spawnPythonProcess;

/** Test-only process injection; production always uses spawnSync with argument arrays. */
export function setPythonProcessRunnerForTests(runner: PythonProcessRunner | null): void {
  processRunner = runner ?? spawnPythonProcess;
}

function runWorker(request: PythonWorkerRequest): PythonWorkerRunResult {
  let sawAnalysisFailure = false;
  for (const candidate of interpreterCandidates()) {
    const result = processRunner(candidate.command, [...candidate.prefix, "-c", PYTHON_WORKER_SOURCE], {
      input: JSON.stringify(request), encoding: "utf8", windowsHide: true, timeout: 30_000, maxBuffer: 32 * 1024 * 1024,
    });
    if (result.error) {
      if ((result.error as NodeJS.ErrnoException).code !== "ENOENT") sawAnalysisFailure = true;
      continue;
    }
    if (result.status !== 0 || result.signal || !result.stdout) { sawAnalysisFailure = true; continue; }
    try {
      const parsed: unknown = JSON.parse(result.stdout);
      if (!validResponse(parsed, request.files)) { sawAnalysisFailure = true; continue; }
      return { response: parsed, unavailable: false, failed: false };
    } catch {
      sawAnalysisFailure = true;
    }
  }
  return { unavailable: !sawAnalysisFailure, failed: sawAnalysisFailure };
}

async function analyzePythonFiles(repository: DiscoveredRepository, sourceFiles: readonly string[]): Promise<FileAnalysis[]> {
  const sortedPaths = [...new Set(sourceFiles.map(toPosixPath))].sort();
  const safePaths: string[] = [];
  const unsafePaths: string[] = [];
  for (const relativePath of sortedPaths) {
    if (await safeSourcePath(repository.snapshot.root, relativePath)) safePaths.push(relativePath);
    else unsafePaths.push(relativePath);
  }
  for (const relativePath of unsafePaths) warning(repository, "PYTHON_ANALYSIS_FAILED", "Python source path escaped the repository root; using lexical fallback.", relativePath);
  const contents = await readContents(repository, safePaths);
  const unsafeSet = new Set(unsafePaths);
  const fallback = (relativePath: string): FileAnalysis => fallbackAnalysis(
    repository,
    relativePath,
    contents.get(relativePath) ?? "",
    !unsafeSet.has(relativePath),
  );
  const run = runWorker({ version: 1, root: repository.snapshot.root, files: safePaths });
  if (!run.response) {
    if (safePaths.length > 0) warning(repository, run.unavailable ? "PYTHON_UNAVAILABLE" : "PYTHON_ANALYSIS_FAILED", run.unavailable
      ? "No Python interpreter was available; using lexical fallback for Python files."
      : "Python AST analysis failed; using lexical fallback for Python files.");
    return sortedPaths.map(fallback);
  }
  const knownFiles = new Set(safePaths.map(toPosixPath));
  const byWorkerPath = new Map(run.response.files.map((file) => [toPosixPath(file.path), file]));
  for (const error of run.response.errors) {
    warning(repository, "PYTHON_PARSE_FAILED", error.message, error.path);
  }
  const analyses = sortedPaths.map((relativePath) => {
    const normalizedPath = toPosixPath(relativePath);
    const workerFile = byWorkerPath.get(normalizedPath);
    if (!workerFile) return fallback(relativePath);
    const imports = [...new Set(workerFile.imports
      .map((item) => resolveImport(normalizedPath, item, knownFiles))
      .filter((value): value is string => value !== null))].sort();
    const content = contents.get(relativePath) ?? "";
    return {
      path: relativePath,
      absolutePath: path.join(repository.snapshot.root, relativePath),
      language: "python" as const,
      content,
      lineCount: content.split(/\r?\n/).length,
      imports,
      importedBy: [], references: [], referencedBy: [], referenceSymbols: {},
      symbols: workerFile.symbols,
      isTest: workerFile.isTest,
      isConfig: workerFile.isConfig,
      packageDirectory: packageDirectoryFor(relativePath, repository),
    } satisfies FileAnalysis;
  });
  const byPath = new Map(analyses.map((analysis) => [toPosixPath(analysis.path), analysis]));
  for (const analysis of analyses) for (const importedPath of analysis.imports) {
    const imported = byPath.get(importedPath);
    if (imported && !imported.importedBy.includes(analysis.path)) imported.importedBy.push(analysis.path);
  }
  for (const analysis of analyses) analysis.importedBy.sort();
  return analyses;
}

export const pythonAdapter: LanguageAdapter = {
  id: "python",
  sourcePatterns: ["**/*.py"],
  configPatterns: pythonConfigPatterns,
  owns: (filePath) => /\.py$/i.test(filePath),
  analyzeFiles: analyzePythonFiles,
};
