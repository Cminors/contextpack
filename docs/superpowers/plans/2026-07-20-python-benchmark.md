# P1.2 Python Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pinned, resumable Python real-issue benchmark and use its full 300-task result to determine whether ContextPack's Python retrieval support is validated.

**Architecture:** Generalize only the issue-evaluation boundary from JS/TS to a closed JS/TS-or-Python language union. Add a dedicated SWE-bench Lite Python preparation adapter that emits a deterministic 57-task engineering set and the complete 300-task support-claim set, then reuse the existing evaluator, cache, checkpoint, audit, diagnostics, and parity machinery. Keep ranking and selection frozen.

**Tech Stack:** Node.js 20+, ESM TypeScript, Vitest, Commander, hyparquet, Git worktrees, PowerShell benchmark orchestration.

## Global Constraints

- Do not modify `src/ranking/`, ranking weights, localization, selection, or token-budget behavior.
- Do not add a runtime dependency.
- Preserve the default JS/TS dataset path and `eval-issues` CLI behavior.
- Preserve `IssueBenchmarkReport.version` and `IssueBenchmarkCheckpoint.version` at `1`.
- Use `spawnSync` argument arrays only; never add shell-string interpolation.
- Source dataset: `princeton-nlp/SWE-bench_Lite` at revision `6ec7bb89b9342f664a54a6e0a6ea6501d3437cc2`.
- Source Parquet SHA-256: `7a21f37b8bc179c7db5beeb14e88ac538ba283455c776e6b2535bbfb6e3551b4`.
- Engineering set: deterministic per-repository cap of five, exactly 57 instances across 12 repositories.
- Final set: all 300 eligible Python instances.
- Fixed evaluation settings: history `100`, token budget `12000`, line budgets `100,250,500`, instance timeout `600` seconds, Git timeout `300` seconds.
- Full-run floors: Recall@10 `0.250`, MRR `0.100`, line recall @500 `0.050`, useful hit @500 `0.100`.
- Do not change datasets, thresholds, or scorer behavior after observing results.
- Generated datasets and raw reports remain ignored under `.benchmarks/` and `.contextpack/`.
- Every implementation task ends with focused tests and an atomic commit.
- Final completion requires `npm run check`, `npm run perf:smoke`, exact JS/TS full-43 parity, 57/57 with zero skips, and a completed 300-task run with zero skips.

## File Map

- Create `src/evaluation/issue-dataset.ts`: language-neutral normalized JSONL validation and reading.
- Modify `src/evaluation/issue-types.ts`: closed benchmark-language union.
- Modify `src/evaluation/patch-regions.ts`: explicit language-aware source-file filtering.
- Modify `src/evaluation/swebench-dataset.ts`: retain JS/TS preparation and re-export compatibility while using shared boundaries.
- Create `src/evaluation/swebench-source.ts`: shared pinned Parquet download, row normalization, hashing, and file helpers.
- Create `src/evaluation/swebench-python-dataset.ts`: pinned Python source adapter, integrity contract, balanced selection, and manifest construction.
- Modify `src/evaluation/issues.ts`: language consistency and language-aware limitations.
- Create `src/evaluation/python-benchmark-gates.ts`: deterministic full-run gate classification.
- Create `scripts/prepare-swebench-python.ts`: write full and balanced Python datasets.
- Create `scripts/validate-python-benchmark.ts`: validate one full `results.json` and print its verdict.
- Modify `package.json`: expose preparation and validation scripts.
- Create `tests/issue-dataset.test.ts`, `tests/swebench-python-dataset.test.ts`, and `tests/python-benchmark-gates.test.ts`.
- Modify `tests/patch-regions.test.ts`, `tests/swebench-dataset.test.ts`, and `tests/issues.test.ts`.
- Modify `PROJECT_STATE.md`, `benchmarks/README.md`, `README.md`, and `README.zh-CN.md` only after measured results exist.

---

### Task 1: Generalize Normalized Issue Data And Patch Regions

**Files:**
- Create: `src/evaluation/issue-dataset.ts`
- Modify: `src/evaluation/issue-types.ts`
- Modify: `src/evaluation/patch-regions.ts`
- Modify: `src/evaluation/swebench-dataset.ts`
- Create: `tests/issue-dataset.test.ts`
- Modify: `tests/patch-regions.test.ts`
- Modify: `tests/swebench-dataset.test.ts`

**Interfaces:**
- Produces: `IssueBenchmarkLanguage`, `isIssueBenchmarkLanguage(value)`, `readIssueDataset(filePath)`, and `parsePatchRegions(patch, language?)`.
- Preserves: a default JS/TS language for existing `parsePatchRegions(patch)` callers and a `readIssueDataset` re-export from `swebench-dataset.ts`.
- Consumed by: Tasks 2-4 and the existing issue evaluator.

- [ ] **Step 1: Add failing Python patch-region tests**

Append focused cases to `tests/patch-regions.test.ts`:

```typescript
it("filters source hunks by the declared benchmark language", () => {
  const patch = `diff --git a/src/service.py b/src/service.py
--- a/src/service.py
+++ b/src/service.py
@@ -7,2 +7,2 @@
-old
+new
 context
diff --git a/src/service.ts b/src/service.ts
--- a/src/service.ts
+++ b/src/service.ts
@@ -3 +3 @@
-old
+new
`;

  expect(parsePatchRegions(patch, "python")).toMatchObject({
    regions: [{ path: "src/service.py", startLine: 7, endLine: 8 }],
    excludedFiles: [{ path: "src/service.ts", reason: "unsupported-file" }],
  });
  expect(parsePatchRegions(patch)).toMatchObject({
    regions: [{ path: "src/service.ts", startLine: 3, endLine: 3 }],
    excludedFiles: [{ path: "src/service.py", reason: "unsupported-file" }],
  });
});
```

- [ ] **Step 2: Add failing normalized-dataset tests**

Create `tests/issue-dataset.test.ts` with a temporary JSONL fixture. Cover:

