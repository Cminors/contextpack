import { describe, expect, it } from "vitest";
import { aggregateMetrics, commitMetrics, median } from "../src/evaluation/metrics.js";

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
});
