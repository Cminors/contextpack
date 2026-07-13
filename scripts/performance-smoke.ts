import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeTask } from "../src/analysis/analyze.js";
import type { AnalysisTimings, ContextCandidate } from "../src/types.js";

const DEFAULT_ITERATIONS = 5;
const DEFAULT_LIMIT_MS = 4_000;
const TASK = "reconcile orphaned sessions for runtime-neutral hosts";
const TYPESCRIPT_FILES = 240;
const JAVASCRIPT_FILES = 48;
const TEST_FILES = 72;
const SOURCE_FILES = TYPESCRIPT_FILES + JAVASCRIPT_FILES + TEST_FILES;
const PHASES: Array<keyof AnalysisTimings> = [
  "discoverMs",
  "fileAnalysisMs",
  "gitHistoryMs",
  "initialRankingMs",
  "semanticEnrichmentMs",
  "rerankingMs",
  "selectionMs",
  "totalMs",
];

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
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
  await fs.mkdir(path.join(root, "test"), { recursive: true });
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "contextpack-performance-fixture", private: true, type: "module" }),
  );
  await fs.writeFile(
    path.join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { allowJs: true, module: "NodeNext", moduleResolution: "NodeNext", noEmit: true } }),
  );

  const writes: Array<Promise<void>> = [];
  for (let index = 0; index < TYPESCRIPT_FILES; index += 1) {
    const previous = index === 0 ? "" : `import { reconcileSession${index - 1} } from './module-${index - 1}.js';\n`;
    const dependency = index === 0 ? "input.active" : `reconcileSession${index - 1}(input)`;
    const helpers = Array.from(
      { length: 12 },
      (_, helper) => `export const sessionMetric${index}_${helper} = ${index + helper};`,
    ).join("\n");
    writes.push(fs.writeFile(
      path.join(root, "src", `module-${index}.ts`),
      `${previous}export interface SessionRecord${index} { active: boolean; host: string; }\n`
        + `// Reconcile orphaned sessions after a runtime-neutral host reconnects.\n`
        + `export function reconcileSession${index}(input: SessionRecord${index}) { return ${dependency}; }\n`
        + `${helpers}\n`,
    ));
  }
  for (let index = 0; index < JAVASCRIPT_FILES; index += 1) {
    const helpers = Array.from(
      { length: 8 },
      (_, helper) => `export const runtimeCapability${index}_${helper} = ${helper};`,
    ).join("\n");
    writes.push(fs.writeFile(
      path.join(root, "src", `runtime-host-${index}.js`),
      `// Normalize a web-standard runtime host before session recovery.\n`
        + `export function normalizeRuntimeHost${index}(host) { return String(host).toLowerCase(); }\n`
        + `${helpers}\n`,
    ));
  }
  for (let index = 0; index < TEST_FILES; index += 1) {
    const target = index * 3;
    writes.push(fs.writeFile(
      path.join(root, "test", `module-${target}.test.ts`),
      `import { reconcileSession${target} } from '../src/module-${target}.js';\n`
        + `test('reconciles orphaned session ${target} after reconnect', () => reconcileSession${target}({ active: true, host: 'web' }));\n`,
    ));
  }
  await Promise.all(writes);
}

function candidateFingerprint(candidates: ContextCandidate[]): string {
  return JSON.stringify(candidates.map(({ path: filePath, score, reasons }) => ({ path: filePath, score, reasons })));
}

async function main(): Promise<void> {
  const iterations = positiveInteger(process.env.CONTEXTPACK_PERF_ITERATIONS, DEFAULT_ITERATIONS, "CONTEXTPACK_PERF_ITERATIONS");
  const limitMs = positiveInteger(process.env.CONTEXTPACK_PERF_LIMIT_MS, DEFAULT_LIMIT_MS, "CONTEXTPACK_PERF_LIMIT_MS");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-perf-"));
  try {
    await createFixture(root);
    await analyzeTask({ root, task: TASK, budget: 12_000, historyCount: 10 });
    const runs: AnalysisTimings[] = [];
    let fingerprint: string | null = null;
    for (let run = 0; run < iterations; run += 1) {
      const manifest = await analyzeTask({ root, task: TASK, budget: 12_000, historyCount: 10 });
      const currentFingerprint = candidateFingerprint(manifest.candidates);
      if (fingerprint !== null && currentFingerprint !== fingerprint) {
        throw new Error("candidate ranking changed between identical performance runs");
      }
      fingerprint = currentFingerprint;
      runs.push(manifest.timings);
    }
    const medians = Object.fromEntries(
      PHASES.map((phase) => [phase, median(runs.map((timings) => timings[phase]))]),
    ) as AnalysisTimings;
    const summary = {
      fixture: { sourceFiles: SOURCE_FILES, task: TASK },
      iterations,
      limitMs,
      medianTimings: medians,
      runs,
    };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (medians.totalMs > limitMs) {
      process.stderr.write(`Performance smoke failed: median ${medians.totalMs} ms exceeds ${limitMs} ms.\n`);
      process.exitCode = 1;
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

await main();