```typescript
const pythonInstance: IssueBenchmarkInstance = {
  instanceId: "example__python-1",
  sourceDataset: "fixture/python",
  sourceRevision: "fixture-v1",
  repo: "example/python",
  baseCommit: "a".repeat(40),
  issueText: "Fix request timeout handling",
  language: "python",
  goldRegions: [{ path: "src/client.py", startLine: 4, endLine: 8, kind: "patch-hunk" }],
  metadata: {
    issueUrl: null,
    prUrl: null,
    createdAt: null,
    patchSha256: "0".repeat(64),
    excludedPatchFiles: 0,
  },
};

expect(await readIssueDataset(dataset)).toEqual([pythonInstance]);
await expect(readIssueDataset(invalidLanguage)).rejects.toMatchObject({ code: "INVALID_DATASET" });
await expect(readIssueDataset(duplicateIds)).rejects.toMatchObject({ code: "INVALID_DATASET" });
await expect(readIssueDataset(invalidMetadata)).rejects.toMatchObject({ code: "INVALID_DATASET" });
```

Test invalid language, unsafe repository slug, invalid commit, empty issue text,
empty gold regions, invalid line ranges, non-hex patch hash, negative excluded
count, and duplicate `instanceId` values.

- [ ] **Step 3: Run the focused tests and confirm the expected failures**

Run:

```powershell
npx vitest run tests/patch-regions.test.ts tests/issue-dataset.test.ts tests/swebench-dataset.test.ts
```

Expected: failure because `python` is not an accepted language,
`issue-dataset.ts` does not exist, and `parsePatchRegions` accepts one argument.

- [ ] **Step 4: Add the closed language union**

In `src/evaluation/issue-types.ts`, add and use:

```typescript
export type IssueBenchmarkLanguage = "javascript-typescript" | "python";

export interface IssueBenchmarkInstance {
  instanceId: string;
  sourceDataset: string;
  sourceRevision: string;
  repo: string;
  baseCommit: string;
  issueText: string;
  language: IssueBenchmarkLanguage;
  goldRegions: GoldPatchRegion[];
  metadata: {
    issueUrl: string | null;
    prUrl: string | null;
    createdAt: string | null;
    patchSha256: string;
    excludedPatchFiles: number;
  };
}
```

- [ ] **Step 5: Implement the language-neutral JSONL reader**

Create `src/evaluation/issue-dataset.ts` with these public functions and strict
checks:

```typescript
import fs from "node:fs/promises";
import path from "node:path";
import { ContextPackError } from "../errors.js";
import type { IssueBenchmarkInstance, IssueBenchmarkLanguage } from "./issue-types.js";

export const isIssueBenchmarkLanguage = (value: unknown): value is IssueBenchmarkLanguage =>
  value === "javascript-typescript" || value === "python";

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

const isIssueInstance = (value: unknown): value is IssueBenchmarkInstance => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<IssueBenchmarkInstance>;
  const metadata = item.metadata as Partial<IssueBenchmarkInstance["metadata"]> | undefined;
  return typeof item.instanceId === "string" && item.instanceId.length > 0
    && typeof item.sourceDataset === "string" && item.sourceDataset.length > 0
    && typeof item.sourceRevision === "string" && item.sourceRevision.length > 0
    && typeof item.repo === "string" && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(item.repo)
    && /^[0-9a-f]{7,40}$/i.test(item.baseCommit ?? "")
    && typeof item.issueText === "string" && item.issueText.trim().length > 0
    && isIssueBenchmarkLanguage(item.language)
    && Array.isArray(item.goldRegions) && item.goldRegions.length > 0
    && item.goldRegions.every((region) => typeof region.path === "string"
      && region.path.length > 0
      && !region.path.startsWith("/")
      && !region.path.split("/").includes("..")
      && Number.isInteger(region.startLine) && region.startLine > 0
      && Number.isInteger(region.endLine) && region.endLine >= region.startLine
      && region.kind === "patch-hunk")
    && metadata !== undefined
    && isNullableString(metadata.issueUrl)
    && isNullableString(metadata.prUrl)
    && isNullableString(metadata.createdAt)
    && typeof metadata.patchSha256 === "string" && /^[0-9a-f]{64}$/i.test(metadata.patchSha256)
    && Number.isInteger(metadata.excludedPatchFiles) && (metadata.excludedPatchFiles ?? -1) >= 0;
};

export async function readIssueDataset(filePath: string): Promise<IssueBenchmarkInstance[]> {
  const content = await fs.readFile(path.resolve(filePath), "utf8");
  const instances: IssueBenchmarkInstance[] = [];
  const seenIds = new Set<string>();
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new ContextPackError(`Invalid JSONL at line ${index + 1}.`, 2, "INVALID_DATASET");
    }
    if (!isIssueInstance(parsed) || seenIds.has(parsed.instanceId)) {
      throw new ContextPackError(`Invalid issue instance at line ${index + 1}.`, 2, "INVALID_DATASET");
    }
    seenIds.add(parsed.instanceId);
    instances.push(parsed);
  }
  if (instances.length === 0) throw new ContextPackError("Issue dataset is empty.", 2, "INVALID_DATASET");
  return instances;
}
```

- [ ] **Step 6: Make patch parsing language-aware without changing the default**

Replace the single source regex and apply these exact changes in
`src/evaluation/patch-regions.ts`:

```diff
+import type { IssueBenchmarkLanguage } from "./issue-types.js";

-const SOURCE_FILE = /\.[cm]?[jt]sx?$/i;
+const SOURCE_FILE: Record<IssueBenchmarkLanguage, RegExp> = {
+  "javascript-typescript": /\.[cm]?[jt]sx?$/i,
+  python: /\.py$/i,
+};

-export function parsePatchRegions(patch: string): PatchRegionResult {
+export function parsePatchRegions(
+  patch: string,
+  language: IssueBenchmarkLanguage = "javascript-typescript",
+): PatchRegionResult {
+  const sourceFile = SOURCE_FILE[language];

-    else if (!SOURCE_FILE.test(candidate)) pushExcluded(excludedFiles, candidate, "unsupported-file");
+    else if (!sourceFile.test(candidate)) pushExcluded(excludedFiles, candidate, "unsupported-file");

-    if (!SOURCE_FILE.test(candidate)) {
+    if (!sourceFile.test(candidate)) {
```

