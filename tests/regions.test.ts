import { describe, expect, it } from "vitest";
import {
  locateContentRegion,
  locateTopRegionCandidates,
  locateTopRegions,
  REGION_LIMITS,
} from "../src/ranking/regions.js";
import type { FileAnalysis } from "../src/types.js";

const sourceFile = (lineCount = 500): FileAnalysis => ({
  path: "src/handler.ts",
  absolutePath: "src/handler.ts",
  language: "typescript",
  content: Array.from({ length: lineCount }, () => "").join("\n"),
  lineCount,
  imports: [],
  importedBy: [],
  references: [],
  referencedBy: [],
  referenceSymbols: {},
  symbols: [],
  isTest: false,
  isConfig: false,
  packageDirectory: ".",
});

describe("content region localization", () => {
  it("selects the strongest multi-term evidence cluster", () => {
    const region = locateContentRegion(sourceFile(), [
      { term: "timeout", field: "comment", line: 40 },
      { term: "timeout", field: "identifier", line: 420 },
      { term: "message", field: "string", line: 425 },
      { term: "exceeded", field: "string", line: 426 },
    ]);
    expect(region?.startLine).toBeLessThanOrEqual(420);
    expect(region?.endLine).toBeGreaterThanOrEqual(426);
    expect(region?.startLine).toBeGreaterThan(300);
  });

  it("prefers a dense task-specific cluster over more diffuse generic matches", () => {
    const region = locateContentRegion(sourceFile(), [
      { term: "axios", field: "comment", line: 14, relevance: 0.2 },
      { term: "config", field: "comment", line: 25, relevance: 0.2 },
      { term: "error", field: "identifier", line: 38, relevance: 0.2 },
      { term: "version", field: "identifier", line: 52, relevance: 0.2 },
      { term: "exact", field: "comment", line: 67, relevance: 0.2 },
      { term: "adapter", field: "identifier", line: 84, relevance: 0.2 },
      { term: "timeout", field: "comment", line: 400, relevance: 0.9 },
      { term: "timeout", field: "identifier", line: 420, relevance: 0.9 },
      { term: "connection", field: "comment", line: 417, relevance: 0.5 },
      { term: "exceeded", field: "string", line: 425, relevance: 0.7 },
      { term: "ms", field: "string", line: 425, relevance: 0.4 },
    ]);
    expect(region?.startLine).toBeLessThanOrEqual(400);
    expect(region?.endLine).toBeGreaterThanOrEqual(425);
  });

  it("uses a containing symbol when all evidence belongs to it", () => {
    const file = sourceFile(200);
    file.symbols = [{
      name: "handleTimeout",
      kind: "function",
      startLine: 80,
      endLine: 130,
      exported: false,
      text: "",
    }];
    const region = locateContentRegion(file, [
      { term: "timeout", field: "identifier", line: 101 },
      { term: "message", field: "string", line: 106 },
    ]);
    expect(region?.symbol?.name).toBe("handleTimeout");
    expect(region).toMatchObject({ startLine: 95, endLine: 112 });
  });

  it("caps a region inside a large symbol while retaining the evidence", () => {
    const file = sourceFile(800);
    file.symbols = [{
      name: "dispatch",
      kind: "function",
      startLine: 10,
      endLine: 700,
      exported: true,
      text: "",
    }];
    const region = locateContentRegion(file, [
      { term: "encoding", field: "string", line: 471 },
      { term: "header", field: "identifier", line: 477 },
    ]);
    expect((region?.endLine ?? 0) - (region?.startLine ?? 1) + 1).toBeLessThanOrEqual(REGION_LIMITS.maxLines);
    expect(region?.startLine).toBeLessThanOrEqual(471);
    expect(region?.endLine).toBeGreaterThanOrEqual(477);
  });

  it("returns no region for invalid or empty evidence", () => {
    expect(locateContentRegion(sourceFile(), [])).toBeNull();
    expect(locateContentRegion(sourceFile(), [{ term: "timeout", field: "comment", line: 0 }])).toBeNull();
  });
});

describe("multi-region localization", () => {
  it("returns deterministic non-overlapping region candidates", () => {
    const candidates = locateTopRegionCandidates(sourceFile(), [
      { term: "timeout", field: "comment", line: 48, relevance: 0.9 },
      { term: "message", field: "string", line: 50, relevance: 0.8 },
      { term: "exceeded", field: "identifier", line: 52, relevance: 0.7 },
      { term: "connection", field: "comment", line: 348, relevance: 0.6 },
      { term: "socket", field: "identifier", line: 350, relevance: 0.5 },
      { term: "closed", field: "string", line: 352, relevance: 0.4 },
    ], 3);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({ startLine: 42, endLine: 58, distinctTerms: 3 });
    expect(candidates[1]).toMatchObject({ startLine: 342, endLine: 358, distinctTerms: 3 });
    expect(candidates[0]?.evidence.map((item) => item.line)).toEqual([48, 50, 52]);
    expect(candidates[1]?.evidence.map((item) => item.line)).toEqual([348, 350, 352]);
  });

  it("consumes an overlapping cluster and continues to a later region", () => {
    const candidates = locateTopRegionCandidates(sourceFile(), [
      { term: "primary", field: "comment", line: 100, relevance: 0.9 },
      { term: "anchor", field: "identifier", line: 110, relevance: 0.8 },
      { term: "overlap", field: "comment", line: 122, relevance: 0.7 },
      { term: "nearby", field: "identifier", line: 125, relevance: 0.6 },
      { term: "later", field: "comment", line: 300, relevance: 0.5 },
      { term: "region", field: "identifier", line: 303, relevance: 0.4 },
    ], 3);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({ startLine: 94, endLine: 116 });
    expect(candidates[1]).toMatchObject({ startLine: 294, endLine: 309 });
  });

  it("returns no regions for a non-positive limit", () => {
    const evidence = [{ term: "timeout", field: "comment" as const, line: 50 }];
    expect(locateTopRegions(sourceFile(), evidence, 0)).toEqual([]);
    expect(locateTopRegions(sourceFile(), evidence, -1)).toEqual([]);
  });

  it("does not create duplicate regions from duplicate or invalid evidence", () => {
    const evidence = [
      { term: "timeout", field: "comment" as const, line: 50, relevance: 0.9 },
      { term: "timeout", field: "comment" as const, line: 50, relevance: 0.9 },
      { term: "message", field: "string" as const, line: 52, relevance: 0.8 },
      { term: "invalid", field: "identifier" as const, line: 0, relevance: 1 },
    ];

    const candidates = locateTopRegionCandidates(sourceFile(), evidence, 3);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.evidence).toHaveLength(2);
  });

  it("keeps the primary region identical to locateContentRegion", () => {
    const file = sourceFile();
    const evidence = [
      { term: "timeout", field: "comment" as const, line: 48, relevance: 0.9 },
      { term: "message", field: "string" as const, line: 52, relevance: 0.8 },
      { term: "other", field: "identifier" as const, line: 350, relevance: 0.7 },
    ];

    expect(locateTopRegions(file, evidence, 1)).toEqual([locateContentRegion(file, evidence)]);
  });
});
