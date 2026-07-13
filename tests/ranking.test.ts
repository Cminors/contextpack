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
  references: [],
  referencedBy: [],
  referenceSymbols: {},
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
    expect(ranked.every((item) => item.breakdown.dependency === 1)).toBe(true);
  });

  it("caps broad lexical seeds and favors rare task terms", () => {
    const files = Array.from({ length: 30 }, (_, index) => file(`packages/server/handler-${index}.ts`));
    files.push(file("packages/core/inputRequired.ts"));
    const ranked = rankCandidates(files, ["server", "input", "required"], emptyGitHistory(), []);
    expect(ranked[0]?.path).toBe("packages/core/inputRequired.ts");
    expect(ranked.filter((item) => item.breakdown.dependency === 1)).toHaveLength(12);
  });

  it("uses config contents without boosting every config file", () => {
    const cjsConfig = { ...file("packages/server/tsdown.config.ts"), isConfig: true, content: "export default { format: ['esm', 'cjs'] };" };
    const testConfig = { ...file("packages/server/vitest.config.ts"), isConfig: true, content: "export default { test: true };" };
    const ranked = rankCandidates([testConfig, cjsConfig], ["commonjs", "cjs", "esm", "builds"], emptyGitHistory(), []);
    expect(ranked[0]?.path).toBe("packages/server/tsdown.config.ts");
    expect(ranked[1]?.breakdown.rule).toBe(0);
  });

  it("deprioritizes legacy implementations unless the task requests them", () => {
    const current = file("packages/server/src/auth.ts");
    const legacy = file("packages/server-legacy/src/auth.ts");
    const currentTask = rankCandidates([legacy, current], ["server", "auth"], emptyGitHistory(), []);
    const legacyTask = rankCandidates([legacy, current], ["server", "auth", "legacy"], emptyGitHistory(), []);
    expect(currentTask[0]?.path).toBe(current.path);
    expect(legacyTask[0]?.path).toBe(legacy.path);
  });

  it("uses a conventional commit scope as an exact path-segment signal", () => {
    const scoped = file("packages/server/src/index.ts");
    const unscoped = file("packages/client/src/server.ts");
    const ranked = rankCandidates([unscoped, scoped], ["server"], emptyGitHistory(), [], "server");
    expect(ranked[0]?.path).toBe(scoped.path);
    expect(ranked[0]?.breakdown.lexical).toBeGreaterThan(ranked[1]?.breakdown.lexical ?? 1);
  });

  it("does not boost configuration files without configuration intent", () => {
    const config = { ...file("packages/core/eslint.config.mjs"), isConfig: true, content: "trace context metadata" };
    const source = {
      ...file("packages/core/src/types/constants.ts"),
      symbols: [{ name: "reservedTraceContext", kind: "variable" as const, startLine: 1, endLine: 1, exported: true, text: "" }],
    };
    const ranked = rankCandidates([config, source], ["trace", "context", "metadata"], emptyGitHistory(), [], "core");
    expect(ranked[0]?.path).toBe(source.path);
    expect(ranked.find((item) => item.path === config.path)?.breakdown.rule).toBe(0);
  });

  it("treats a barrel exporting a task seed as a strong structural neighbor", () => {
    const implementation = file("src/auth.ts", [], ["src/index.ts"]);
    const barrel = file("src/index.ts", ["src/auth.ts"]);
    const ranked = rankCandidates([barrel, implementation], ["auth"], emptyGitHistory(), []);
    expect(ranked.find((item) => item.path === barrel.path)?.breakdown.dependency).toBe(1);
    expect(ranked.find((item) => item.path === barrel.path)?.relationships).toContainEqual(
      expect.objectContaining({ kind: "imports", target: implementation.path }),
    );
  });

  it("propagates a strong structural signal through two barrel levels", () => {
    const implementation = file("src/types/feature.ts", [], ["src/types/index.ts"]);
    const localBarrel = file("src/types/index.ts", [implementation.path], ["src/exports/public/index.ts"]);
    const publicBarrel = file("src/exports/public/index.ts", [localBarrel.path]);
    const ranked = rankCandidates([publicBarrel, localBarrel, implementation], ["feature"], emptyGitHistory(), []);
    expect(ranked.find((item) => item.path === localBarrel.path)?.breakdown.dependency).toBe(1);
    expect(ranked.find((item) => item.path === publicBarrel.path)?.breakdown.dependency).toBe(0.85);
  });

  it("maps a direct test to a task seed without overriding dependency rank", () => {
    const source = {
      ...file("src/transport.ts", [], ["test/integration.test.ts"]),
      symbols: [{ name: "reconnectionScheduler", kind: "function" as const, startLine: 1, endLine: 1, exported: true, text: "" }],
    };
    const testFile = file("test/integration.test.ts", [source.path], [], true);
    const ranked = rankCandidates([source, testFile], ["reconnection", "scheduler"], emptyGitHistory(), []);
    const testCandidate = ranked.find((item) => item.path === testFile.path);
    expect(testCandidate?.breakdown.dependency).toBe(0.7);
    expect(testCandidate?.breakdown.test).toBe(1);
  });

  it("weakly expands to same-directory files sharing task-specific symbols", () => {
    const seed = file("src/auth/provider.ts");
    const neighbor = {
      ...file("src/auth/metadata.ts"),
      symbols: [{ name: "OAuthMetadata", kind: "interface" as const, startLine: 1, endLine: 1, exported: true, text: "" }],
    };
    const unrelated = file("src/client/request.ts");
    const ranked = rankCandidates([unrelated, neighbor, seed], ["auth", "oauth", "metadata"], emptyGitHistory(), []);
    expect(ranked.find((item) => item.path === neighbor.path)?.breakdown.dependency).toBeGreaterThan(0);
    expect(ranked.find((item) => item.path === unrelated.path)?.breakdown.dependency).toBe(0);
  });

  it("uses precise symbol references without over-promoting high-fan-out hubs", () => {
    const seed = file("src/oauth/index.ts");
    seed.references = ["src/provider.ts"];
    seed.referenceSymbols = { "src/provider.ts": ["OAuthProvider"] };
    const precise = file("src/provider.ts");
    precise.referencedBy = [seed.path];
    const hubSeed = file("src/server/index.ts");
    hubSeed.references = Array.from({ length: 16 }, (_, index) => `src/dependency-${index}.ts`);
    hubSeed.referenceSymbols = Object.fromEntries(hubSeed.references.map((target) => [target, ["ServerRuntime"]]));
    const hubNeighbor = file("src/dependency-0.ts");
    hubNeighbor.referencedBy = [hubSeed.path];
    const preciseRanked = rankCandidates([seed, precise], ["oauth"], emptyGitHistory(), []);
    const hubRanked = rankCandidates([hubSeed, hubNeighbor], ["server"], emptyGitHistory(), []);
    expect(preciseRanked.find((item) => item.path === precise.path)?.breakdown.dependency).toBe(0.85);
    expect(hubRanked.find((item) => item.path === hubNeighbor.path)?.breakdown.dependency).toBeLessThan(0.5);
  });

  it("uses behavior evidence when paths and symbols do not contain the task terms", () => {
    const target = {
      ...file("src/handler.ts"),
      content: "export function processRequest() {\n  // Reject malformed payloads before dispatch.\n  return false;\n}",
      lineCount: 4,
      symbols: [{ name: "processRequest", kind: "function" as const, startLine: 1, endLine: 4, exported: true, text: "" }],
    };
    const unrelated = file("src/cache.ts");
    const ranked = rankCandidates([unrelated, target], ["reject", "malformed", "payloads"], emptyGitHistory(), []);
    expect(ranked[0]?.path).toBe(target.path);
    expect(ranked[0]?.breakdown.lexical).toBeGreaterThan(0);
    expect(ranked[0]?.reasons.join(" ")).toContain("content match");
    expect(ranked[0]?.reasons.join(" ")).toContain("line 2");
  });

  it("keeps exact path relevance ahead of a content-only match", () => {
    const exact = file("src/malformed-payload.ts");
    const contentOnly = {
      ...file("src/handler.ts"),
      content: "// malformed payload\nexport const handler = true;",
      symbols: [{ name: "handler", kind: "variable" as const, startLine: 2, endLine: 2, exported: true, text: "" }],
    };
    const ranked = rankCandidates([contentOnly, exact], ["malformed", "payload"], emptyGitHistory(), []);
    expect(ranked[0]?.path).toBe(exact.path);
    expect(ranked[0]?.breakdown.lexical).toBeGreaterThan(ranked[1]?.breakdown.lexical ?? 1);
  });

});