Do not change any other parser line: path parsing, insertion anchors, old-path
rename behavior, sorting, and exclusion reasons remain byte-for-byte equal.

- [ ] **Step 7: Preserve the old import facade and migrate internal imports**

Remove the validator and JSONL reader implementation from
`src/evaluation/swebench-dataset.ts`, add:

```typescript
export { readIssueDataset } from "./issue-dataset.js";
```

Change internal consumers (`src/evaluation/issues.ts`,
`scripts/diagnose-region-clusters.ts`,
`scripts/prepare-issue-diagnostic-subset.ts`, and tests) to import from
`issue-dataset.ts`. Keep the re-export so existing callers do not break.

- [ ] **Step 8: Run focused and full tests**

Run:

```powershell
npx vitest run tests/patch-regions.test.ts tests/issue-dataset.test.ts tests/swebench-dataset.test.ts tests/issues.test.ts
npm run typecheck
npm test
```

Expected: all tests pass; the existing JS/TS dataset adapter tests remain
unchanged in result.

- [ ] **Step 9: Commit Task 1**

```powershell
git add src/evaluation/issue-types.ts src/evaluation/issue-dataset.ts src/evaluation/patch-regions.ts src/evaluation/swebench-dataset.ts src/evaluation/issues.ts scripts/diagnose-region-clusters.ts scripts/prepare-issue-diagnostic-subset.ts tests/issue-dataset.test.ts tests/patch-regions.test.ts tests/swebench-dataset.test.ts tests/issues.test.ts
git commit -m "refactor: generalize real-issue dataset language"
```

---

### Task 2: Add Pinned SWE-bench Lite Python Preparation

**Files:**
- Create: `src/evaluation/swebench-source.ts`
- Create: `src/evaluation/swebench-python-dataset.ts`
- Modify: `src/evaluation/swebench-dataset.ts`
- Create: `scripts/prepare-swebench-python.ts`
- Modify: `package.json`
- Create: `tests/swebench-python-dataset.test.ts`
- Modify: `tests/swebench-dataset.test.ts`

**Interfaces:**
- Produces: `SWE_BENCH_LITE_PYTHON`, `adaptSweBenchLitePythonRow`, `adaptSweBenchLitePythonRows`, `selectBalancedPythonInstances`, and `prepareSweBenchLitePython`.
- Produces files: full JSONL, balanced JSONL, and one manifest beside each JSONL.
- Preserves: `prepareSweBenchMultilingual` output and source constants.

- [ ] **Step 1: Write failing Python source-adapter tests**

Create `tests/swebench-python-dataset.test.ts`. Use a valid Python row and assert:

```typescript
const instance = adaptSweBenchLitePythonRow({
  instance_id: "psf__requests-1",
  repo: "psf/requests",
  base_commit: "1234567890abcdef",
  problem_statement: "Fix timeout propagation.\r\n",
  issue_url: "https://github.com/psf/requests/issues/1",
  pr_url: "https://github.com/psf/requests/pull/2",
  created_at: "2024-01-01",
  patch: `diff --git a/requests/api.py b/requests/api.py
--- a/requests/api.py
+++ b/requests/api.py
@@ -10,2 +10,2 @@
-old
+new
 context
`,
});

expect(instance).toMatchObject({
  instanceId: "psf__requests-1",
  sourceDataset: "princeton-nlp/SWE-bench_Lite",
  language: "python",
  goldRegions: [{ path: "requests/api.py", startLine: 10, endLine: 11 }],
  metadata: { excludedPatchFiles: 0 },
});
expect(instance).not.toHaveProperty("patch");
```

Also assert that a row with no existing `.py` hunk fails closed during full
adaptation rather than silently becoming an empty instance.

- [ ] **Step 2: Write failing deterministic-selection and drift tests**

Generate in-memory normalized fixtures using the exact pinned repository counts:

```typescript
export const SWE_BENCH_LITE_PYTHON_REPOSITORY_COUNTS = {
  "astropy/astropy": 6,
  "django/django": 114,
  "matplotlib/matplotlib": 23,
  "mwaskom/seaborn": 4,
  "pallets/flask": 3,
  "psf/requests": 6,
  "pydata/xarray": 5,
  "pylint-dev/pylint": 6,
  "pytest-dev/pytest": 17,
  "scikit-learn/scikit-learn": 23,
  "sphinx-doc/sphinx": 16,
  "sympy/sympy": 77,
} as const;
```

Assert:

```typescript
expect(full).toHaveLength(300);
expect(new Set(full.map((item) => item.repo)).size).toBe(12);
expect(selectBalancedPythonInstances(full)).toHaveLength(57);
expect(selectBalancedPythonInstances([...full].reverse()))
  .toEqual(selectBalancedPythonInstances(full));
expect(balancedManifest.selectedInstanceIds).toEqual(
  selectBalancedPythonInstances(full).map((item) => item.instanceId),
);
expect(() => buildSweBenchLitePythonArtifacts(full.slice(1), sourceUrl, sourceSha))
  .toThrowError(/distribution/i);
```

- [ ] **Step 3: Run tests and confirm missing-module failures**

```powershell
npx vitest run tests/swebench-python-dataset.test.ts tests/swebench-dataset.test.ts
```

Expected: failure because the Python source adapter does not exist.

- [ ] **Step 4: Extract shared SWE-bench source mechanics**

Create `src/evaluation/swebench-source.ts` and move the current row conversion,
hash, existence, retrying download, and Parquet read mechanics from
`swebench-dataset.ts` behind these exports:

