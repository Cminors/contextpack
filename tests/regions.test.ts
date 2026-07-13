import { describe, expect, it } from "vitest";
import { locateContentRegion, REGION_LIMITS } from "../src/ranking/regions.js";
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
