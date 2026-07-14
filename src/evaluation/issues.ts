import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";
import { analyzeTask } from "../analysis/analyze.js";
import { ContextPackError } from "../errors.js";
import type { ContextManifest } from "../types.js";
import { runGit } from "../utils/git.js";
import { commitMetrics, median } from "./metrics.js";
import type {
  IssueBenchmarkCheckpoint,
  IssueBenchmarkInstance,
  IssueBenchmarkReport,
  IssueCandidateDiagnostic,
  IssueCandidateDiagnostics,
  IssueEvaluationResult,
} from "./issue-types.js";
import type { IssueWorkerResponse } from "./issue-worker.js";
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
  instanceTimeoutMs?: number;
  gitTimeoutMs?: number;
  checkpointPath?: string;
  resume?: boolean;
  retrySkipped?: boolean;
  onProgress?: (message: string) => void;
}

const mean = (values: number[]): number => values.length === 0
  ? 0
  : values.reduce((sum, value) => sum + value, 0) / values.length;

function issueWorkerTarget(): URL {
  const sourceMode = import.meta.url.endsWith(".ts");
  return new URL(sourceMode ? "./issue-worker-bootstrap.mjs" : "./issue-worker.js", import.meta.url);
}

async function analyzeTaskIsolated(
  root: string,
  task: string,
  budget: number,
  historyCount: number,
  timeoutMs: number | undefined,
): Promise<ContextManifest> {
  if (timeoutMs === undefined) return analyzeTask({ root, task, budget, historyCount });
  const worker = new Worker(issueWorkerTarget(), {
    workerData: { root, task, budget, historyCount },
  });
  return new Promise<ContextManifest>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      finish(() => {
        const timeoutError = new ContextPackError(
          `Analysis timed out after ${timeoutMs} ms.`,
          4,
          "INSTANCE_TIMEOUT",
        );
        void worker.terminate().then(
          () => reject(timeoutError),
          () => reject(timeoutError),
        );
      });
    }, timeoutMs);
    worker.once("message", (response: IssueWorkerResponse) => {
      finish(() => {
        void worker.terminate();
        if (response.ok) {
          resolve(response.manifest);
        } else {
          reject(new ContextPackError(
            `Isolated issue analysis failed: ${response.message}`,
            3,
            "ISSUE_WORKER_FAILED",
          ));
        }
      });
    });
    worker.once("error", (error) => {
      const message = error instanceof Error ? error.message : String(error);
      finish(() => reject(new ContextPackError(
        `Issue analysis worker failed: ${message}`,
        3,
        "ISSUE_WORKER_FAILED",
      )));
    });
    worker.once("exit", (code) => {
      finish(() => reject(new ContextPackError(
        `Issue analysis worker exited with code ${code} before returning a result.`,
        3,
        "ISSUE_WORKER_FAILED",
      )));
    });
  });
}

