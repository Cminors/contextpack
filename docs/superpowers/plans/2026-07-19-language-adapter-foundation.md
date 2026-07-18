# Language Adapter Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the existing JavaScript/TypeScript analysis producer behind a deterministic internal language-adapter boundary without changing ContextPack behavior.

**Architecture:** A registry supplies discovery patterns and deterministic file ownership. The only registered adapter wraps the current TypeScript Compiler API analysis and continues producing the existing `FileAnalysis` IR, while ranking, localization, selection, CLI artifacts, and `ContextManifest` remain unchanged.

**Tech Stack:** Node.js 20+, ESM TypeScript, TypeScript Compiler API, fast-glob, Vitest, tsup.

## Global Constraints

- Do not add a runtime dependency.
- Do not add Python or advertise Python support.
- Do not change scoring weights, lexical behavior, regions, selection budgets, prediction policy, or public CLI options.
- Keep `analyzeTask({ root, task, budget, historyCount })` source-compatible.
- Keep `ContextManifest.version === 1` and all existing field meanings.
- Preserve root-relative POSIX paths and one-based inclusive line ranges.
- Preserve existing ignore, sensitive-path, Git-root, error, and warning behavior.
- Adapter registration and merged output must be deterministic.
- Every discovered source file must have exactly one adapter owner.
- Do not stage `.contextpack/`, `.benchmarks/`, `.omc/`, or `AGENTS.md`.
- Run `npm run check` before the final feature commit and `npm run perf:smoke` before the final decision.

---

### Task 1: Stable issue-evaluation parity comparison

**Files:**
- Create: `src/evaluation/parity.ts`
- Create: `scripts/compare-eval-parity.ts`
- Create: `tests/eval-parity.test.ts`

**Interfaces:**
- Consumes: `IssueBenchmarkReport` from `src/evaluation/issue-types.ts`.
- Produces: `projectIssueParity(report)`, `compareIssueParity(baseline, current)`, and a two-path CLI script.

- [ ] **Step 1: Write failing projection and comparison tests**

Create fixtures with the same semantic results but different `generatedAt`,
`durationMs`, and aggregate median duration. Assert an empty mismatch list.
Change one prediction, one predicted region, and one aggregate metric in separate
tests and assert paths such as `results[fixture].predictions` are reported.

```ts
const projected = projectIssueParity(report);
expect(projected.results[0]).toMatchObject({
  instanceId: "fixture-1",
  predictions: ["src/a.ts"],
});
expect(compareIssueParity(baseline, timingOnlyChange)).toEqual([]);
expect(compareIssueParity(baseline, changedPrediction)).toContain(
  "results[fixture-1].predictions",
);
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npx vitest run tests/eval-parity.test.ts`

Expected: FAIL because `src/evaluation/parity.ts` does not exist.

- [ ] **Step 3: Implement the stable projection**

The projection must include dataset/revision, requested and valid counts,
token/line budgets, skips, per-instance gold files/regions, predictions,
predicted regions, file metrics, region metrics, estimated tokens, aggregate
file metrics, and aggregate region metrics. Exclude only generated timestamps,
wall-clock durations, and timing fields. Sort results by `instanceId` and sort
object keys through normal structured construction, not string replacement.

```ts
export interface IssueParityComparison {
  equal: boolean;
  mismatches: string[];
}

export const projectIssueParity = (
  report: IssueBenchmarkReport,
): Record<string, unknown> => ({
  version: report.version,
  sourceDataset: report.sourceDataset,
  sourceRevision: report.sourceRevision,
  requestedInstances: report.requestedInstances,
  validInstances: report.validInstances,
  tokenBudget: report.tokenBudget,
  lineBudgets: [...report.lineBudgets],
  results: [...report.results]
    .sort((left, right) => left.instanceId.localeCompare(right.instanceId))
    .map(projectInstance),
  skipped: [...report.skipped].sort(skipOrder).map(projectSkip),
  aggregate: projectAggregate(report.aggregate),
});

export function compareIssueParity(
  baseline: IssueBenchmarkReport,
  current: IssueBenchmarkReport,
): string[] {
  return collectStructuredDifferences(
    projectIssueParity(baseline),
    projectIssueParity(current),
  );
}
```

- [ ] **Step 4: Implement the CLI wrapper**

