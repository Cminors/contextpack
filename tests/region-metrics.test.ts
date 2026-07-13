import { describe, expect, it } from "vitest";
import { aggregateRegionMetrics, evaluateRegionBudgets, regionMetrics, regionsWithinBudget } from "../src/evaluation/region-metrics.js";
import type { GoldPatchRegion, IssueEvaluationResult } from "../src/evaluation/issue-types.js";

const gold: GoldPatchRegion[] = [
  { path: "src/a.ts", startLine: 10, endLine: 12, kind: "patch-hunk" },
  { path: "src/b.ts", startLine: 1, endLine: 1, kind: "patch-hunk" },
];

describe("line-budget region metrics", () => {
  it("truncates the last region at the exact emitted-line budget", () => {
    expect(regionsWithinBudget([
      { path: "src/a.ts", startLine: 1, endLine: 3 },
      { path: "src/b.ts", startLine: 10, endLine: 20 },
    ], 5)).toEqual([
      { path: "src/a.ts", startLine: 1, endLine: 3 },
      { path: "src/b.ts", startLine: 10, endLine: 11 },
    ]);
  });

  it("scores exact line coverage, region noise, ranking, and first hit", () => {
    const metrics = regionMetrics(gold, [
      { path: "src/noise.ts", startLine: 1, endLine: 2 },
      { path: "src/a.ts", startLine: 9, endLine: 11 },
      { path: "src/b.ts", startLine: 1, endLine: 1 },
    ], 4);
    expect(metrics).toMatchObject({
      emittedLines: 4,
      coveredGoldLines: 1,
      linePrecision: 0.25,
      lineRecall: 0.25,
      lineF1: 0.25,
      hitRegionRate: 0.5,
      noiseRegionRate: 0.5,
      contextEfficiency: 0.25,
      firstUsefulHit: 4,
    });
    expect(metrics.ndcg).toBeGreaterThan(0);
    expect(metrics.ndcg).toBeLessThan(1);
  });

  it("returns keyed metrics for every declared budget", () => {
    expect(Object.keys(evaluateRegionBudgets(gold, [{ path: "src/b.ts", startLine: 1, endLine: 1 }], [1, 100]))).toEqual(["1", "100"]);
  });

  it("aggregates successful and missed first hits", () => {
    const base: Omit<IssueEvaluationResult, "instanceId" | "regionMetrics"> = {
      repo: "example/repo",
      baseCommit: "1234567",
      goldRegions: gold,
      predictedRegions: [],
      goldFiles: ["src/a.ts", "src/b.ts"],
      predictions: [],
      recallAt5: 0,
      recallAt10: 0,
      reciprocalRank: 0,
      estimatedTokens: 10,
      durationMs: 1,
    };
    const results: IssueEvaluationResult[] = [
      { ...base, instanceId: "hit", regionMetrics: evaluateRegionBudgets(gold, [{ path: "src/a.ts", startLine: 10, endLine: 10 }], [10]) },
      { ...base, instanceId: "miss", regionMetrics: evaluateRegionBudgets(gold, [{ path: "src/noise.ts", startLine: 1, endLine: 1 }], [10]) },
    ];
    expect(aggregateRegionMetrics(results, [10])["10"]).toMatchObject({
      usefulHitRate: 0.5,
      medianFirstUsefulHit: 1,
    });
  });
});