function fingerprintInstances(instances: IssueBenchmarkInstance[]): string {
  const stable = instances.map((instance) => ({
    instanceId: instance.instanceId,
    sourceDataset: instance.sourceDataset,
    sourceRevision: instance.sourceRevision,
    repo: instance.repo,
    baseCommit: instance.baseCommit,
    issueText: instance.issueText,
    goldRegions: instance.goldRegions,
    patchSha256: instance.metadata.patchSha256,
  }));
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

function isCheckpoint(value: unknown): value is IssueBenchmarkCheckpoint {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<IssueBenchmarkCheckpoint>;
  return item.version === 1
    && typeof item.updatedAt === "string"
    && typeof item.datasetFingerprint === "string"
    && typeof item.sourceDataset === "string"
    && typeof item.sourceRevision === "string"
    && Array.isArray(item.requestedInstanceIds)
    && item.requestedInstanceIds.every((id) => typeof id === "string")
    && typeof item.tokenBudget === "number"
    && Array.isArray(item.lineBudgets)
    && item.lineBudgets.every((budget) => typeof budget === "number")
    && typeof item.historyCount === "number"
    && Array.isArray(item.results)
    && item.results.every((result) => typeof result === "object" && result !== null && typeof result.instanceId === "string")
    && Array.isArray(item.skipped)
    && item.skipped.every((entry) => typeof entry === "object" && entry !== null
      && typeof entry.instanceId === "string" && typeof entry.reason === "string");
}

async function readCheckpoint(checkpointPath: string): Promise<IssueBenchmarkCheckpoint | null> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(checkpointPath, "utf8"));
    if (!isCheckpoint(parsed)) {
      throw new ContextPackError(`Invalid issue benchmark checkpoint: ${checkpointPath}`, 2, "INVALID_CHECKPOINT");
    }
    for (const result of parsed.results) {
      if (!result.candidateDiagnostics) continue;
      for (const diagnostic of [
        ...result.candidateDiagnostics.topCandidates,
        ...result.candidateDiagnostics.goldCandidates,
      ]) {
        diagnostic.scoreState ??= diagnostic.score === null || diagnostic.breakdown === null
          ? "non-finite"
          : "finite";
        diagnostic.nonFiniteSignals ??= [];
      }
    }
    return parsed;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return null;
    if (error instanceof ContextPackError) throw error;
    throw new ContextPackError(
      `Cannot read issue benchmark checkpoint ${checkpointPath}: ${error instanceof Error ? error.message : String(error)}`,
      2,
      "INVALID_CHECKPOINT",
    );
  }
}

