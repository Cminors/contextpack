import { describe, expect, it } from "vitest";
import {
  compareIssueParity,
  projectIssueParity,
} from "../src/evaluation/parity.js";
import type {
  IssueBenchmarkReport,
  IssueEvaluationResult,
} from "../src/evaluation/issue-types.js";

const result = (instanceId: string, path: string): IssueEvaluationResult => ({
  instanceId,
  repo: "fixture/repo",
  baseCommit: "a".repeat(40),
  goldRegions: [{ path, startLine: 2, endLine: 4, kind: "patch-hunk" }],
  predictedRegions: [{ path, startLine: 2, endLine: 4 }],
  goldFiles: [path],
  predictions: [path],
  candidateDiagnostics: {
    topCandidates: [],
    goldCandidates: [],
  },
  recallAt5: 1,
  recallAt10: 1,
  reciprocalRank: 1,
  regionMetrics: {
    "500": {
      budgetLines: 500,
      emittedLines: 3,
      coveredGoldLines: 3,
      linePrecision: 1,
      lineRecall: 1,
      lineF1: 1,
      hitRegionRate: 1,
      noiseRegionRate: 0,
      contextEfficiency: 1,
      ndcg: 1,
      firstUsefulHit: 1,
    },
  },
  estimatedTokens: 120,
  durationMs: 10,
});

const report = (overrides: Partial<IssueBenchmarkReport> = {}): IssueBenchmarkReport => ({
  version: 1,
  generatedAt: "2026-07-19T00:00:00.000Z",
  sourceDataset: "fixture/issues.jsonl",
  sourceRevision: "fixture-v1",
  requestedInstances: 2,
  validInstances: 2,
  tokenBudget: 12_000,
  lineBudgets: [100, 250, 500],
  results: [result("fixture-2", "src/b.ts"), result("fixture-1", "src/a.ts")],
  skipped: [
    { instanceId: "fixture-2", reason: "z" },
    { instanceId: "fixture-1", reason: "a" },
  ],
  aggregate: {
    recallAt5: 1,
    recallAt10: 1,
    mrr: 1,
    medianTokens: 120,
    medianDurationMs: 10,
    regionMetrics: {
      "500": {
        budgetLines: 500,
        medianEmittedLines: 3,
        linePrecision: 1,
        lineRecall: 1,
        lineF1: 1,
        hitRegionRate: 1,
        noiseRegionRate: 0,
        contextEfficiency: 1,
        ndcg: 1,
        usefulHitRate: 1,
        medianFirstUsefulHit: 1,
      },
    },
  },
  limitations: ["fixture limitation"],
  ...overrides,
});

describe("issue evaluation parity", () => {
  it("projects semantic fields while sorting instances and skips", () => {
    const projected = projectIssueParity(report());

    expect(projected.results[0]).toMatchObject({
      instanceId: "fixture-1",
      predictions: ["src/a.ts"],
    });
    expect(projected.results.map((item) => item.instanceId)).toEqual(["fixture-1", "fixture-2"]);
    expect(projected.skipped).toEqual([
      { instanceId: "fixture-1", reason: "a" },
      { instanceId: "fixture-2", reason: "z" },
    ]);
    expect(projected).not.toHaveProperty("generatedAt");
    expect(projected.results[0]).not.toHaveProperty("durationMs");
    expect(projected.aggregate).not.toHaveProperty("medianDurationMs");
  });

  it("ignores generated timestamps and timing-only changes", () => {
    const baseline = report();
    const timingOnlyChange = report({
      generatedAt: "2026-07-20T00:00:00.000Z",
      results: baseline.results.map((item) => ({ ...item, durationMs: 9999 })),
      aggregate: { ...baseline.aggregate, medianDurationMs: 9999 },
    });

    expect(compareIssueParity(baseline, timingOnlyChange)).toEqual([]);
  });

  it("reports changed predictions, regions, and aggregate metrics", () => {
    const baseline = report();
    const changedPrediction = report({
      results: baseline.results.map((item) => item.instanceId === "fixture-1"
        ? { ...item, predictions: ["src/changed.ts"] }
        : item),
    });
    const changedRegion = report({
      results: baseline.results.map((item) => item.instanceId === "fixture-1"
        ? { ...item, predictedRegions: [{ path: "src/changed.ts", startLine: 1, endLine: 1 }] }
        : item),
    });
    const changedAggregate = report({
      aggregate: { ...baseline.aggregate, recallAt10: 0.5 },
    });

    expect(compareIssueParity(baseline, changedPrediction)).toContain("results[fixture-1].predictions");
    expect(compareIssueParity(baseline, changedRegion)).toContain("results[fixture-1].predictedRegions");
    expect(compareIssueParity(baseline, changedAggregate)).toContain("aggregate.recallAt10");
  });
});