The script accepts exactly two JSON paths, prints `Parity: equal` and exits 0
when equal, or prints each mismatch and sets exit code 1. Invalid arguments or
invalid JSON set exit code 2. Use `fs.readFile` and `JSON.parse`; do not invoke a
shell or rewrite artifacts.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```powershell
npx vitest run tests/eval-parity.test.ts
npm run typecheck
```

Expected: all focused tests pass and TypeScript reports zero errors.

- [ ] **Step 6: Commit**

```powershell
git add src/evaluation/parity.ts scripts/compare-eval-parity.ts tests/eval-parity.test.ts
git commit -m "test: add stable issue evaluation parity checks"
```

---

### Task 2: Language adapter contract and deterministic registry

**Files:**
- Create: `src/languages/types.ts`
- Create: `src/languages/registry.ts`
- Create: `tests/language-registry.test.ts`

**Interfaces:**
- Consumes: `DiscoveredRepository` and `FileAnalysis` from `src/types.ts`.
- Produces: `LanguageAdapter`, `LanguageAdapterRegistry`, and `createLanguageAdapterRegistry`.

- [ ] **Step 1: Write failing registry tests**

Use fake adapters to cover pattern deduplication, declaration-order stability,
one owner, zero owners, multiple owners, and an empty registry. Ownership
errors must be `ContextPackError` values with code
`LANGUAGE_ADAPTER_OWNERSHIP`.

```ts
const registry = createLanguageAdapterRegistry([first, second]);
expect(registry.sourcePatterns).toEqual(["**/*.ts", "**/*.tsx", "**/*.py"]);
expect(registry.ownerFor("src/a.ts").id).toBe("first");
expect(() => registry.ownerFor("README.md")).toThrow(/no language adapter/i);
expect(() => ambiguous.ownerFor("src/a.ts")).toThrow(/multiple language adapters/i);
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npx vitest run tests/language-registry.test.ts`

Expected: FAIL because the language modules do not exist.

- [ ] **Step 3: Add the minimal adapter contract**

```ts
import type { DiscoveredRepository, FileAnalysis } from "../types.js";

export interface LanguageAdapter {
  readonly id: string;
  readonly sourcePatterns: readonly string[];
  readonly configPatterns: readonly string[];
  owns(filePath: string): boolean;
  analyzeFiles(
    repository: DiscoveredRepository,
    sourceFiles: readonly string[],
  ): Promise<FileAnalysis[]>;
  enrichSemanticReferences?(
    repository: DiscoveredRepository,
    files: FileAnalysis[],
    focusPaths: readonly string[],
  ): boolean;
}

export interface LanguageAdapterRegistry {
  readonly adapters: readonly LanguageAdapter[];
  readonly sourcePatterns: readonly string[];
  readonly configPatterns: readonly string[];
  ownerFor(filePath: string): LanguageAdapter;
}
```

- [ ] **Step 4: Implement the deterministic registry**

Copy the adapter array, preserve declaration order, and deduplicate pattern
arrays by first occurrence. `ownerFor` filters by `owns`; it must never select
by last-write-wins behavior. Use the existing `ContextPackError` constructor.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```powershell
npx vitest run tests/language-registry.test.ts
npm run typecheck
```

Expected: all focused tests pass and TypeScript reports zero errors.

- [ ] **Step 6: Commit**

```powershell
git add src/languages/types.ts src/languages/registry.ts tests/language-registry.test.ts
git commit -m "refactor: define deterministic language adapter registry"
```

---

### Task 3: Move JS/TS analysis behind the adapter

**Files:**
- Create: `src/languages/javascript-typescript.ts`
- Modify: `src/analysis/ast.ts`
- Create: `tests/ast.test.ts`
- Modify: `tests/integration.test.ts`

**Interfaces:**
- Consumes: `LanguageAdapter` from Task 2.
- Produces: `javascriptTypeScriptAdapter`; preserves the existing
  `analyzeFiles` and `enrichSemanticReferences` exports in `ast.ts`.

- [ ] **Step 1: Add behavior-freezing tests before moving code**

Add a mixed JS/TS fixture that asserts exact source path order, language,
symbols and one-based ranges, imports, reverse imports, test/config flags, and
package directory. Retain existing workspace import, `.js` to TypeScript,
tsconfig path alias, and semantic-reference assertions unchanged.

```ts
const projected = projectAnalyses(files);
expect(projected.map((file) => file.path)).toEqual([
  "src/a.test.ts",
  "src/a.ts",
  "src/b.js",
]);
expect(projected).toContainEqual(expect.objectContaining({
  path: "src/a.ts",
  language: "typescript",
  imports: ["src/b.js"],
  importedBy: ["src/a.test.ts"],
  isTest: false,
  isConfig: false,
}));
expect(projected).toContainEqual(expect.objectContaining({
  path: "src/a.test.ts",
  imports: ["src/a.ts"],
  isTest: true,
}));
```