async function writeCheckpoint(checkpointPath: string, checkpoint: IssueBenchmarkCheckpoint): Promise<void> {
  const target = path.resolve(checkpointPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

function assertCheckpointMatches(
  checkpoint: IssueBenchmarkCheckpoint,
  instances: IssueBenchmarkInstance[],
  options: IssueBenchmarkOptions,
  sourceDataset: string,
  sourceRevision: string,
  datasetFingerprint: string,
): void {
  const requestedInstanceIds = instances.map((instance) => instance.instanceId);
  const configurationMatches = checkpoint.datasetFingerprint === datasetFingerprint
    && checkpoint.sourceDataset === sourceDataset
    && checkpoint.sourceRevision === sourceRevision
    && JSON.stringify(checkpoint.requestedInstanceIds) === JSON.stringify(requestedInstanceIds)
    && checkpoint.tokenBudget === options.tokenBudget
    && JSON.stringify(checkpoint.lineBudgets) === JSON.stringify(options.lineBudgets)
    && checkpoint.historyCount === options.historyCount;
  if (!configurationMatches) {
    throw new ContextPackError(
      "Issue benchmark checkpoint does not match the selected dataset or evaluation options.",
      2,
      "CHECKPOINT_MISMATCH",
    );
  }
  const knownIds = new Set(requestedInstanceIds);
  const completedIds = [
    ...checkpoint.results.map((result) => result.instanceId),
    ...checkpoint.skipped.map((entry) => entry.instanceId),
  ];
  if (completedIds.some((id) => !knownIds.has(id)) || new Set(completedIds).size !== completedIds.length) {
    throw new ContextPackError("Issue benchmark checkpoint contains invalid instance results.", 2, "INVALID_CHECKPOINT");
  }
}

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
  gitTimeoutMs: number | undefined,
): Promise<{ root: string; cache: string }> {
  const cache = await ensureBareRepository(cacheDirectory, instance.repo);
  const available = runGit(cache, ["cat-file", "-e", `${instance.baseCommit}^{commit}`]);
  if (!available.ok) {
    const fetched = runGit(cache, [
      "-c",
      "http.lowSpeedLimit=1024",
      "-c",
      "http.lowSpeedTime=60",
      "fetch",
      "--no-tags",
      `--depth=${Math.max(1, historyCount)}`,
      "origin",
      instance.baseCommit,
    ], { ...(gitTimeoutMs === undefined ? {} : { timeoutMs: gitTimeoutMs }) });
    if (!fetched.ok) {
      const detail = fetched.timedOut
        ? `Git fetch timed out after ${gitTimeoutMs} ms.`
        : fetched.stderr;
      throw new ContextPackError(`Cannot fetch ${instance.repo}@${instance.baseCommit}: ${detail}`, 3, "GIT_FETCH_FAILED");
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
  const checkout = await checkoutInstance(
    options.cacheDirectory,
    instance,
    options.historyCount,
    options.gitTimeoutMs,
  );
  try {
    const started = performance.now();
    // Gold regions are deliberately not passed to analysis. They are consumed
    // only after predictions have been produced to prevent label leakage.
    const manifest = await analyzeTaskIsolated(
      checkout.root,
      instance.issueText,
      options.tokenBudget,
      options.historyCount,
      options.instanceTimeoutMs,
    );
    const predictions = manifest.candidates.slice(0, 20).map((candidate) => candidate.path);
    const predictedRegions = manifest.selected.map((selection) => ({
      path: selection.path,
      startLine: selection.startLine,
      endLine: selection.endLine,
    }));
    const goldFiles = [...new Set(instance.goldRegions.map((region) => region.path))];
    const fileMetrics = commitMetrics(goldFiles, predictions);
    const finalRankByPath = new Map(manifest.candidates.map((candidate, index) => [candidate.path, index + 1]));
    const scoreRankByPath = new Map(
      [...manifest.candidates]
        .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
        .map((candidate, index) => [candidate.path, index + 1]),
    );
    const diagnosticFor = (filePath: string): IssueCandidateDiagnostic => {
      const candidate = manifest.candidates.find((item) => item.path === filePath);
      const signalKeys = candidate
        ? Object.keys(candidate.breakdown) as Array<keyof typeof candidate.breakdown>
        : [];
      const nonFiniteSignals = candidate
        ? signalKeys.filter((signal) => !Number.isFinite(candidate.breakdown[signal]))
        : [];
      const finite = candidate !== undefined
        && Number.isFinite(candidate.score)
        && nonFiniteSignals.length === 0;
      return candidate
        ? {
            path: filePath,
            finalRank: finalRankByPath.get(filePath) ?? null,
            scoreRank: scoreRankByPath.get(filePath) ?? null,
            scoreState: finite ? "finite" : "non-finite",
            score: finite ? candidate.score : null,
            breakdown: finite ? candidate.breakdown : null,
            nonFiniteSignals,
            reasons: candidate.reasons,
          }
        : {
            path: filePath,
            finalRank: null,
            scoreRank: null,
            scoreState: "missing",
            score: null,
            breakdown: null,
            nonFiniteSignals: [],
            reasons: [],
          };
    };
    const candidateDiagnostics: IssueCandidateDiagnostics = {
      topCandidates: manifest.candidates.slice(0, 10).map((candidate) => diagnosticFor(candidate.path)),
      goldCandidates: goldFiles.map(diagnosticFor),
    };
    return {
      instanceId: instance.instanceId,
      repo: instance.repo,
      baseCommit: instance.baseCommit,
      goldRegions: instance.goldRegions,
      predictedRegions,
      goldFiles,
      predictions,
      candidateDiagnostics,
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
  if (options.instanceTimeoutMs !== undefined
    && (!Number.isInteger(options.instanceTimeoutMs) || options.instanceTimeoutMs < 1)) {
    throw new ContextPackError("Issue benchmark instance timeout must be a positive integer.", 2, "INVALID_INSTANCE_TIMEOUT");
  }
  if (options.gitTimeoutMs !== undefined
    && (!Number.isInteger(options.gitTimeoutMs) || options.gitTimeoutMs < 1)) {
    throw new ContextPackError("Issue benchmark Git timeout must be a positive integer.", 2, "INVALID_GIT_TIMEOUT");
  }
  if (options.resume && !options.checkpointPath) {
    throw new ContextPackError("Resuming an issue benchmark requires a checkpoint path.", 2, "CHECKPOINT_REQUIRED");
  }
  if (options.retrySkipped && !options.resume) {
    throw new ContextPackError("Retrying skipped instances requires resume mode.", 2, "RESUME_REQUIRED");
  }
  const normalizedOptions: IssueBenchmarkOptions = { ...options, lineBudgets };
  const allInstances = await readIssueDataset(options.datasetPath);
  const instances = selectInstances(allInstances, normalizedOptions);
  const sourceDataset = instances[0]?.sourceDataset ?? "unknown";
  const sourceRevision = instances[0]?.sourceRevision ?? "unknown";
  if (instances.some((instance) => instance.sourceDataset !== sourceDataset || instance.sourceRevision !== sourceRevision)) {
    throw new ContextPackError("Mixed dataset sources are not supported in one report.", 2, "MIXED_DATASET");
  }
  const datasetFingerprint = fingerprintInstances(instances);
  const checkpointPath = options.checkpointPath ? path.resolve(options.checkpointPath) : undefined;
  const results: IssueEvaluationResult[] = [];
  const skipped: IssueBenchmarkReport["skipped"] = [];
  const persistCheckpoint = async (): Promise<void> => {
    if (!checkpointPath) return;
    await writeCheckpoint(checkpointPath, {
      version: 1,
      updatedAt: new Date().toISOString(),
      datasetFingerprint,
      sourceDataset,
      sourceRevision,
      requestedInstanceIds: instances.map((instance) => instance.instanceId),
      tokenBudget: normalizedOptions.tokenBudget,
      lineBudgets,
      historyCount: normalizedOptions.historyCount,
      results,
      skipped,
    });
  };
  if (normalizedOptions.resume && checkpointPath) {
    const checkpoint = await readCheckpoint(checkpointPath);
    if (checkpoint) {
      assertCheckpointMatches(
        checkpoint,
        instances,
        normalizedOptions,
        sourceDataset,
        sourceRevision,
        datasetFingerprint,
      );
      results.push(...checkpoint.results);
      if (!normalizedOptions.retrySkipped) skipped.push(...checkpoint.skipped);
      normalizedOptions.onProgress?.(
        `Resumed checkpoint: ${results.length + skipped.length}/${instances.length} completed`
        + (normalizedOptions.retrySkipped && checkpoint.skipped.length > 0
          ? `; retrying ${checkpoint.skipped.length} skipped`
          : ""),
      );
    } else {
      normalizedOptions.onProgress?.("No checkpoint found; starting a new issue benchmark run.");
    }
  }
  await persistCheckpoint();
  const completed = new Set([
    ...results.map((result) => result.instanceId),
    ...skipped.map((entry) => entry.instanceId),
  ]);
  for (const [index, instance] of instances.entries()) {
    if (completed.has(instance.instanceId)) continue;
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
    await persistCheckpoint();
  }
  const instanceOrder = new Map(instances.map((instance, index) => [instance.instanceId, index]));
  results.sort((left, right) => (instanceOrder.get(left.instanceId) ?? 0) - (instanceOrder.get(right.instanceId) ?? 0));
  skipped.sort((left, right) => (instanceOrder.get(left.instanceId) ?? 0) - (instanceOrder.get(right.instanceId) ?? 0));
  await persistCheckpoint();
  if (results.length === 0) {
    const reasons = skipped.slice(0, 3).map((entry) => `${entry.instanceId}: ${entry.reason}`).join("; ");
    throw new ContextPackError(
      `Every issue benchmark instance failed.${reasons ? ` ${reasons}` : ""}`,
      4,
      "NO_VALID_INSTANCES",
    );
  }
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