```typescript
export interface SweBenchRow {
  instance_id: string;
  repo: string;
  base_commit: string;
  problem_statement: string;
  patch: string;
  issue_url?: string | null;
  pr_url?: string | null;
  created_at?: string | null;
}

export const asSweBenchRow: (value: Record<string, unknown>) => SweBenchRow;
export const sha256: (value: string | Uint8Array) => string;
export const exists: (filePath: string) => Promise<boolean>;
export const downloadPinnedFile: (url: string, target: string) => Promise<void>;
export const readSweBenchRows: (parquetPath: string) => Promise<Array<Record<string, unknown>>>;
```

`readSweBenchRows` must request exactly `instance_id`, `repo`, `base_commit`,
`problem_statement`, `patch`, `issue_url`, `pr_url`, and `created_at`. Preserve
the existing three attempts, 60-second fetch timeout, `.part` file, checksum
verification order, and error codes.

Update `swebench-dataset.ts` to consume these exports and rerun its existing
tests before writing Python behavior.

- [ ] **Step 5: Implement the pinned Python source adapter**

Create `src/evaluation/swebench-python-dataset.ts` with:

```typescript
export const SWE_BENCH_LITE_PYTHON = {
  id: "princeton-nlp/SWE-bench_Lite",
  revision: "6ec7bb89b9342f664a54a6e0a6ea6501d3437cc2",
  license: "MIT",
  split: "test",
  file: "data/test-00000-of-00001.parquet",
  parquetSha256: "7a21f37b8bc179c7db5beeb14e88ac538ba283455c776e6b2535bbfb6e3551b4",
  expectedInstances: 300,
  expectedBalancedInstances: 57,
  balancedPerRepository: 5,
} as const;

export function adaptSweBenchLitePythonRow(
  value: Record<string, unknown>,
): IssueBenchmarkInstance {
  const row = asSweBenchRow(value);
  if (!/^[0-9a-f]{7,40}$/i.test(row.base_commit)) {
    throw new ContextPackError(`Invalid base_commit for ${row.instance_id}.`, 3, "INVALID_DATASET");
  }
  const parsed = parsePatchRegions(row.patch, "python");
  if (parsed.regions.length === 0) {
    throw new ContextPackError(`No existing Python gold region for ${row.instance_id}.`, 3, "DATASET_DRIFT");
  }
  return {
    instanceId: row.instance_id,
    sourceDataset: SWE_BENCH_LITE_PYTHON.id,
    sourceRevision: SWE_BENCH_LITE_PYTHON.revision,
    repo: row.repo,
    baseCommit: row.base_commit,
    issueText: row.problem_statement.replace(/\r\n/g, "\n").trim(),
    language: "python",
    goldRegions: parsed.regions,
    metadata: {
      issueUrl: row.issue_url ?? null,
      prUrl: row.pr_url ?? null,
      createdAt: row.created_at ?? null,
      patchSha256: sha256(row.patch),
      excludedPatchFiles: parsed.excludedFiles.length,
    },
  };
}

export const selectBalancedPythonInstances = (
  instances: readonly IssueBenchmarkInstance[],
): IssueBenchmarkInstance[] => {
  const byRepository = new Map<string, IssueBenchmarkInstance[]>();
  for (const instance of instances) {
    const group = byRepository.get(instance.repo) ?? [];
    group.push(instance);
    byRepository.set(instance.repo, group);
  }
  return [...byRepository.keys()].sort().flatMap((repo) =>
    [...(byRepository.get(repo) ?? [])]
      .sort((left, right) => left.instanceId.localeCompare(right.instanceId))
      .slice(0, SWE_BENCH_LITE_PYTHON.balancedPerRepository))
    .sort((left, right) => left.instanceId.localeCompare(right.instanceId));
};
```

Implement `adaptSweBenchLitePythonRows` so it rejects duplicate IDs, validates
the exact repository-count object, sorts by `instanceId`, and requires exactly
300 instances. Implement `buildSweBenchLitePythonArtifacts` as a pure function
returning the full/balanced instances and manifests. Each manifest records the
source metadata, checksum, total rows, repository counts, selection rule, and
exact selected IDs.

Use this exact validation order and return shape:

