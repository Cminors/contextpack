import { describe, expect, it } from "vitest";
import type { FileAnalysis, GitHistoryIndex } from "../src/types.js";
import { emptyGitHistory } from "../src/analysis/git-history.js";
import { rankCandidates, SCORE_WEIGHTS } from "../src/ranking/score.js";

const file = (path: string, imports: string[] = [], importedBy: string[] = [], isTest = false): FileAnalysis => ({
  path,
  absolutePath: path,
  language: "typescript",
  content: `export function login() { return true; }`,
  lineCount: 1,
  imports,
  importedBy,
  symbols: [{ name: path.includes("auth") ? "loginWithGithub" : "helper", kind: "function", startLine: 1, endLine: 1, exported: true, text: "" }],
  isTest,
  isConfig: false,
  packageDirectory: ".",
});

describe("candidate ranking", () => {
  it("keeps the documented weights normalized", () => {
    expect(Object.values(SCORE_WEIGHTS).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
  });

  it("ranks lexical symbols and their direct tests before unrelated files deterministically", () => {
    const files = [
      file("src/auth.ts", [], ["src/auth.test.ts"]),
      file("src/auth.test.ts", ["src/auth.ts"], [], true),
      file("src/unrelated.ts"),
    ];
    const first = rankCandidates(files, ["github", "login", "auth"], emptyGitHistory(), []);
    const second = rankCandidates(files, ["github", "login", "auth"], emptyGitHistory(), []);
    expect(first.map((item) => item.path)).toEqual(second.map((item) => item.path));
    expect(new Set(first.slice(0, 2).map((item) => item.path))).toEqual(new Set(["src/auth.ts", "src/auth.test.ts"]));
    expect(first.find((item) => item.path === "src/auth.test.ts")?.breakdown.test).toBe(1);
    expect(first.at(-1)?.path).toBe("src/unrelated.ts");
  });

  it("uses co-change as a bounded signal", () => {
    const history: GitHistoryIndex = {
      commits: [], fileCommitCounts: new Map(), titleTermsByFile: new Map(),
      coChange: new Map([["src/auth.ts", new Map([["src/session.ts", 0.8]])], ["src/session.ts", new Map([["src/auth.ts", 0.8]])]]),
    };
    const ranked = rankCandidates([file("src/auth.ts"), file("src/session.ts")], ["auth"], history, []);
    expect(ranked.find((item) => item.path === "src/session.ts")?.breakdown.git).toBe(0.8);
  });

  it("applies scoped agent rules but not general documentation", () => {
    const rules = [
      { path: ".cursor/rules/ts.mdc", scopeDirectory: ".", globs: ["**/*.ts"], content: "Use types", kind: "cursor" as const },
      { path: "README.md", scopeDirectory: ".", globs: [], content: "Docs", kind: "documentation" as const },
      { path: "packages/web/AGENTS.md", scopeDirectory: "packages/web", globs: [], content: "Web only", kind: "agents" as const },
    ];
    const ranked = rankCandidates([file("src/auth.ts")], ["auth"], emptyGitHistory(), rules);
    expect(ranked[0]?.breakdown.rule).toBe(0.5);
    expect(ranked[0]?.relationships).toContainEqual(expect.objectContaining({ kind: "rule-applies", target: ".cursor/rules/ts.mdc" }));
  });

  it("falls back deterministically when the task has no lexical seed", () => {
    const ranked = rankCandidates([file("src/a.ts"), file("src/b.ts")], ["zzzz"], emptyGitHistory(), []);
    expect(ranked.map((item) => item.path)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(ranked.every((item) => item.breakdown.dependency === 0.65)).toBe(true);
  });
});
