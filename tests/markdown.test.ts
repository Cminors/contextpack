import { describe, expect, it } from "vitest";
import { renderContext } from "../src/output/markdown.js";
import type { ContextCandidate, ContextManifest, ContextSelection } from "../src/types.js";

const contextCandidate = (): ContextCandidate => ({
  path: "src/handler.ts",
  symbol: null,
  startLine: 10,
  endLine: 20,
  score: 1,
  breakdown: { lexical: 1, symbol: 0, dependency: 0, git: 0, test: 0, rule: 0 },
  selected: true,
  reasons: ["lexical signal 1.00"],
  relationships: [{ kind: "imports", target: "src/dependency.ts", strength: 1, detail: "Direct import" }],
  estimatedTokens: 10,
});

const selection = (candidate: ContextCandidate, startLine: number, snippet: string): ContextSelection => ({
  ...candidate,
  startLine,
  endLine: startLine,
  snippet,
  estimatedTokens: 10,
});

const manifest = (requestedTokens: number, snippets: ContextSelection[]): ContextManifest => {
  const candidate = contextCandidate();
  return {
    version: 1,
    generatedAt: "2026-07-18T00:00:00.000Z",
    repository: {
      root: "C:/repo",
      commit: "abc123",
      branch: "main",
      packageManager: "npm",
      projectType: ["typescript"],
      isGitRepository: true,
      isShallow: false,
    },
    task: { raw: "update handler", normalizedTerms: ["handler"] },
    budget: { requestedTokens, estimatedTokens: 0, truncated: false },
    candidates: [candidate],
    selected: snippets.map((item) => ({ ...item, reasons: candidate.reasons, relationships: candidate.relationships })),
    rules: [],
    commands: [],
    warnings: [],
    timings: {
      discoverMs: 0,
      fileAnalysisMs: 0,
      gitHistoryMs: 0,
      initialRankingMs: 0,
      semanticEnrichmentMs: 0,
      rerankingMs: 0,
      selectionMs: 0,
      totalMs: 0,
    },
  };
};

describe("context rendering with multiple regions per path", () => {
  it("uses Python and configuration code fences and generic empty verification copy", () => {
    const candidate = contextCandidate();
    const snippets = [
      { ...selection(candidate, 1, "def refresh(): pass"), path: "src/session.py" },
      { ...selection(candidate, 1, "[tool.ruff]"), path: "pyproject.toml" },
      { ...selection(candidate, 1, "[pytest]"), path: "pytest.ini" },
      { ...selection(candidate, 1, "[metadata]"), path: "setup.cfg" },
    ];

    const markdown = renderContext(manifest(12_000, snippets));

    expect(markdown).toContain("```python\ndef refresh(): pass");
    expect(markdown).toContain("```toml\n[tool.ruff]");
    expect(markdown).toContain("```ini\n[pytest]");
    expect(markdown).toContain("```ini\n[metadata]");
    expect(markdown).toContain("No verification commands were discovered.");
  });

  it("keeps a candidate selected when truncation removes only its alternate", () => {
    const candidate = contextCandidate();
    const primary = selection(candidate, 10, "export const primary = true;");
    const alternate = selection(candidate, 100, Array.from({ length: 250 }, () => "const alternateValue = 'xxxxxxxxxxxxxxxx';").join("\n"));
    const value = manifest(900, [primary, alternate]);

    renderContext(value);

    expect(value.selected).toHaveLength(1);
    expect(value.selected[0]?.startLine).toBe(10);
    expect(value.candidates[0]?.selected).toBe(true);
  });

  it("clears a candidate when truncation removes its last selected snippet", () => {
    const candidate = contextCandidate();
    const oversized = selection(candidate, 10, Array.from({ length: 250 }, () => "const primaryValue = 'xxxxxxxxxxxxxxxx';").join("\n"));
    const value = manifest(900, [oversized]);

    renderContext(value);

    expect(value.selected).toHaveLength(0);
    expect(value.candidates[0]?.selected).toBe(false);
  });

  it("renders reasons and relationships once per selected path", () => {
    const candidate = contextCandidate();
    const value = manifest(12_000, [
      selection(candidate, 10, "export const primary = true;"),
      selection(candidate, 100, "export const alternate = true;"),
    ]);

    const markdown = renderContext(value);
    const whyIncluded = markdown.split("## 4. Why Included")[1]?.split("## 5. Relationships")[0] ?? "";
    const relationships = markdown.split("## 5. Relationships")[1]?.split("## 6. Applicable Rules")[0] ?? "";

    expect(whyIncluded.match(/`src\/handler\.ts`/g)).toHaveLength(1);
    expect(relationships.match(/`src\/handler\.ts`/g)).toHaveLength(1);
  });
});