```typescript
const repositoryCounts = (
  instances: readonly IssueBenchmarkInstance[],
): Record<string, number> => {
  const counts = new Map<string, number>();
  for (const instance of instances) counts.set(instance.repo, (counts.get(instance.repo) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
};

const assertPinnedDistribution = (instances: readonly IssueBenchmarkInstance[]): void => {
  if (instances.length !== SWE_BENCH_LITE_PYTHON.expectedInstances) {
    throw new ContextPackError(
      `Expected ${SWE_BENCH_LITE_PYTHON.expectedInstances} Python instances, found ${instances.length}.`,
      3,
      "DATASET_DRIFT",
    );
  }
  if (JSON.stringify(repositoryCounts(instances))
    !== JSON.stringify(SWE_BENCH_LITE_PYTHON_REPOSITORY_COUNTS)) {
    throw new ContextPackError("SWE-bench Lite Python repository distribution changed.", 3, "DATASET_DRIFT");
  }
};

export const adaptSweBenchLitePythonRows = (
  rows: Array<Record<string, unknown>>,
): IssueBenchmarkInstance[] => {
  const instances = rows
    .map(adaptSweBenchLitePythonRow)
    .sort((left, right) => left.instanceId.localeCompare(right.instanceId));
  const ids = instances.map((instance) => instance.instanceId);
  if (new Set(ids).size !== ids.length) {
    throw new ContextPackError("SWE-bench Lite contains duplicate instance IDs.", 3, "DATASET_DRIFT");
  }
  assertPinnedDistribution(instances);
  return instances;
};

export interface PythonDatasetManifest {
  version: 1;
  sourceDataset: typeof SWE_BENCH_LITE_PYTHON.id;
  sourceRevision: typeof SWE_BENCH_LITE_PYTHON.revision;
  sourceFile: typeof SWE_BENCH_LITE_PYTHON.file;
  sourceUrl: string;
  license: typeof SWE_BENCH_LITE_PYTHON.license;
  split: typeof SWE_BENCH_LITE_PYTHON.split;
  parquetSha256: string;
  totalRows: number;
  instances: number;
  repositoryCounts: Record<string, number>;
  selection: { kind: "all" } | { kind: "per-repository-cap"; cap: number };
  selectedInstanceIds: string[];
}

const manifestFor = (
  instances: IssueBenchmarkInstance[],
  sourceUrl: string,
  parquetSha256: string,
  selection: PythonDatasetManifest["selection"],
): PythonDatasetManifest => ({
  version: 1,
  sourceDataset: SWE_BENCH_LITE_PYTHON.id,
  sourceRevision: SWE_BENCH_LITE_PYTHON.revision,
  sourceFile: SWE_BENCH_LITE_PYTHON.file,
  sourceUrl,
  license: SWE_BENCH_LITE_PYTHON.license,
  split: SWE_BENCH_LITE_PYTHON.split,
  parquetSha256,
  totalRows: SWE_BENCH_LITE_PYTHON.expectedInstances,
  instances: instances.length,
  repositoryCounts: repositoryCounts(instances),
  selection,
  selectedInstanceIds: instances.map((instance) => instance.instanceId),
});

export interface PythonDatasetArtifacts {
  fullInstances: IssueBenchmarkInstance[];
  balancedInstances: IssueBenchmarkInstance[];
  fullManifest: PythonDatasetManifest;
  balancedManifest: PythonDatasetManifest;
}

export const buildSweBenchLitePythonArtifacts = (
  fullInstances: IssueBenchmarkInstance[],
  sourceUrl: string,
  parquetSha256: string,
): PythonDatasetArtifacts => {
  assertPinnedDistribution(fullInstances);
  const balancedInstances = selectBalancedPythonInstances(fullInstances);
  if (balancedInstances.length !== SWE_BENCH_LITE_PYTHON.expectedBalancedInstances) {
    throw new ContextPackError(
      `Expected ${SWE_BENCH_LITE_PYTHON.expectedBalancedInstances} balanced instances, found ${balancedInstances.length}.`,
      3,
      "DATASET_DRIFT",
    );
  }
  return {
    fullInstances,
    balancedInstances,
    fullManifest: manifestFor(fullInstances, sourceUrl, parquetSha256, { kind: "all" }),
    balancedManifest: manifestFor(balancedInstances, sourceUrl, parquetSha256, {
      kind: "per-repository-cap",
      cap: SWE_BENCH_LITE_PYTHON.balancedPerRepository,
    }),
  };
};
```

- [ ] **Step 6: Implement file preparation and the CLI wrapper**

Expose:

```typescript
export interface PythonDatasetPreparationResult {
  fullOutputPath: string;
  balancedOutputPath: string;
  fullManifestPath: string;
  balancedManifestPath: string;
  parquetPath: string;
  fullInstanceCount: number;
  balancedInstanceCount: number;
  repositories: number;
  parquetSha256: string;
}

export function prepareSweBenchLitePython(
  fullOutputPath: string,
  balancedOutputPath: string,
  options: { force?: boolean; parquetPath?: string } = {},
): Promise<PythonDatasetPreparationResult>;
```

Create `scripts/prepare-swebench-python.ts` with `--full-output`,
`--balanced-output`, `--parquet`, and `--force`, defaulting to:

```text
.benchmarks/datasets/swe-bench-lite-python-full-300.jsonl
.benchmarks/datasets/swe-bench-lite-python-balanced-57.jsonl
```

When outputs already exist without `--force`, read both manifests and verify
their revision, checksum, selection rule, and exact selected IDs against the
freshly built artifacts. Throw `DATASET_DRIFT` on any mismatch; never report an
old file as current merely because its path exists.

Add:

```json
"benchmark:prepare:swebench-python": "tsx scripts/prepare-swebench-python.ts"
```

- [ ] **Step 7: Verify focused tests, JS/TS preparation compatibility, and types**

```powershell
npx vitest run tests/swebench-dataset.test.ts tests/swebench-python-dataset.test.ts tests/issue-dataset.test.ts tests/patch-regions.test.ts
npm run typecheck
npm run benchmark:prepare:swebench -- --output .contextpack/test-js-ts-dataset.jsonl --parquet C:\Users\Administrator\Documents\contextpack\.benchmarks\datasets\2b7aced941b4873e9cad3e76abbae93f481d1beb.parquet --force
```

Compare `.contextpack/test-js-ts-dataset.jsonl` byte-for-byte with
`C:\Users\Administrator\Documents\contextpack\.benchmarks\datasets\swe-bench-multilingual-js-ts.jsonl`.
Expected: equal. Remove only the generated `.contextpack/test-js-ts-dataset*`
files after verifying their resolved paths are inside this worktree.

- [ ] **Step 8: Commit Task 2**

```powershell
git add src/evaluation/swebench-source.ts src/evaluation/swebench-python-dataset.ts src/evaluation/swebench-dataset.ts scripts/prepare-swebench-python.ts package.json tests/swebench-python-dataset.test.ts tests/swebench-dataset.test.ts
git commit -m "feat: prepare pinned Python issue benchmarks"
```

---

### Task 3: Evaluate Python Issues Without Changing JS/TS Reports

**Files:**
- Modify: `src/evaluation/issues.ts`
- Modify: `tests/issues.test.ts`

**Interfaces:**
- Consumes: normalized `IssueBenchmarkInstance.language` from Task 1.
- Produces: Python report limitations while retaining report/checkpoint version 1.
- Preserves: existing cache, checkout, worker isolation, metrics, audit, diagnostics, and default CLI behavior.

- [ ] **Step 1: Add a failing local Python issue integration fixture**

Refactor the test fixture in `tests/issues.test.ts` to accept a language. Add a
Python fixture with:

```text
pyproject.toml
src/client.py
tests/test_client.py
```

Use this source body and issue:

```python
def timeout_error_message():
    return "timed out"
```

```text
Fix the timeout error message returned by timeout_error_message
```

Write a normalized Python instance whose gold region is `src/client.py:1-2`.
Run `runIssueBenchmark` with line budgets `[2, 10]` and assert:

