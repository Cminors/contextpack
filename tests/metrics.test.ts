import { describe, expect, it } from "vitest";
import { aggregateMetrics, commitMetrics, median } from "../src/evaluation/metrics.js";
import type { EvaluationCommitResult } from "../src/types.js";

describe("evaluation metrics", () => {
  it("calculates recall, reciprocal rank, noise, and test recall", () => {
    expect(commitMetrics(["src/auth.ts", "src/auth.test.ts"], ["src/other.ts", "src/auth.ts", "src/auth.test.ts"])).toEqual({
      recallAt5: 1,
      recallAt10: 1,
      reciprocalRank: 0.5,
      noiseAt10: 1 / 3,
      testRecall: 1,
    });
  });

  it("handles medians and nullable test metrics", () => {
    expect(median([3, 1, 2, 4])).toBe(2.5);
    expect(aggregateMetrics([])).toMatchObject({ recallAt5: 0, testRecall: null, medianTokens: 0 });
  });

  it("returns zero when no gold file is retrieved", () => {
    expect(commitMetrics(["src/auth.ts"], ["src/other.ts"])).toMatchObject({
      recallAt5: 0,
      reciprocalRank: 0,
      noiseAt10: 1,
      testRecall: null,
    });
  });

  it("aggregates analysis phases separately from rendering and end-to-end time", () => {
    const result: EvaluationCommitResult = {
      hash: "abc",
      title: "add auth",
      query: "add auth",
      redactedIdentifiers: [],
      goldFiles: ["src/auth.ts"],
      predictions: ["src/auth.ts"],
      recallAt5: 1,
      recallAt10: 1,
      reciprocalRank: 1,
      noiseAt10: 0,
      testRecall: null,
      estimatedTokens: 100,
      durationMs: 30,
      renderDurationMs: 4,
      analysisTimings: {
        discoverMs: 2,
        fileAnalysisMs: 5,
        gitHistoryMs: 3,
        initialRankingMs: 4,
        semanticEnrichmentMs: 6,
        rerankingMs: 7,
        selectionMs: 1,
        totalMs: 28,
      },
    };
    expect(aggregateMetrics([result])).toMatchObject({
      medianDurationMs: 30,
      medianAnalysisDurationMs: 28,
      medianRenderDurationMs: 4,
      medianPhaseDurationsMs: { fileAnalysisMs: 5, rerankingMs: 7, totalMs: 28 },
    });
  });
});
