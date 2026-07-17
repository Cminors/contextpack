import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runIssueBenchmark } from "../src/evaluation/issues.js";
import type { IssueBenchmarkInstance } from "../src/evaluation/issue-types.js";
import { readIssueDataset } from "../src/evaluation/swebench-dataset.js";
import { renderIssueEvaluation } from "../src/output/markdown.js";
import { gitStatusFingerprint } from "../src/utils/git.js";

const created: string[] = [];

function git(root: string, args: string[]): string {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

afterEach(async () => Promise.all(created.splice(0).map((item) => fs.rm(item, {
  recursive: true,
  force: true,
  maxRetries: 5,
  retryDelay: 100,
}))));

async function fixture(): Promise<{ root: string; dataset: string; cache: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-issues-test-"));
  created.push(root);
  const source = path.join(root, "source");
  const cache = path.join(root, "cache");
  await fs.mkdir(path.join(source, "src"), { recursive: true });
  git(source, ["init", "-q"]);
  git(source, ["config", "user.email", "contextpack@example.test"]);
  git(source, ["config", "user.name", "ContextPack Test"]);
  await fs.writeFile(path.join(source, "package.json"), JSON.stringify({ name: "fixture" }));
  await fs.writeFile(
    path.join(source, "src", "timeout.ts"),
    "export function timeoutErrorMessage() {\n  return 'timed out';\n}\n",
  );
  git(source, ["add", "."]);
  git(source, ["commit", "-qm", "initial timeout implementation"]);
  const commit = git(source, ["rev-parse", "HEAD"]);
  await fs.mkdir(cache, { recursive: true });
  const bare = path.join(cache, "example__fixture.git");
  git(cache, ["clone", "--bare", source, bare]);
  git(bare, ["remote", "set-url", "origin", "https://github.com/example/fixture.git"]);
  const instance: IssueBenchmarkInstance = {
    instanceId: "example__fixture-1",
    sourceDataset: "fixture/issues",
    sourceRevision: "fixture-v1",
    repo: "example/fixture",
    baseCommit: commit,
    issueText: "Fix the timeout error message",
    language: "javascript-typescript",
    goldRegions: [{ path: "src/timeout.ts", startLine: 1, endLine: 3, kind: "patch-hunk" }],
    metadata: {
      issueUrl: null,
      prUrl: null,
      createdAt: null,
      patchSha256: "0".repeat(64),
      excludedPatchFiles: 0,
    },
  };
  const dataset = path.join(root, "issues.jsonl");
  await fs.writeFile(dataset, `${JSON.stringify(instance)}\n`);
  return { root: source, dataset, cache };
}

describe("real issue benchmark", () => {
  it("evaluates an existing cached base commit without changing the source workspace", async () => {
    const data = await fixture();
    const checkpoint = path.join(path.dirname(data.dataset), "checkpoint.json");
    const before = gitStatusFingerprint(data.root);
    const progress: string[] = [];
    const report = await runIssueBenchmark({
      datasetPath: data.dataset,
      cacheDirectory: data.cache,
      tokenBudget: 4000,
      lineBudgets: [2, 10],
      historyCount: 1,
      checkpointPath: checkpoint,
      onProgress: (message) => progress.push(message),
    });
    expect(report).toMatchObject({
      version: 1,
      sourceDataset: "fixture/issues",
      validInstances: 1,
      requestedInstances: 1,
      aggregate: { recallAt5: 1, recallAt10: 1, mrr: 1 },
    });
    expect(report.results[0]?.candidateDiagnostics?.goldCandidates).toEqual([
      expect.objectContaining({ path: "src/timeout.ts", finalRank: 1, scoreRank: 1 }),
    ]);
    expect(report.results[0]?.candidateDiagnostics?.topCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "src/timeout.ts", finalRank: 1, scoreRank: 1 }),
    ]));
    expect(report.aggregate.regionMetrics["10"]).toMatchObject({
      lineRecall: 1,
      usefulHitRate: 1,
      medianFirstUsefulHit: 1,
    });
    expect(renderIssueEvaluation(report)).toContain("ContextPack Issue Retrieval Benchmark");
    expect(progress).toEqual(["[1/1] example__fixture-1"]);
    const saved = JSON.parse(await fs.readFile(checkpoint, "utf8")) as { results: unknown[]; skipped: unknown[] };
    expect(saved).toMatchObject({ version: 1, results: [{ instanceId: "example__fixture-1" }], skipped: [] });

    const legacyCheckpoint = JSON.parse(await fs.readFile(checkpoint, "utf8")) as {
      results: Array<{ candidateDiagnostics?: { topCandidates: Array<Record<string, unknown>>; goldCandidates: Array<Record<string, unknown>> } }>;
    };
    for (const diagnostic of [
      ...(legacyCheckpoint.results[0]?.candidateDiagnostics?.topCandidates ?? []),
      ...(legacyCheckpoint.results[0]?.candidateDiagnostics?.goldCandidates ?? []),
    ]) {
      delete diagnostic.scoreState;
      delete diagnostic.nonFiniteSignals;
    }
    await fs.writeFile(checkpoint, `${JSON.stringify(legacyCheckpoint, null, 2)}\n`);

    await fs.rm(data.cache, { recursive: true, force: true });
    const resumeProgress: string[] = [];
    const resumed = await runIssueBenchmark({
      datasetPath: data.dataset,
      cacheDirectory: data.cache,
      tokenBudget: 4000,
      lineBudgets: [2, 10],
      historyCount: 1,
      checkpointPath: checkpoint,
      resume: true,
      onProgress: (message) => resumeProgress.push(message),
    });
    expect(resumed.results).toEqual(report.results);
    expect(resumeProgress).toEqual(["Resumed checkpoint: 1/1 completed"]);
    expect(gitStatusFingerprint(data.root)).toBe(before);
  }, 30_000);

  it("rejects filters and malformed JSONL before repository evaluation", async () => {
    const data = await fixture();
    await expect(runIssueBenchmark({
      datasetPath: data.dataset,
      cacheDirectory: data.cache,
      tokenBudget: 4000,
      lineBudgets: [100],
      historyCount: 1,
      instanceId: "missing",
    })).rejects.toMatchObject({ code: "NO_MATCHING_INSTANCES" });
    const malformed = path.join(path.dirname(data.dataset), "malformed.jsonl");
    await fs.writeFile(malformed, "{not-json}\n");
    await expect(readIssueDataset(malformed)).rejects.toMatchObject({ code: "INVALID_DATASET" });
  });

  it("normalizes line budget ordering and rejects empty budgets", async () => {
    const data = await fixture();
    const report = await runIssueBenchmark({
      datasetPath: data.dataset,
      cacheDirectory: data.cache,
      tokenBudget: 4000,
      lineBudgets: [10, 2, 10],
      historyCount: 1,
    });
    expect(report.lineBudgets).toEqual([2, 10]);
    await expect(runIssueBenchmark({
      datasetPath: data.dataset,
      cacheDirectory: data.cache,
      tokenBudget: 4000,
      lineBudgets: [],
      historyCount: 1,
    })).rejects.toMatchObject({ code: "INVALID_LINE_BUDGETS" });
    await expect(runIssueBenchmark({
      datasetPath: data.dataset,
      cacheDirectory: data.cache,
      tokenBudget: 4000,
      lineBudgets: [10],
      historyCount: 1,
      instanceTimeoutMs: 0,
    })).rejects.toMatchObject({ code: "INVALID_INSTANCE_TIMEOUT" });
    await expect(runIssueBenchmark({
      datasetPath: data.dataset,
      cacheDirectory: data.cache,
      tokenBudget: 4000,
      lineBudgets: [10],
      historyCount: 1,
      gitTimeoutMs: 0,
    })).rejects.toMatchObject({ code: "INVALID_GIT_TIMEOUT" });
    await expect(runIssueBenchmark({
      datasetPath: data.dataset,
      cacheDirectory: data.cache,
      tokenBudget: 4000,
      lineBudgets: [10],
      historyCount: 1,
      resume: true,
    })).rejects.toMatchObject({ code: "CHECKPOINT_REQUIRED" });
    await expect(runIssueBenchmark({
      datasetPath: data.dataset,
      cacheDirectory: data.cache,
      tokenBudget: 4000,
      lineBudgets: [10],
      historyCount: 1,
      retrySkipped: true,
    })).rejects.toMatchObject({ code: "RESUME_REQUIRED" });
  }, 30_000);

  it("rejects a checkpoint from a different run configuration", async () => {
    const data = await fixture();
    const checkpoint = path.join(path.dirname(data.dataset), "mismatched-checkpoint.json");
    await fs.writeFile(checkpoint, JSON.stringify({
      version: 1,
      updatedAt: new Date(0).toISOString(),
      datasetFingerprint: "wrong",
      sourceDataset: "fixture/issues",
      sourceRevision: "fixture-v1",
      requestedInstanceIds: ["example__fixture-1"],
      tokenBudget: 4000,
      lineBudgets: [10],
      historyCount: 1,
      results: [],
      skipped: [],
    }));
    await expect(runIssueBenchmark({
      datasetPath: data.dataset,
      cacheDirectory: data.cache,
      tokenBudget: 4000,
      lineBudgets: [10],
      historyCount: 1,
      checkpointPath: checkpoint,
      resume: true,
    })).rejects.toMatchObject({ code: "CHECKPOINT_MISMATCH" });
  }, 30_000);

  it("records hard timeouts and can retry skipped instances on resume", async () => {
    const data = await fixture();
    const checkpoint = path.join(path.dirname(data.dataset), "timeout-checkpoint.json");
    await expect(runIssueBenchmark({
      datasetPath: data.dataset,
      cacheDirectory: data.cache,
      tokenBudget: 4000,
      lineBudgets: [10],
      historyCount: 1,
      checkpointPath: checkpoint,
      instanceTimeoutMs: 1,
    })).rejects.toMatchObject({
      code: "NO_VALID_INSTANCES",
      message: expect.stringContaining("timed out"),
    });
    const timedOut = JSON.parse(await fs.readFile(checkpoint, "utf8")) as {
      results: unknown[];
      skipped: Array<{ instanceId: string; reason: string }>;
    };
    expect(timedOut.results).toEqual([]);
    expect(timedOut.skipped).toEqual([expect.objectContaining({
      instanceId: "example__fixture-1",
      reason: expect.stringContaining("timed out"),
    })]);

    const retried = await runIssueBenchmark({
      datasetPath: data.dataset,
      cacheDirectory: data.cache,
      tokenBudget: 4000,
      lineBudgets: [10],
      historyCount: 1,
      checkpointPath: checkpoint,
      instanceTimeoutMs: 30_000,
      resume: true,
      retrySkipped: true,
    });
    expect(retried).toMatchObject({ validInstances: 1, skipped: [] });
  }, 60_000);
});