```typescript
expect(report).toMatchObject({
  version: 1,
  sourceDataset: "fixture/python-issues",
  validInstances: 1,
  requestedInstances: 1,
  skipped: [],
  aggregate: { recallAt5: 1, recallAt10: 1, mrr: 1 },
});
expect(report.results[0]?.predictions).toContain("src/client.py");
expect(report.limitations).toContain(
  "Only existing Python patch files are scored; new and unsupported files are excluded.",
);
```

Also create a two-line dataset mixing JS/TS and Python and require
`MIXED_DATASET_LANGUAGE` before repository evaluation.

- [ ] **Step 2: Run the focused test and confirm the language failure**

```powershell
npx vitest run tests/issues.test.ts
```

Expected: the Python instance can be read after Task 1, but the evaluator still
emits the JS/TS limitation and does not reject mixed languages explicitly.

- [ ] **Step 3: Add evaluator language consistency and limitations**

In `runIssueBenchmark`, after selecting instances, add:

```typescript
const language = instances[0]?.language ?? "javascript-typescript";
if (instances.some((instance) => instance.language !== language)) {
  throw new ContextPackError(
    "Mixed benchmark languages are not supported in one report.",
    2,
    "MIXED_DATASET_LANGUAGE",
  );
}
```

Build limitations through:

```typescript
const sourceFileLimitation = language === "python"
  ? "Only existing Python patch files are scored; new and unsupported files are excluded."
  : "Only existing JavaScript and TypeScript patch files are scored; new and unsupported files are excluded.";
```

Keep the other three limitations and their order unchanged. Do not add
`language` to the serialized report or checkpoint.

- [ ] **Step 4: Verify Python integration, JS/TS snapshots, resume, and types**

```powershell
npx vitest run tests/issues.test.ts tests/issue-audit.test.ts tests/issue-diagnostics.test.ts tests/markdown.test.ts
npm run typecheck
npm test
```

Expected: all tests pass. If the pre-existing 5-second Windows fixture timeout
recurs only under full concurrency, reproduce the specific test, record both
timings, and do not change production behavior to hide it.

- [ ] **Step 5: Commit Task 3**

```powershell
git add src/evaluation/issues.ts tests/issues.test.ts
git commit -m "feat: evaluate Python issue retrieval"
```

---

### Task 4: Automate The Full-Run Verdict

**Files:**
- Create: `src/evaluation/python-benchmark-gates.ts`
- Create: `scripts/validate-python-benchmark.ts`
- Create: `tests/python-benchmark-gates.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `PYTHON_SUPPORT_FLOORS`, `PythonBenchmarkVerdict`, and `evaluatePythonBenchmarkGates(report)`.
- CLI input: one P1.2 full `results.json` path.
- CLI output: exact metrics, failures, and one of `validated`, `file-only`, `not-validated`, or `invalid-run`.

- [ ] **Step 1: Write failing verdict tests**

Create report fixtures for all four verdicts and assert:

```typescript
expect(evaluatePythonBenchmarkGates(validatedReport)).toEqual({
  verdict: "validated",
  failures: [],
  metrics: {
    recallAt10: 0.25,
    mrr: 0.1,
    lineRecallAt500: 0.05,
    usefulHitAt500: 0.1,
  },
});
expect(evaluatePythonBenchmarkGates(regionFailure).verdict).toBe("file-only");
expect(evaluatePythonBenchmarkGates(fileFailure).verdict).toBe("not-validated");
expect(evaluatePythonBenchmarkGates(skippedRun).verdict).toBe("invalid-run");
```

Also reject wrong source dataset/revision, missing `500` metrics, requested or
valid counts other than 300, and any skip. Boundary equality must pass.

- [ ] **Step 2: Run tests and confirm the missing-module failure**

```powershell
npx vitest run tests/python-benchmark-gates.test.ts
```

- [ ] **Step 3: Implement deterministic gates**

Create:

```typescript
export const PYTHON_SUPPORT_FLOORS = {
  recallAt10: 0.250,
  mrr: 0.100,
  lineRecallAt500: 0.050,
  usefulHitAt500: 0.100,
} as const;

export type PythonBenchmarkVerdict =
  | "validated"
  | "file-only"
  | "not-validated"
  | "invalid-run";

