import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { analyzeTask } from "../analysis/analyze.js";
import { ContextPackError } from "../errors.js";
import { runGit } from "../utils/git.js";
import { commitMetrics, median } from "./metrics.js";
import type { IssueBenchmarkInstance, IssueBenchmarkReport, IssueEvaluationResult } from "./issue-types.js";
import { aggregateRegionMetrics, evaluateRegionBudgets } from "./region-metrics.js";
import { readIssueDataset } from "./swebench-dataset.js";

export interface IssueBenchmarkOptions {
  datasetPath: string;
  cacheDirectory: string;
  tokenBudget: number;
  lineBudgets: number[];
  historyCount: number;
  limit?: number;
  instanceId?: string;
  repo?: string;
  onProgress?: (message: string) => void;
}

const mean = (values: number[]): number => values.length === 0
  ? 0
  : values.reduce((sum, value) => sum + value, 0) / values.length;

function assertRepositorySlug(repo: string): void {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new ContextPackError(`Unsafe repository slug: ${repo}`, 2, "INVALID_DATASET");
  }
}

async function ensureBareRepository(cacheDirectory: string, repo: string): Promise<string> {
  assertRepositorySlug(repo);
  await fs.mkdir(cacheDirectory, { recursive: true });
  const target = path.join(cacheDirectory, `${repo.replace("/", "__")}.git`);
  try {
    const stat = await fs.stat(target);
    if (!stat.isDirectory()) throw new Error("not a directory");
  } catch {
    const initialized = runGit(cacheDirectory, ["init", "--bare", target]);
    if (!initialized.ok) throw new ContextPackError(`Cannot initialize repository cache: ${initialized.stderr}`, 3, "GIT_CACHE_FAILED");
    const remote = runGit(target, ["remote", "add", "origin", `https://github.com/${repo}.git`]);
    if (!remote.ok) throw new ContextPackError(`Cannot configure repository cache: ${remote.stderr}`, 3, "GIT_CACHE_FAILED");
  }
  const remote = runGit(target, ["remote", "get-url", "origin"]);
  if (!remote.ok || remote.stdout !== `https://github.com/${repo}.git`) {
    throw new ContextPackError(`Repository cache remote mismatch for ${repo}.`, 3, "GIT_CACHE_MISMATCH");
  }
  return target;
}

async function checkoutInstance(
  cacheDirectory: string,
  instance: IssueBenchmarkInstance,
  historyCount: number,
): Promise<{ root: string; cache: string }> {
  const cache = await ensureBareRepository(cacheDirectory, instance.repo);
  const available = runGit(cache, ["cat-file", "-e", `${instance.baseCommit}^{commit}`]);
  if (!available.ok) {
    const fetched = runGit(cache, [
      "fetch",
      "--no-tags",
      `--depth=${Math.max(1, historyCount)}`,
      "origin",
      instance.baseCommit,
    ]);
    if (!fetched.ok) {
      throw new ContextPackError(`Cannot fetch ${instance.repo}@${instance.baseCommit}: ${fetched.stderr}`, 3, "GIT_FETCH_FAILED");
    }
  }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-issue-"));
  const added = runGit(cache, ["worktree", "add", "--detach", root, instance.baseCommit]);
  if (!added.ok) {
    await fs.rm(root, { recursive: true, force: true });
    throw new ContextPackError(`Cannot create benchmark checkout: ${added.stderr}`, 3, "GIT_WORKTREE_FAILED");
  }
  return { root, cache };
}