- [ ] **Step 2: Run the focused tests before the move**

Run: `npx vitest run tests/ast.test.ts tests/integration.test.ts`

Expected: PASS, establishing the pre-move behavior.

- [ ] **Step 3: Move the implementation mechanically**

Move TypeScript Compiler API imports, compiler configuration, symbol parsing,
module resolution, test/config classification, package-directory mapping,
forward/reverse edge construction, and semantic enrichment from `ast.ts` into
`javascript-typescript.ts`. Do not simplify regexes, reorder loops, change
sorts, rename reasons, or fix existing heuristics during the move.

Export:

```ts
export const javascriptTypeScriptAdapter: LanguageAdapter = {
  id: "javascript-typescript",
  sourcePatterns: ["**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"],
  configPatterns: [
    "package.json",
    "**/package.json",
    "tsconfig.json",
    "**/tsconfig*.json",
    "next.config.*",
    "vite.config.*",
    "eslint.config.*",
  ],
  owns: (filePath) => /\.(?:[cm]?[jt]sx?)$/i.test(filePath),
  analyzeFiles: analyzeJavaScriptTypeScriptFiles,
  enrichSemanticReferences: enrichJavaScriptTypeScriptReferences,
};
```

- [ ] **Step 4: Replace `ast.ts` with compatibility facades**

`analyzeFiles(repository)` calls the adapter with
`repository.sourceFiles`. `enrichSemanticReferences` delegates to the adapter.
Keep both public signatures unchanged so callers and tests remain source
compatible.

- [ ] **Step 5: Run analysis, ranking, and integration tests**

Run:

```powershell
npx vitest run tests/ast.test.ts tests/integration.test.ts tests/ranking.test.ts tests/lexical.test.ts
npm run typecheck
```

Expected: all tests pass without updating ranking expectations.

- [ ] **Step 6: Commit**

```powershell
git add src/languages/javascript-typescript.ts src/analysis/ast.ts tests/ast.test.ts tests/integration.test.ts
git commit -m "refactor: move JavaScript analysis behind language adapter"
```

---

### Task 4: Drive discovery and analysis through the registry

**Files:**
- Create: `src/languages/defaults.ts`
- Modify: `src/repository/discover.ts`
- Modify: `src/analysis/ast.ts`
- Create: `tests/discover.test.ts`
- Modify: `tests/language-registry.test.ts`

**Interfaces:**
- Consumes: registry and JS/TS adapter from Tasks 2-3.
- Produces: `defaultLanguageAdapterRegistry`; repository discovery and analysis
  dispatch use that same instance.

- [ ] **Step 1: Add failing default-registry and discovery parity tests**

Assert the default registry contains exactly `javascript-typescript`, source
and config patterns exactly match the pre-P1.0 constants, ignored and sensitive
files remain absent, and source/config arrays remain sorted. Add a failure test
for a source path without an owner by injecting a test registry into the
dispatcher through an internal optional parameter or test-only factory, not a
new CLI option.

- [ ] **Step 2: Run the focused tests and confirm the new assertions fail**

Run:

```powershell
npx vitest run tests/discover.test.ts tests/language-registry.test.ts
```

Expected: FAIL because discovery still owns hard-coded patterns.

- [ ] **Step 3: Add the default registry**

```ts
import { javascriptTypeScriptAdapter } from "./javascript-typescript.js";
import { createLanguageAdapterRegistry } from "./registry.js";

export const defaultLanguageAdapterRegistry = createLanguageAdapterRegistry([
  javascriptTypeScriptAdapter,
]);
```

- [ ] **Step 4: Replace discovery constants with registry patterns**

Use `defaultLanguageAdapterRegistry.sourcePatterns` and `.configPatterns` in
the existing parallel `fast-glob` calls. Preserve the exact ignore list,
`gitignore` filter order, sensitive-path filtering, POSIX conversion, and final
sort. After discovery, call `ownerFor` for each source path to enforce unique
ownership. Keep the current unsupported-repository message unchanged.

- [ ] **Step 5: Dispatch analysis and enrichment by owner**

