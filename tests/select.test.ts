import { describe, expect, it } from "vitest";
import { selectCandidates } from "../src/ranking/select.js";
import type { ContextCandidate, FileAnalysis } from "../src/types.js";

const fileAnalysis = (filePath: string, lineCount = 220): FileAnalysis => ({
  path: filePath,
  absolutePath: filePath,
  language: "typescript",
  content: Array.from({ length: lineCount }, (_, index) => `export const value${index + 1} = ${index + 1};`).join("\n"),
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

const candidate = (
  filePath: string,
  alternateRegions: ContextCandidate["alternateRegions"] = undefined,
): ContextCandidate => ({
  path: filePath,
  symbol: null,
  startLine: 10,
  endLine: 20,
  score: 1,
  breakdown: { lexical: 1, symbol: 0, dependency: 0, git: 0, test: 0, rule: 0 },
  selected: false,
  reasons: ["lexical signal 1.00"],
  relationships: [],
  estimatedTokens: 0,
  ...(alternateRegions ? { alternateRegions } : {}),
});

describe("candidate selection", () => {
  it("preserves primary-only selection order", () => {
    const files = Array.from({ length: 20 }, (_, index) => fileAnalysis(`src/file-${index}.ts`));
    const candidates = files.map((file) => candidate(file.path));

    const selected = selectCandidates(candidates, files, 120_000);

    expect(selected).toHaveLength(16);
    expect(selected.map((item) => item.path)).toEqual(files.slice(0, 16).map((item) => item.path));
  });

  it("emits at most two alternates after preserving primary diversity", () => {
    const files = Array.from({ length: 12 }, (_, index) => fileAnalysis(`src/file-${index}.ts`));
    const candidates = files.map((file, index) => candidate(file.path, index < 2 ? [
      { symbol: null, startLine: 100, endLine: 110 },
      { symbol: null, startLine: 150, endLine: 160 },
    ] : undefined));

    const selected = selectCandidates(candidates, files, 120_000);

    expect(selected.slice(0, 10).map((item) => item.path)).toEqual(files.slice(0, 10).map((item) => item.path));
    expect(selected.slice(10, 12).map((item) => item.path)).toEqual([files[0]?.path, files[0]?.path]);
    expect(selected).toHaveLength(14);
    expect(new Set(selected.map((item) => `${item.path}:${item.startLine}`)).size).toBe(14);
  });

  it("uses spare slots for two alternates when fewer than ten primaries exist", () => {
    const files = Array.from({ length: 8 }, (_, index) => fileAnalysis(`src/file-${index}.ts`));
    const candidates = files.map((file, index) => candidate(file.path, index === 0 ? [
      { symbol: null, startLine: 100, endLine: 110 },
      { symbol: null, startLine: 150, endLine: 160 },
    ] : undefined));

    const selected = selectCandidates(candidates, files, 120_000);

    expect(selected).toHaveLength(10);
    expect(selected.slice(0, 8).map((item) => item.path)).toEqual(files.map((item) => item.path));
    expect(selected.slice(8).map((item) => item.startLine)).toEqual([100, 150]);
  });

  it("skips a secret-containing alternate", () => {
    const file = fileAnalysis("src/secret.ts");
    const lines = file.content.split("\n");
    lines[99] = "const api_key = 'abcdefghijklmnop';";
    file.content = lines.join("\n");
    const selected = selectCandidates([
      candidate(file.path, [{ symbol: null, startLine: 100, endLine: 100 }]),
    ], [file], 12_000);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.startLine).toBe(10);
  });

  it("continues with later primaries when an alternate exceeds the remaining budget", () => {
    const files = Array.from({ length: 11 }, (_, index) => fileAnalysis(`src/file-${index}.ts`));
    const candidates = files.map((file, index) => ({
      ...candidate(file.path, index === 0 ? [{ symbol: null, startLine: 80, endLine: 199 }] : undefined),
      endLine: 10,
    }));

    const selected = selectCandidates(candidates, files, 1_000);

    expect(selected.map((item) => item.path)).toEqual(files.map((item) => item.path));
    expect(selected.some((item) => item.path === files[0]?.path && item.startLine === 80)).toBe(false);
  });

  it("never emits more than 16 snippets or two alternates", () => {
    const files = Array.from({ length: 20 }, (_, index) => fileAnalysis(`src/file-${index}.ts`));
    const candidates = files.map((file) => candidate(file.path, [
      { symbol: null, startLine: 100, endLine: 110 },
      { symbol: null, startLine: 150, endLine: 160 },
    ]));

    const selected = selectCandidates(candidates, files, 120_000);
    const duplicatePaths = selected.length - new Set(selected.map((item) => item.path)).size;

    expect(selected).toHaveLength(16);
    expect(duplicatePaths).toBe(2);
  });
});
