import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeTask } from "../src/analysis/analyze.js";
import type { AnalysisTimings, ContextCandidate } from "../src/types.js";

const DEFAULT_ITERATIONS = 3;
const DEFAULT_LIMIT_MS = 4_000;
const MODULE_COUNT = 120;
const TEST_COUNT = 40;
const TASK = "refresh Python session state for runtime-neutral hosts";

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${name} must be a positive integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const current = sorted[middle] ?? 0;
  return sorted.length % 2 === 1 ? current : ((sorted[middle - 1] ?? current) + current) / 2;
}

async function createFixture(root: string): Promise<void> {
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.mkdir(path.join(root, "tests"), { recursive: true });
  await fs.writeFile(
    path.join(root, "pyproject.toml"),
    "[project]\nname = 'contextpack-python-smoke'\n[tool.pytest.ini_options]\ntestpaths = ['tests']\n",
  );

  const writes: Array<Promise<void>> = [];
  for (let index = 0; index < MODULE_COUNT; index += 1) {
    const previousImport = index === 0
      ? ""
      : `from .module_${index - 1} import refresh_session_${index - 1}\n`;
    const previousCall = index === 0 ? "state" : `refresh_session_${index - 1}(state)`;
    writes.push(fs.writeFile(
      path.join(root, "src", `module_${index}.py`),
      `${previousImport}`
        + `# Refresh Python session state for runtime-neutral host ${index}.\n`
        + `def refresh_session_${index}(state: dict[str, object]) -> dict[str, object]:\n`
        + `    """Refresh the session state through module ${index}."""\n`
        + `    state["module"] = ${index}\n`
        + `    return ${previousCall}\n`,
    ));
  }
  for (let index = 0; index < TEST_COUNT; index += 1) {
    const moduleIndex = index * 3;
    writes.push(fs.writeFile(
      path.join(root, "tests", `test_module_${moduleIndex}.py`),
      `from src.module_${moduleIndex} import refresh_session_${moduleIndex}\n\n`
        + `def test_refresh_session_${moduleIndex}():\n`
        + `    assert refresh_session_${moduleIndex}({"active": True})["module"] == ${moduleIndex}\n`,
    ));
  }
  await Promise.all(writes);
}

function candidateFingerprint(candidates: ContextCandidate[]): string {
  return JSON.stringify(candidates.map(({ path: filePath, score, reasons, relationships }) => ({
    path: filePath,
    score,
    reasons,
    relationships: relationships.map(({ kind, target, strength }) => ({ kind, target, strength })),
  })));
}

function hasResolvedImportEdge(candidates: ContextCandidate[]): boolean {
  return candidates.some((candidate) => candidate.path.endsWith(".py") && candidate.relationships.some((relationship) =>
    (relationship.kind === "imports" || relationship.kind === "imported-by") && relationship.target.endsWith(".py"),
  ));
}

async function main(): Promise<void> {
  const iterations = positiveInteger(process.env.CONTEXTPACK_PYTHON_SMOKE_ITERATIONS, DEFAULT_ITERATIONS, "CONTEXTPACK_PYTHON_SMOKE_ITERATIONS");
  const limitMs = positiveInteger(process.env.CONTEXTPACK_PYTHON_SMOKE_LIMIT_MS, DEFAULT_LIMIT_MS, "CONTEXTPACK_PYTHON_SMOKE_LIMIT_MS");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-python-smoke-"));
  try {
    await createFixture(root);
    await analyzeTask({ root, task: TASK, budget: 12_000, historyCount: 10 });
    const runs: AnalysisTimings[] = [];
    let fingerprint: string | null = null;
    let firstManifest: Awaited<ReturnType<typeof analyzeTask>> | null = null;
    for (let run = 0; run < iterations; run += 1) {
      const manifest = await analyzeTask({ root, task: TASK, budget: 12_000, historyCount: 10 });
      firstManifest ??= manifest;
      const currentFingerprint = candidateFingerprint(manifest.candidates);
      if (fingerprint !== null && currentFingerprint !== fingerprint) {
        throw new Error("candidate ranking changed between identical Python smoke runs");
      }
      fingerprint = currentFingerprint;
      runs.push(manifest.timings);
    }

    const manifest = firstManifest;
    if (!manifest) throw new Error("Python smoke produced no analysis result");
    if (!manifest.candidates.some((candidate) => candidate.path.endsWith(".py"))) {
      throw new Error("Python smoke did not produce a Python candidate");
    }
    if (!hasResolvedImportEdge(manifest.candidates)) {
      throw new Error("Python smoke did not expose a resolved internal import edge");
    }
    const medianTotalMs = median(runs.map((timings) => timings.totalMs));
    const summary = {
      fixture: { pythonSources: MODULE_COUNT, tests: TEST_COUNT, task: TASK },
      iterations,
      limitMs,
      medianTotalMs,
      runs,
      pythonCandidateCount: manifest.candidates.filter((candidate) => candidate.path.endsWith(".py")).length,
      resolvedImportEdge: true,
      warnings: manifest.warnings.map(({ code }) => code),
      fingerprint,
    };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (medianTotalMs > limitMs) {
      process.stderr.write(`Python performance smoke failed: median ${medianTotalMs} ms exceeds ${limitMs} ms.\n`);
      process.exitCode = 1;
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

await main();