Group source paths by adapter in registry order, invoke each adapter
sequentially, merge analyses, and sort by path. For semantic enrichment, group
focus paths by owner and invoke adapters in registry order. P1.0 has one
adapter, so the observable mutation and reranking order must remain unchanged.
Do not parallelize adapter calls.

- [ ] **Step 6: Run discovery, analysis, integration, and package tests**

Run:

```powershell
npx vitest run tests/discover.test.ts tests/language-registry.test.ts tests/ast.test.ts tests/integration.test.ts
npm run check
```

Expected: all tests, build, and package smoke pass.

- [ ] **Step 7: Commit**

```powershell
git add src/languages/defaults.ts src/repository/discover.ts src/analysis/ast.ts tests/discover.test.ts tests/language-registry.test.ts
git commit -m "refactor: route repository analysis through language registry"
```

---

### Task 5: Document and validate P1.0 parity

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `benchmarks/README.md`

**Interfaces:**
- Consumes: the completed adapter implementation and Task 1 parity script.
- Produces: documented internal architecture and recorded P1.0 validation.

- [ ] **Step 1: Run the local quality and performance gates**

```powershell
npm run check
npm run perf:smoke
```

Expected: typecheck, all tests, build, package smoke pass; performance median
is below 4000 ms.

- [ ] **Step 2: Build and run the full 43-task evaluation**

Use the existing dataset and cache from the main checkout:

```powershell
npm run build
node dist/cli.js eval-issues `
  --dataset C:\Users\Administrator\Documents\contextpack\.benchmarks\datasets\swe-bench-multilingual-js-ts.jsonl `
  --cache C:\Users\Administrator\Documents\contextpack\.benchmarks\repositories `
  --history 100 --budget 12000 --line-budgets 100,250,500 `
  --instance-timeout 600 --git-timeout 300 `
  --output .contextpack/evals/p10-full-43
```

Resume rather than restart if interrupted. Require 43 valid instances and zero
skips.

- [ ] **Step 3: Compare the full-set stable projection**

```powershell
npx tsx scripts/compare-eval-parity.ts `
  C:\Users\Administrator\Documents\contextpack\.contextpack\evals\p09-full-43\results.json `
  .contextpack/evals/p10-full-43/results.json
```

Expected: `Parity: equal`. Any mismatch blocks completion; do not relax the
projection or metric gates.

- [ ] **Step 4: Run Axios and historical replay parity checks**

Run the exact P0.9 smoke commands with new output directories:

```powershell
node dist/cli.js eval-issues `
  --dataset C:\Users\Administrator\Documents\contextpack\.benchmarks\datasets\swe-bench-multilingual-js-ts.jsonl `
  --cache C:\Users\Administrator\Documents\contextpack\.benchmarks\repositories `
  --repo axios/axios --history 50 --budget 12000 `
  --line-budgets 100,250,500 --instance-timeout 600 --git-timeout 300 `
  --output .contextpack/evals/p10-axios-smoke
node dist/cli.js eval --commits 20 --budget 12000 --query-mode title `
  --output .contextpack/evals/p10-history-title
node dist/cli.js eval --commits 20 --budget 12000 --query-mode keyword-ablated `
  --output .contextpack/evals/p10-history-ablated
```

Compare every common replay `predictions` array against the P0.9 JSON with a
structured script or PowerShell JSON comparison. Required values remain Axios
R@10 `0.650`, MRR `0.380`, line@500 `0.577`, useful-hit@500 `0.833`; title
`0.644/0.660`; keyword-ablated `0.644/0.577`.

- [ ] **Step 5: Update documentation**

Describe the adapter boundary as internal architecture. Continue to state that
only JS/TS is supported. Add a `P1.0 Language Adapter Foundation` benchmark
section with full-set, Axios, replay, performance, and parity results. Do not
claim Python, Skill, MCP, plugin, or public SDK support.

- [ ] **Step 6: Run final verification**

```powershell
npm run check
npm run perf:smoke
git diff --check
```

Expected: all commands exit 0 and no whitespace errors are reported.

- [ ] **Step 7: Commit**

```powershell
git add README.md README.zh-CN.md benchmarks/README.md
git commit -m "docs: validate language adapter parity (P1.0)"
```

## Final Review

After all tasks, review the complete branch against
`docs/superpowers/specs/2026-07-19-language-adapter-foundation-design.md`.
Confirm no ranking files or public schemas changed, inspect every adapter
ownership and ordering path, rerun the complete quality gate, and retain all
raw evaluation artifacts under ignored `.contextpack/` directories.
