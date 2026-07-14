import { describe, expect, it } from "vitest";
import { auditIssueFailures } from "../src/evaluation/issue-audit.js";
import type { IssueBenchmarkReport, IssueEvaluationResult } from "../src/evaluation/issue-types.js";
import { renderIssueAudit } from "../src/output/markdown.js";

function result(
  instanceId: string,
  repo: string,
  goldFile: string,
  predictions: string[],
  firstUsefulHit: number | null,
): IssueEvaluationResult {
  return {
    instanceId,
    repo,
    baseCommit: "a".repeat(40),
    goldRegions: [{ path: goldFile, startLine: 10, endLine: 12, kind: "patch-hunk" }],
    predictedRegions: [],
    goldFiles: [goldFile],
    predictions,
    recallAt5: 0,
    recallAt10: 0,
    reciprocalRank: 0,
    regionMetrics: {
      "500": {
        budgetLines: 500,
        emittedLines: 100,
        coveredGoldLines: firstUsefulHit === null ? 0 : 3,
        linePrecision: 0,
        lineRecall: 0,
        lineF1: 0,
        hitRegionRate: 0,
        noiseRegionRate: 0,
        contextEfficiency: 0,
        ndcg: 0,
        firstUsefulHit,
      },
    },
    estimatedTokens: 100,
    durationMs: 10,
  };
}

function report(results: IssueEvaluationResult[]): IssueBenchmarkReport {
  return {
    version: 1,
    generatedAt: "2026-07-14T00:00:00.000Z",
    sourceDataset: "fixture/issues",
    sourceRevision: "fixture-v1",
    requestedInstances: results.length,
    validInstances: results.length,
    tokenBudget: 12_000,
    lineBudgets: [100, 500],
    results,
    skipped: [],
    aggregate: {
      recallAt5: 0,
      recallAt10: 0,
      mrr: 0,
      medianTokens: 100,
      medianDurationMs: 10,
      regionMetrics: {},
    },
    limitations: [],
  };
}

describe("issue failure audit", () => {
  it("separates file ranking failures from region localization failures", () => {
    const predictions = Array.from({ length: 20 }, (_, index) => `src/prediction-${index + 1}.ts`);
    const audit = auditIssueFailures(report([
      result("fixture-1", "example/one", predictions[2]!, predictions, 8),
      result("fixture-2", "example/one", predictions[4]!, predictions, null),
      result("fixture-3", "example/two", predictions[14]!, predictions, null),
      result("fixture-4", "example/two", "src/missing.ts", predictions, null),
    ]));

    expect(audit.counts).toEqual({
      fileHitRegionHit: 1,
      fileHitRegionMiss: 1,
      fileMissRank11To20: 1,
      fileMissOutsideTop20: 1,
      fileRankingMisses: 2,
      regionLocalizationMisses: 1,
    });
    expect(audit.entries.map((entry) => entry.category)).toEqual([
      "file-hit-region-hit",
      "file-hit-region-miss",
      "file-miss-rank-11-20",
      "file-miss-outside-top-20",
    ]);
    expect(audit.entries[2]?.goldFiles).toEqual([{ path: "src/prediction-15.ts", rank: 15 }]);
    expect(audit.entries[3]?.goldFiles).toEqual([{ path: "src/missing.ts", rank: null }]);
    expect(audit.byRepository).toEqual([
      {
        repo: "example/one",
        counts: { fileHitRegionHit: 1, fileHitRegionMiss: 1, fileMissRank11To20: 0, fileMissOutsideTop20: 0 },
      },
      {
        repo: "example/two",
        counts: { fileHitRegionHit: 0, fileHitRegionMiss: 0, fileMissRank11To20: 1, fileMissOutsideTop20: 1 },
      },
    ]);
  });

  it("renders the measured stages and states the causal limit", () => {
    const predictions = Array.from({ length: 20 }, (_, index) => `src/prediction-${index + 1}.ts`);
    const markdown = renderIssueAudit(auditIssueFailures(report([
      result("fixture-1", "example/repo", "src/missing.ts", predictions, null),
    ])));

    expect(markdown).toContain("Top-10 file-ranking misses: 1 (100.0%)");
    expect(markdown).toContain("gold file outside top 20");
    expect(markdown).toContain("does not infer an unobserved scoring cause");
  });
});