export interface PythonBenchmarkGateResult {
  verdict: PythonBenchmarkVerdict;
  failures: string[];
  metrics: {
    recallAt10: number;
    mrr: number;
    lineRecallAt500: number;
    usefulHitAt500: number;
  };
}
```

`evaluatePythonBenchmarkGates` must first validate source ID, revision,
300 requested, 300 valid, zero skips, and a `500` aggregate. Infrastructure
failure always returns `invalid-run`. Otherwise file failure wins over region
failure, making verdicts mutually exclusive.

Implement the priority without fall-through:

```typescript
export const evaluatePythonBenchmarkGates = (
  report: IssueBenchmarkReport,
): PythonBenchmarkGateResult => {
  const at500 = report.aggregate.regionMetrics["500"];
  const metrics = {
    recallAt10: report.aggregate.recallAt10,
    mrr: report.aggregate.mrr,
    lineRecallAt500: at500?.lineRecall ?? Number.NaN,
    usefulHitAt500: at500?.usefulHitRate ?? Number.NaN,
  };
  const infrastructureFailures = [
    ...(report.sourceDataset === SWE_BENCH_LITE_PYTHON.id ? [] : ["source dataset mismatch"]),
    ...(report.sourceRevision === SWE_BENCH_LITE_PYTHON.revision ? [] : ["source revision mismatch"]),
    ...(report.requestedInstances === 300 ? [] : ["requested instance count must be 300"]),
    ...(report.validInstances === 300 ? [] : ["valid instance count must be 300"]),
    ...(report.results.length === 300 ? [] : ["result count must be 300"]),
    ...(report.skipped.length === 0 ? [] : ["skipped instances must be empty"]),
    ...(at500 === undefined ? ["500-line aggregate is missing"] : []),
  ];
  if (infrastructureFailures.length > 0) {
    return { verdict: "invalid-run", failures: infrastructureFailures, metrics };
  }
  const fileFailures = [
    ...(metrics.recallAt10 >= PYTHON_SUPPORT_FLOORS.recallAt10 ? [] : ["Recall@10 below 0.250"]),
    ...(metrics.mrr >= PYTHON_SUPPORT_FLOORS.mrr ? [] : ["MRR below 0.100"]),
  ];
  if (fileFailures.length > 0) return { verdict: "not-validated", failures: fileFailures, metrics };
  const regionFailures = [
    ...(metrics.lineRecallAt500 >= PYTHON_SUPPORT_FLOORS.lineRecallAt500 ? [] : ["line@500 below 0.050"]),
    ...(metrics.usefulHitAt500 >= PYTHON_SUPPORT_FLOORS.usefulHitAt500 ? [] : ["useful-hit@500 below 0.100"]),
  ];
  return regionFailures.length > 0
    ? { verdict: "file-only", failures: regionFailures, metrics }
    : { verdict: "validated", failures: [], metrics };
};
```

- [ ] **Step 4: Add the validation CLI**

`scripts/validate-python-benchmark.ts` reads exactly one path, parses JSON,
calls the gate function, prints metrics to six decimal places, prints every
failure, and exits `0` only for `validated`. Use exit `1` for `file-only` or
`not-validated`, and exit `2` for invalid input or `invalid-run`.

Add:

```json
"benchmark:validate:python": "tsx scripts/validate-python-benchmark.ts"
```

- [ ] **Step 5: Run focused tests and CLI fixture checks**

```powershell
npx vitest run tests/python-benchmark-gates.test.ts
npm run typecheck
```

Invoke the script against temporary validated and invalid JSON fixtures and
assert the documented exit codes without changing any gate.

- [ ] **Step 6: Commit Task 4**

```powershell
git add src/evaluation/python-benchmark-gates.ts scripts/validate-python-benchmark.ts tests/python-benchmark-gates.test.ts package.json
git commit -m "feat: enforce Python benchmark support gates"
```

---

### Task 5: Prepare Data And Prove JS/TS Parity

**Files:**
- Modify: `PROJECT_STATE.md` only to mark implementation complete and validation in progress.
- Raw artifacts only: main checkout `.benchmarks/` and `.contextpack/evals/`.

**Interfaces:**
- Consumes: Tasks 1-4 and the main checkout's pinned JS/TS dataset/cache.
- Produces: verified Python JSONL/manifests and a JS/TS P1.2 parity report.

- [ ] **Step 1: Run the complete code quality and performance gates**

From the P1.2 worktree:

```powershell
npm run check
npm run perf:smoke
npm run perf:python
```

Expected: typecheck, all tests, build, installed-package smoke, JS/TS performance
below `4,000 ms`, and Python performance below `4,000 ms`.

- [ ] **Step 2: Prepare both Python datasets into the persistent main cache**

```powershell
$root = 'C:\Users\Administrator\Documents\contextpack'
npm run benchmark:prepare:swebench-python -- `
  --full-output "$root\.benchmarks\datasets\swe-bench-lite-python-full-300.jsonl" `
  --balanced-output "$root\.benchmarks\datasets\swe-bench-lite-python-balanced-57.jsonl"
```

Expected output: 300 full instances, 57 balanced instances, 12 repositories,
and pinned SHA-256 `7a21f37b8bc179c7db5beeb14e88ac538ba283455c776e6b2535bbfb6e3551b4`.

- [ ] **Step 3: Independently read back generated data and manifests**

Use PowerShell JSON parsing to assert:

```text
full JSONL non-empty lines = 300
balanced JSONL non-empty lines = 57
full manifest selected IDs = 300 unique IDs
balanced manifest selected IDs = 57 unique IDs
repository-count keys = 12
source revision and SHA-256 match the declared constants
```

Do not rely only on the preparation command's stdout.

- [ ] **Step 4: Run the JS/TS full-43 P1.2 projection**

```powershell
$root = 'C:\Users\Administrator\Documents\contextpack'
node dist/cli.js eval-issues `
  --dataset "$root\.benchmarks\datasets\swe-bench-multilingual-js-ts.jsonl" `
  --cache "$root\.benchmarks\repositories" `
  --history 100 --budget 12000 --line-budgets 100,250,500 `
  --instance-timeout 600 --git-timeout 300 `
  --output "$root\.contextpack\evals\p12-js-ts-full-43"
```

If interrupted, rerun with `--resume`. If any instance is skipped, rerun with
`--resume --retry-skipped` and record persistent causes.

- [ ] **Step 5: Compare JS/TS against the stable P1.0/P1.1 reference**

```powershell
$root = 'C:\Users\Administrator\Documents\contextpack'
npx tsx scripts/compare-eval-parity.ts `
  "$root\.contextpack\evals\p10-full-43\results.json" `
  "$root\.contextpack\evals\p12-js-ts-full-43\results.json"
```

Expected: `Parity: equal`, 43/43 valid, zero skips. P1.0 is a valid stable
reference because P1.1 recorded exact full-43 parity against it. Any mismatch
blocks Python benchmark execution until its root cause is fixed.

- [ ] **Step 6: Update the project ledger and commit the validation checkpoint**

Update `PROJECT_STATE.md` to mark implementation, data preparation, quality
gates, and JS/TS parity complete. Record measured performance values and raw
artifact paths. Keep both Python benchmark runs as not started.

```powershell
git add PROJECT_STATE.md
git commit -m "docs: record P1.2 compatibility validation"
```

---

### Task 6: Run The 57-Task Engineering Gate

**Files:**
- Modify: `PROJECT_STATE.md`
- Raw artifacts only: `.contextpack/evals/p12-python-balanced-57/` in the main checkout.

**Interfaces:**
- Consumes: the balanced normalized dataset and shared repository cache.
- Produces: a complete engineering report, audit, diagnostics, and checkpoint.
- Does not produce: a Python support verdict.

- [ ] **Step 1: Run or resume the balanced benchmark**