async function evaluateInstance(
  instance: IssueBenchmarkInstance,
  options: IssueBenchmarkOptions,
): Promise<IssueEvaluationResult> {
  const checkout = await checkoutInstance(options.cacheDirectory, instance, options.historyCount);
  try {
    const started = performance.now();
    // Gold regions are deliberately not passed to analysis. They are consumed
    // only after predictions have been produced to prevent label leakage.
    const manifest = await analyzeTask({
      root: checkout.root,
      task: instance.issueText,
      budget: options.tokenBudget,
      historyCount: options.historyCount,
    });
    const predictions = manifest.candidates.slice(0, 20).map((candidate) => candidate.path);
    const predictedRegions = manifest.selected.map((selection) => ({
      path: selection.path,
      startLine: selection.startLine,
      endLine: selection.endLine,
    }));
    const goldFiles = [...new Set(instance.goldRegions.map((region) => region.path))];
    const fileMetrics = commitMetrics(goldFiles, predictions);
    return {
      instanceId: instance.instanceId,
      repo: instance.repo,
      baseCommit: instance.baseCommit,
      goldRegions: instance.goldRegions,
      predictedRegions,
      goldFiles,
      predictions,
      recallAt5: fileMetrics.recallAt5,
      recallAt10: fileMetrics.recallAt10,
      reciprocalRank: fileMetrics.reciprocalRank,
      regionMetrics: evaluateRegionBudgets(instance.goldRegions, predictedRegions, options.lineBudgets),
      estimatedTokens: manifest.budget.estimatedTokens,
      durationMs: Math.round(performance.now() - started),
    };
  } finally {
    runGit(checkout.cache, ["worktree", "remove", "--force", checkout.root]);
    await fs.rm(checkout.root, { recursive: true, force: true });
  }
}

function selectInstances(instances: IssueBenchmarkInstance[], options: IssueBenchmarkOptions): IssueBenchmarkInstance[] {
  let selected = instances;
  if (options.instanceId) selected = selected.filter((instance) => instance.instanceId === options.instanceId);
  if (options.repo) selected = selected.filter((instance) => instance.repo === options.repo);
  if (options.limit !== undefined) selected = selected.slice(0, options.limit);
  if (selected.length === 0) throw new ContextPackError("No issue instances matched the requested filters.", 2, "NO_MATCHING_INSTANCES");
  return selected;
}

export async function runIssueBenchmark(options: IssueBenchmarkOptions): Promise<IssueBenchmarkReport> {
  const lineBudgets = [...new Set(options.lineBudgets)].sort((left, right) => left - right);
  if (lineBudgets.length === 0 || lineBudgets.some((budget) => !Number.isInteger(budget) || budget < 1)) {
    throw new ContextPackError("Issue benchmark line budgets must be positive integers.", 2, "INVALID_LINE_BUDGETS");
  }
  const normalizedOptions: IssueBenchmarkOptions = { ...options, lineBudgets };
  const allInstances = await readIssueDataset(options.datasetPath);
  const instances = selectInstances(allInstances, normalizedOptions);
  const sourceDataset = instances[0]?.sourceDataset ?? "unknown";
  const sourceRevision = instances[0]?.sourceRevision ?? "unknown";
  if (instances.some((instance) => instance.sourceDataset !== sourceDataset || instance.sourceRevision !== sourceRevision)) {
    throw new ContextPackError("Mixed dataset sources are not supported in one report.", 2, "MIXED_DATASET");
  }
  const results: IssueEvaluationResult[] = [];
  const skipped: IssueBenchmarkReport["skipped"] = [];
  for (const [index, instance] of instances.entries()) {
    normalizedOptions.onProgress?.(`[${index + 1}/${instances.length}] ${instance.instanceId}`);
    try {
      results.push(await evaluateInstance(instance, normalizedOptions));
    } catch (error) {
      skipped.push({
        instanceId: instance.instanceId,
        reason: error instanceof Error ? error.message : String(error),
      });
      normalizedOptions.onProgress?.(`[${index + 1}/${instances.length}] skipped: ${instance.instanceId}`);
    }
  }
  if (results.length === 0) throw new ContextPackError("Every issue benchmark instance failed.", 4, "NO_VALID_INSTANCES");
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceDataset,
    sourceRevision,
    requestedInstances: instances.length,
    validInstances: results.length,
    tokenBudget: options.tokenBudget,
    lineBudgets,
    results,
    skipped,
    aggregate: {
      recallAt5: mean(results.map((result) => result.recallAt5)),
      recallAt10: mean(results.map((result) => result.recallAt10)),
      mrr: mean(results.map((result) => result.reciprocalRank)),
      medianTokens: median(results.map((result) => result.estimatedTokens)),
      medianDurationMs: median(results.map((result) => result.durationMs)),
      regionMetrics: aggregateRegionMetrics(results, lineBudgets),
    },
    limitations: [
      "Gold regions are old-side unified-diff hunks, not human-authored context annotations.",
      "Insertion-only hunks are represented by a one-line anchor in the base checkout.",
      "Only existing JavaScript and TypeScript patch files are scored; new and unsupported files are excluded.",
      "Retrieval quality does not measure whether an agent can produce a correct patch or pass tests.",
    ],
  };
}
