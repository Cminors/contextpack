import { describe, expect, it } from "vitest";
import type { ContextCandidate } from "../src/types.js";
import { prioritizeCandidates, selectPredictions } from "../src/ranking/predictions.js";

const candidate = (path: string, score: number): ContextCandidate => ({
  path, symbol: null, startLine: 1, endLine: 1, score,
  breakdown: { lexical: 0, symbol: 0, dependency: 0, git: 0, test: 0, rule: 0 },
  selected: false, reasons: [], relationships: [], estimatedTokens: 0,
});

describe("prediction selection", () => {
  it("keeps task predictions diverse without reordering within categories", () => {
    const paths = [
      "test/a.test.ts", "test/b.test.ts", "test/c.test.ts",
      "src/index.ts", "src/feature.ts", "src/helper.ts",
    ];
    const candidates = paths.map((item, index) => candidate(item, 1 - index / 10));
    expect(selectPredictions(candidates, { limit: 4, maxTests: 1, maxBarrels: 1 })).toEqual([
      "test/a.test.ts", "src/index.ts", "src/feature.ts", "src/helper.ts",
    ]);
  });

  it("places the diversified task set first and preserves remaining score order", () => {
    const paths = ["test/a.test.ts", "test/b.test.ts", "src/feature.ts", "src/helper.ts"];
    const candidates = paths.map((item, index) => candidate(item, 1 - index / 10));
    expect(prioritizeCandidates(candidates, { limit: 2, maxTests: 1 }).map((item) => item.path)).toEqual([
      "test/a.test.ts", "src/feature.ts", "test/b.test.ts", "src/helper.ts",
    ]);
  });
});
