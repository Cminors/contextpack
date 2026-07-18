import { describe, expect, it } from "vitest";
import { classifyRegionCandidates } from "../scripts/diagnose-region-clusters.js";

describe("region cluster diagnostics", () => {
  it("classifies an alternate-only gold overlap as helpful", () => {
    const result = classifyRegionCandidates(
      "src/handler.ts",
      [
        { symbol: null, startLine: 10, endLine: 20, evidence: [], distinctTerms: 2 },
        { symbol: null, startLine: 90, endLine: 110, evidence: [], distinctTerms: 3 },
      ],
      [{ path: "src/handler.ts", startLine: 100, endLine: 104, kind: "patch-hunk" }],
    );

    expect(result).toEqual({
      candidateOverlaps: [false, true],
      primaryOverlapsGold: false,
      alternateOverlapsGold: true,
      alternateHelpful: true,
    });
  });

  it("does not classify an already-correct primary as alternate helpful", () => {
    const result = classifyRegionCandidates(
      "src/handler.ts",
      [
        { symbol: null, startLine: 95, endLine: 105, evidence: [], distinctTerms: 2 },
        { symbol: null, startLine: 190, endLine: 210, evidence: [], distinctTerms: 2 },
      ],
      [{ path: "src/handler.ts", startLine: 100, endLine: 104, kind: "patch-hunk" }],
    );

    expect(result).toMatchObject({
      primaryOverlapsGold: true,
      alternateOverlapsGold: false,
      alternateHelpful: false,
    });
  });

  it("ignores gold regions from other files", () => {
    const result = classifyRegionCandidates(
      "src/handler.ts",
      [
        { symbol: null, startLine: 10, endLine: 20, evidence: [], distinctTerms: 2 },
        { symbol: null, startLine: 90, endLine: 110, evidence: [], distinctTerms: 2 },
      ],
      [{ path: "src/other.ts", startLine: 100, endLine: 104, kind: "patch-hunk" }],
    );

    expect(result).toMatchObject({
      primaryOverlapsGold: false,
      alternateOverlapsGold: false,
      alternateHelpful: false,
    });
  });
});
