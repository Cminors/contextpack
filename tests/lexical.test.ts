import { describe, expect, it } from "vitest";
import type { FileAnalysis } from "../src/types.js";
import {
  extractLexicalDocument,
  LEXICAL_LIMITS,
  scoreContentMatches,
} from "../src/ranking/lexical.js";
import { normalizeTaskTerms } from "../src/utils/task-terms.js";

const sourceFile = (path: string, content: string, isTest = false): FileAnalysis => ({
  path,
  absolutePath: path,
  language: "typescript",
  content,
  lineCount: content.split(/\r?\n/).length,
  imports: [],
  importedBy: [],
  references: [],
  referencedBy: [],
  referenceSymbols: {},
  symbols: [],
  isTest,
  isConfig: false,
  packageDirectory: ".",
});

describe("source content retrieval", () => {
  it("extracts identifiers, comments, strings, and test titles with line evidence", () => {
    const document = extractLexicalDocument(
      [
        "// Reject malformed payloads before dispatch.",
        "const validationMessage = 'structured error response';",
        "test('returns validation details', () => true);",
      ].join("\n"),
      "validation.test.ts",
    );
    expect(document.occurrences).toContainEqual({ term: "malformed", field: "comment", line: 1 });
    expect(document.occurrences).toContainEqual({ term: "message", field: "identifier", line: 2 });
    expect(document.occurrences).toContainEqual({ term: "structured", field: "string", line: 2 });
    expect(document.occurrences).toContainEqual({ term: "details", field: "test-title", line: 3 });
  });

  it("retrieves behavior described only in source content", () => {
    const target = sourceFile(
      "src/handler.ts",
      "export function processRequest() {\n  // Reject malformed payloads before dispatch.\n  return 'structured response';\n}",
    );
    const unrelated = sourceFile("src/cache.ts", "export function warmCache() { return true; }");
    const matches = scoreContentMatches([unrelated, target], normalizeTaskTerms("reject malformed payloads"));
    expect(matches.get(target.path)?.score).toBeGreaterThan(0);
    expect(matches.get(target.path)?.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ term: "malformed", field: "comment", line: 2 }),
    ]));
    expect(matches.has(unrelated.path)).toBe(false);
  });

  it("keeps explanation evidence compact while retaining more evidence for localization", () => {
    const target = sourceFile(
      "src/handler.ts",
      [
        "// validate the request",
        "// reconcile orphaned sessions",
        "// rotate expired credentials",
        "// reject malformed payloads",
        "// emit structured error details",
      ].join("\n"),
    );
    const terms = normalizeTaskTerms("validate reconcile orphaned sessions rotate expired credentials reject malformed payloads structured error details");
    const match = scoreContentMatches([target], terms).get(target.path);
    expect(match?.evidence).toHaveLength(4);
    expect(match?.localizationEvidence.length).toBeGreaterThan(match?.evidence.length ?? 0);
  });

  it("keeps cached query documents isolated between different tasks", () => {
    const target = sourceFile(
      "src/session.ts",
      "// Reconcile orphaned sessions.\n// Rotate expired credentials.",
    );
    const first = scoreContentMatches([target], normalizeTaskTerms("orphaned sessions"));
    const second = scoreContentMatches([target], normalizeTaskTerms("expired credentials"));
    expect(first.get(target.path)?.evidence.some((item) => item.term === "orphaned")).toBe(true);
    expect(second.get(target.path)?.evidence.some((item) => item.term === "credentials")).toBe(true);
    expect(second.get(target.path)?.evidence.some((item) => item.term === "orphaned")).toBe(false);
  });

  it("uses length normalization and capped frequency instead of rewarding repetition", () => {
    const concise = sourceFile(
      "src/session.ts",
      "// Reconcile orphaned sessions after reconnect.\nexport const repair = true;",
    );
    const repeated = sourceFile(
      "src/noisy.ts",
      `export const values = [${Array.from({ length: 500 }, () => "'orphaned'").join(",")}];`,
    );
    const matches = scoreContentMatches([repeated, concise], normalizeTaskTerms("reconcile orphaned sessions"));
    expect(matches.get(concise.path)?.score).toBeGreaterThan(matches.get(repeated.path)?.score ?? 1);
    expect(extractLexicalDocument(repeated.content, repeated.path).termWeights.orphaned).toBeLessThanOrEqual(
      LEXICAL_LIMITS.maxOccurrencesPerTerm,
    );
  });

  it("matches Chinese behavior text with the same normalized term pipeline", () => {
    const target = sourceFile("src/guard.ts", "// 检查用户权限并拒绝未授权访问\nexport const guard = true;");
    const matches = scoreContentMatches([target], normalizeTaskTerms("增加权限检查"));
    expect(matches.get(target.path)?.score).toBeGreaterThan(0);
    expect(matches.get(target.path)?.evidence.some((item) => item.term === "权限")).toBe(true);
  });

  it("uses test titles as high-quality behavior evidence", () => {
    const testFile = sourceFile(
      "test/request.test.ts",
      "test('retries interrupted uploads safely', () => expect(true).toBe(true));",
      true,
    );
    const source = sourceFile("src/request.ts", "export const request = true;");
    const matches = scoreContentMatches([source, testFile], normalizeTaskTerms("retry interrupted uploads"));
    expect(matches.get(testFile.path)?.score).toBeGreaterThan(0);
    expect(matches.get(testFile.path)?.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ term: "uploads", field: "test-title", line: 1 }),
    ]));
  });

  it("does not index module specifiers or secret-bearing strings", () => {
    const document = extractLexicalDocument(
      "import value from 'private-validation-package';\nconst secret = \"api_key='abcdefghijklmnop' validation\";",
      "src/index.ts",
    );
    expect(document.termWeights.package).toBeUndefined();
    expect(document.termWeights.validation).toBeUndefined();
  });
});