```powershell
$root = 'C:\Users\Administrator\Documents\contextpack'
node dist/cli.js eval-issues `
  --dataset "$root\.benchmarks\datasets\swe-bench-lite-python-balanced-57.jsonl" `
  --cache "$root\.benchmarks\repositories" `
  --history 100 --budget 12000 --line-budgets 100,250,500 `
  --instance-timeout 600 --git-timeout 300 `
  --output "$root\.contextpack\evals\p12-python-balanced-57"
```

If interrupted, add `--resume`. If skipped instances exist, use
`--resume --retry-skipped`. Do not restart completed instances.

- [ ] **Step 2: Enforce the engineering validity gate**

Read `results.json` and require:

```text
requestedInstances = 57
validInstances = 57
skipped.length = 0
results.length = 57
all result instance IDs are unique
aggregate.regionMetrics contains 100, 250, and 500
```

A persistent skip blocks Task 7. Diagnose checkout, interpreter, timeout, or
dataset issues; do not remove the instance.

- [ ] **Step 3: Record but do not optimize engineering metrics**

Record R@5, R@10, MRR, line recall @100/@250/@500, useful hit @500, median
tokens, median duration, audit failure counts, Python version, Node version, and
OS. Do not change scorer behavior, floors, or the selected 57 IDs.

- [ ] **Step 4: Update and commit the project ledger**

Mark 57/57 complete in `PROJECT_STATE.md`, add exact metrics and artifact paths,
and leave the full 300-task run pending.

```powershell
git add PROJECT_STATE.md
git commit -m "docs: record Python engineering benchmark (P1.2)"
```

---

### Task 7: Run The Full 300-Task Gate And Record The Verdict

**Files:**
- Modify: `benchmarks/README.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `PROJECT_STATE.md`
- Raw artifacts only: `.contextpack/evals/p12-python-full-300/` in the main checkout.

**Interfaces:**
- Consumes: the frozen full dataset, scorer, settings, and automated gate checker.
- Produces: the final P1.2 verdict and qualified product claims.

- [ ] **Step 1: Run or resume all 300 instances**

```powershell
$root = 'C:\Users\Administrator\Documents\contextpack'
node dist/cli.js eval-issues `
  --dataset "$root\.benchmarks\datasets\swe-bench-lite-python-full-300.jsonl" `
  --cache "$root\.benchmarks\repositories" `
  --history 100 --budget 12000 --line-budgets 100,250,500 `
  --instance-timeout 600 --git-timeout 300 `
  --output "$root\.contextpack\evals\p12-python-full-300"
```

Use `--resume` after interruption. Use `--resume --retry-skipped` for recorded
skips. A run with any persistent skip is `invalid-run` and cannot support a
claim.

- [ ] **Step 2: Validate the raw report independently**

Require 300 requested, 300 valid, 300 unique results, zero skips, all configured
line budgets, and dataset/revision equality. Read aggregate values directly
from `results.json`, not terminal rounding.

- [ ] **Step 3: Apply the frozen automated verdict**

```powershell
$root = 'C:\Users\Administrator\Documents\contextpack'
npm run benchmark:validate:python -- "$root\.contextpack\evals\p12-python-full-300\results.json"
```

Do not edit the checker or thresholds after this command. Preserve its stdout
and exit code in the task report.

- [ ] **Step 4: Update benchmark documentation with exact evidence**

Add `## P1.2 Python Benchmark` to `benchmarks/README.md` with:

- pinned dataset ID, revision, checksum, license, and selection method;
- balanced and full valid/skip counts;
- tables for R@5, R@10, MRR, line recall @100/@250/@500, useful hit @500,
  median tokens, and median duration;
- all four declared floors and pass/fail status;
- the exact deterministic verdict;
- audit counts by failure stage and repository;
- environment versions and reproducibility commands;
- limitations and raw `.contextpack/evals/p12-*` paths.

Do not label a failed gate as neutral or omit it from the headline.

- [ ] **Step 5: Qualify product claims from the verdict**

Update `README.md` and `README.zh-CN.md` symmetrically:

- `validated`: state benchmark-backed Python file and region retrieval with
  exact metrics and link to the benchmark section;
- `file-only`: state only validated file retrieval and explicitly say region
  localization did not meet its gates;
- `not-validated` or `invalid-run`: retain experimental Python-adapter wording
  and state that real-issue retrieval support is not validated.

Do not imply code-generation or patch-correctness validation.

- [ ] **Step 6: Finalize the cross-model project ledger**

In `PROJECT_STATE.md`:

- set P1.2 phase to complete;
- record exact full metrics, verdict, environment, and artifact paths;
- mark every P1.2 work item complete;
- move the active roadmap pointer to P1.3 Agent Skill only if the final report
  is valid;
- preserve failed gates and the keyword-ablated replay caveat;
- add the final documentation commit after it exists.

- [ ] **Step 7: Run the final repository gates and documentation audit**

```powershell
npm run check
npm run perf:smoke
git diff --check
git status --short
```

Re-read all four edited documents against `results.json`. Confirm raw datasets,
repository caches, checkpoints, results, `.omc/`, and untracked `AGENTS.md` are
not staged.

- [ ] **Step 8: Commit the measured verdict**

```powershell
git add PROJECT_STATE.md benchmarks/README.md README.md README.zh-CN.md
git commit -m "docs: validate Python retrieval on real issues (P1.2)"
```

If code fixes were required after Task 5, commit each independently before this
documentation commit and rerun all affected gates.

---

## Final Review Checklist

- [ ] `PROJECT_STATE.md` matches raw P1.2 artifacts and names one active next milestone.
- [ ] No placeholder, hidden skip, changed threshold, or post-result scorer edit exists.
- [ ] Dataset manifests reproduce 300 and 57 exact IDs from the pinned Parquet.
- [ ] JS/TS parity reports `Parity: equal`.
- [ ] Balanced run is 57/57 with zero skips.
- [ ] Full run is 300/300 with zero skips.
- [ ] Automated and documented verdicts match.
- [ ] English and Chinese support claims are symmetrical.
- [ ] `npm run check` and `npm run perf:smoke` pass.
- [ ] Raw benchmark artifacts remain ignored and unstaged.
