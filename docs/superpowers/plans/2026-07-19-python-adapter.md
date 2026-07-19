# Python Adapter Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic Python-only and mixed JS/Python context-pack support while preserving every existing JS/TS retrieval result.

**Architecture:** Register a second `LanguageAdapter` that batches `.py` files through an embedded Python standard-library `ast` worker over versioned JSON stdin/stdout. Normalize worker results into the existing `FileAnalysis` IR, then add only the Python-specific discovery, lexical, structural, command, and rendering behavior needed by the vertical slice.

**Tech Stack:** Node.js 20+, ESM TypeScript, Python 3.8+ standard-library `ast`, `spawnSync` argument arrays, fast-glob, Vitest, tsup.

## Global Constraints

- Add no Node runtime dependency.
- Keep `ContextManifest.version` at `1` and preserve all existing CLI signatures.
- Keep the JavaScript/TypeScript adapter first in registry order and preserve its output exactly.
- Use one Python subprocess per adapter batch, versioned JSON on stdin/stdout, a 30-second timeout, and a 32 MiB buffer.
- Invoke subprocesses only with argument arrays; never use shell interpolation.
- Resolve only discovered repository-internal Python imports; omit ambiguous, external, dynamic, and unresolved imports.
- Python worker or per-file parse failure must produce a stable warning and lexical fallback, not abort a mixed repository.
- Do not add framework semantics, type inference, cross-language references, plugins, Skills, MCP, or ranking-weight changes.
- Every task follows TDD and ends in an atomic commit.
- Final completion requires `npm run check`, `npm run perf:smoke`, Python smoke, and P1.0 full-43 parity `equal`.

---

## File Map

- Create `src/languages/python-worker.ts`: embedded Python source and protocol types/constants.
- Create `src/languages/python.ts`: interpreter execution, fallback, symbol/import normalization, and adapter export.
- Create `tests/python-adapter.test.ts`: protocol, AST, import, test/config, failure, and determinism tests.
- Create `scripts/python-smoke.ts`: generated Python repository performance and output smoke.
- Modify `src/types.ts`: add `python` and generic config text languages.
- Modify `src/languages/defaults.ts`: register Python second.
- Modify `src/repository/discover.ts`: Python ignores and generic unsupported-source message.
- Modify `src/repository/packages.ts`: additive Python project-type detection.
- Modify `src/analysis/config-files.ts`: extension-aware config language and Python package roots.
- Modify `src/ranking/lexical.ts`: Python documents and `#` comments.
- Modify `src/ranking/score.ts`: Python barrel and test-name associations.
- Modify `src/ranking/predictions.ts`: Python test/config/barrel diversity categories.
- Modify `src/analysis/analyze.ts`: deterministic evidence-based Python commands.
- Modify `src/output/markdown.ts`: Python/TOML/INI fences and generic command empty state.
- Modify `src/doctor.ts`: language-neutral source messages.
- Modify `tests/ast.test.ts`, `tests/discover.test.ts`, `tests/integration.test.ts`, `tests/lexical.test.ts`, `tests/ranking.test.ts`, `tests/predictions.test.ts`, `tests/doctor.test.ts`, and `tests/markdown.test.ts`: focused regression coverage.
- Modify `scripts/package-smoke.ts`: installed Python-only CLI smoke.
- Modify `package.json`: Python smoke command and user-facing metadata.
- Modify `README.md`, `README.zh-CN.md`, and `benchmarks/README.md`: support and validation documentation.

---

### Task 1: Implement the Python AST adapter and controlled fallback

**Files:**
- Create: `src/languages/python-worker.ts`
- Create: `src/languages/python.ts`
- Create: `tests/python-adapter.test.ts`
- Modify: `src/types.ts`

**Interfaces:**
- Consumes: `LanguageAdapter`, `DiscoveredRepository`, `FileAnalysis`, `SymbolRecord`, and `packageDirectoryFor`.
- Produces: `pythonAdapter: LanguageAdapter`; protocol version `1`; normalized Python `FileAnalysis[]`.

- [ ] **Step 1: Write failing adapter contract and AST fixture tests**

Create a temporary repository with `src/accounts/models.py`, `src/accounts/service.py`,
`src/accounts/__init__.py`, and `tests/test_service.py`. Assert:

```ts
expect(pythonAdapter.id).toBe("python");
expect(pythonAdapter.sourcePatterns).toEqual(["**/*.py"]);
expect(pythonAdapter.owns("src/app.py")).toBe(true);
expect(pythonAdapter.owns("src/app.ts")).toBe(false);
expect(byPath.get("src/accounts/service.py")).toMatchObject({
  language: "python",
  imports: ["src/accounts/models.py"],
  importedBy: ["tests/test_service.py"],
  references: [],
  referencedBy: [],
  referenceSymbols: {},
  isTest: false,
  isConfig: false,
});
expect(byPath.get("tests/test_service.py")?.isTest).toBe(true);
```

Also assert decorated async functions/classes/methods include decorators in
their one-based inclusive ranges and text, public/private `exported` values are
stable, top-level assignments become variables, and an otherwise symbol-free
non-empty module gets the `module` fallback.

- [ ] **Step 2: Run the focused test and confirm it fails**

```powershell
npx vitest run tests/python-adapter.test.ts
```

Expected: FAIL because `pythonAdapter` and the `python` language value do not exist.

- [ ] **Step 3: Define the versioned worker protocol and embedded source**

In `python-worker.ts`, export exact TypeScript protocol types plus a
`PYTHON_WORKER_SOURCE` string. The request and response shapes are:

```ts
export interface PythonWorkerRequest {
  version: 1;
  root: string;
  files: string[];
}

export interface PythonImportRecord {
  module: string;
  level: number;
}

export interface PythonWorkerFile {
  path: string;
  symbols: SymbolRecord[];
  imports: PythonImportRecord[];
  isTest: boolean;
  isConfig: boolean;
}

export interface PythonWorkerResponse {
  version: 1;
  files: PythonWorkerFile[];
  errors: Array<{ path: string; code: "PYTHON_PARSE_FAILED" | "PYTHON_READ_FAILED"; message: string }>;
}
```

The embedded worker must validate version `1`, sort inputs and outputs, parse
with `ast.parse`, include decorators in symbol spans, handle `FunctionDef`,
`AsyncFunctionDef`, `ClassDef`, immediate methods, `Assign`, `AnnAssign`, and
`AugAssign`, and write exactly one JSON value to stdout. Use
`getattr(node, "end_lineno", node.lineno)` for Python 3.8 compatibility.

- [ ] **Step 4: Implement execution, import resolution, and fallback**

In `python.ts`, try interpreter candidates in deterministic order:

```ts
const candidates = process.env.CONTEXTPACK_PYTHON
  ? [{ command: process.env.CONTEXTPACK_PYTHON, prefix: [] }]
  : process.platform === "win32"
    ? [{ command: "py", prefix: ["-3"] }, { command: "python", prefix: [] }, { command: "python3", prefix: [] }]
    : [{ command: "python3", prefix: [] }, { command: "python", prefix: [] }];
```

Invoke each with `spawnSync(command, [...prefix, "-c", PYTHON_WORKER_SOURCE],
{ input: JSON.stringify(request), encoding: "utf8", windowsHide: true,
timeout: 30_000, maxBuffer: 32 * 1024 * 1024 })`. Validate the response shape
before use.

Resolve imports against known `.py` files by trying `<module>.py`,
`<module>/__init__.py`, `src/<module>.py`, `src/<module>/__init__.py`, and one
unique suffix match. Relative level `1` begins at the containing directory;
each additional level removes one directory. Reject paths outside the
repository and ambiguous suffix matches.

When every candidate fails with command-not-found, append one
`PYTHON_UNAVAILABLE` warning and return lexical fallback records. If an
interpreter starts but times out, exits non-zero, or returns malformed/version-
mismatched JSON, append `PYTHON_ANALYSIS_FAILED`. For worker per-file errors, append one
`PYTHON_PARSE_FAILED` warning per path and fall back only that file. Fallback
records read content, set path-based `isTest`/`isConfig`, and leave symbols and
all graph fields empty.

- [ ] **Step 5: Add failure and determinism tests**

Set `CONTEXTPACK_PYTHON` to an impossible command and assert analysis still
returns the Python file plus exactly one `PYTHON_UNAVAILABLE` warning. Add an
invalid `.py` file beside a valid file and assert only the invalid file falls
back. Run the same valid fixture twice and deep-compare all fields except
absolute temporary roots.

- [ ] **Step 6: Run focused tests and typecheck**

```powershell
npx vitest run tests/python-adapter.test.ts tests/language-registry.test.ts
npm run typecheck
```

Expected: all focused tests pass and TypeScript reports zero errors.

- [ ] **Step 7: Commit**

```powershell
git add src/types.ts src/languages/python-worker.ts src/languages/python.ts tests/python-adapter.test.ts
git commit -m "feat: add Python AST language adapter"
```

---

### Task 2: Add Python discovery, config metadata, and mixed dispatch

**Files:**
- Modify: `src/languages/defaults.ts`
- Modify: `src/repository/discover.ts`
- Modify: `src/repository/packages.ts`
- Modify: `src/analysis/config-files.ts`
- Modify: `tests/ast.test.ts`
- Modify: `tests/discover.test.ts`
- Modify: `tests/integration.test.ts`
- Modify: `tests/doctor.test.ts`

**Interfaces:**
- Consumes: `pythonAdapter` from Task 1 and the existing registry dispatcher.
- Produces: Python-only and mixed repository discovery with accurate project/config metadata.

- [ ] **Step 1: Write failing registry and discovery tests**

Update exact default-registry assertions to require adapter IDs
`["javascript-typescript", "python"]`, append `"**/*.py"` to source patterns,
and append the Python config patterns in the adapter's declared order. Add a
fixture containing `.venv/ignored.py`, `__pycache__/ignored.py`, `src/app.py`,
`pyproject.toml`, and `setup.cfg`; only the intended source/config paths may be
returned.

Add Python-only and mixed fixtures asserting `snapshot.projectType` is
`["Python"]` and contains both existing JS labels and `Python`, respectively.
Assert a config-only Python directory still throws `UNSUPPORTED_REPOSITORY`
with the generic message `No supported source files were found.`

- [ ] **Step 2: Run the focused tests and confirm failure**

```powershell
npx vitest run tests/discover.test.ts tests/ast.test.ts tests/integration.test.ts tests/doctor.test.ts
```

Expected: FAIL because Python is not in the default registry and messages remain JS/TS-specific.

- [ ] **Step 3: Register Python and extend shared filtering**

Register `pythonAdapter` after `javascriptTypeScriptAdapter`. Add these exact
ignore patterns to `ALWAYS_IGNORED`:

```ts
"**/.venv/**", "**/venv/**", "**/__pycache__/**", "**/.tox/**",
"**/.nox/**", "**/site-packages/**", "**/*.egg-info/**", "**/eggs/**"
```

Replace only the unsupported-source text with the generic message. Preserve
Git root, `.gitignore`, sensitive-file, normalization, ownership, and sorting behavior.

- [ ] **Step 4: Add additive Python project and package-root metadata**

Extend `detectProjectTypes` to accept discovered source/config paths. Add
`Python` when a `.py` source or Python config marker exists. Preserve the
existing fallback `JavaScript/TypeScript` only when no language evidence exists.

Extend `packageDirectoryFor` so the nearest directory containing
`pyproject.toml`, `setup.py`, or `setup.cfg` is considered after the existing
`package.json` directories. Longest matching directory wins; JS-only results
must remain byte-for-byte unchanged.

- [ ] **Step 5: Classify shared config contents by extension**

Return `json` for `.json`, `python` for `.py`, and `text` for TOML, INI, CFG,
lock, requirements, and unknown config formats. Preserve `isConfig: true` and
the source-path de-duplication that prevents a second `setup.py` analysis.

- [ ] **Step 6: Make doctor source messaging language-neutral**

Use `Found N supported source files.` on success and recommend a project root
containing JavaScript, TypeScript, or Python sources on failure. Do not add a
new mandatory Python-runtime doctor check because fallback is supported.

- [ ] **Step 7: Run focused and regression tests**

```powershell
npx vitest run tests/discover.test.ts tests/ast.test.ts tests/integration.test.ts tests/doctor.test.ts tests/language-registry.test.ts
npm run typecheck
```

Expected: Python-only and mixed fixtures pass; existing JS/TS fixture projections remain unchanged.

- [ ] **Step 8: Commit**

```powershell
git add src/languages/defaults.ts src/repository/discover.ts src/repository/packages.ts src/analysis/config-files.ts tests/ast.test.ts tests/discover.test.ts tests/integration.test.ts tests/doctor.test.ts
git commit -m "feat: discover Python and mixed-language repositories"
```

---

### Task 3: Extend lexical and structural ranking semantics for Python

**Files:**
- Modify: `src/ranking/lexical.ts`
- Modify: `src/ranking/score.ts`
- Modify: `src/ranking/predictions.ts`
- Modify: `tests/lexical.test.ts`
- Modify: `tests/ranking.test.ts`
- Modify: `tests/predictions.test.ts`
- Modify: `tests/integration.test.ts`

**Interfaces:**
- Consumes: normalized Python `FileAnalysis` values from Tasks 1-2.
- Produces: Python BM25 evidence, test relationships, barrel traversal, and diversity caps without weight changes.

- [ ] **Step 1: Write failing Python lexical tests**

Create Python `FileAnalysis` fixtures and assert a task term found only in a
`#` comment contributes `comment` evidence at the correct line, identifiers and
docstrings contribute their existing fields, and a relevant Python file beats
an unrelated Python file. Retain all existing JS string/comment/title assertions unchanged.

- [ ] **Step 2: Write failing structural and prediction tests**

Assert `__init__.py` participates in two-hop barrel traversal;
`test_service.py`, `service_test.py`, and `service.py` share test strength;
Python test/config/barrel candidates obey the existing default category caps;
and mixed prediction order remains deterministic.

- [ ] **Step 3: Run focused tests and confirm failure**

```powershell
npx vitest run tests/lexical.test.ts tests/ranking.test.ts tests/predictions.test.ts tests/integration.test.ts
```

Expected: FAIL because Python is excluded from lexical documents and path categories.

- [ ] **Step 4: Add Python lexical support without weight changes**

Add triple-single-quoted and triple-double-quoted strings before the existing
single-line quote alternatives, then add `#[^\r\n]*` to `CONTENT_TOKEN`.
Classify values beginning with `#` as comments and include
`file.language === "python"` in `scoreContentMatches`.
Do not change limits, field weights, BM25 constants, denominator, or
`coverageRatio^0.4`.

- [ ] **Step 5: Generalize structural path helpers**

Treat `__init__.py` as a barrel alongside the existing JS `index.*` regex.
Normalize Python test stems by removing leading `test_` and trailing `_test`
before comparing. Extend prediction test/config/barrel categories with Python
paths and config names while preserving the existing JS regex branches.

- [ ] **Step 6: Run focused tests, all ranking tests, and typecheck**

```powershell
npx vitest run tests/lexical.test.ts tests/ranking.test.ts tests/predictions.test.ts tests/integration.test.ts
npm run typecheck
```

Expected: all tests pass with no updates to existing JS/TS numeric expectations.

- [ ] **Step 7: Commit**

```powershell
git add src/ranking/lexical.ts src/ranking/score.ts src/ranking/predictions.ts tests/lexical.test.ts tests/ranking.test.ts tests/predictions.test.ts tests/integration.test.ts
git commit -m "feat: rank Python source and test relationships"
```

---

### Task 4: Add Python verification commands and rendered output

**Files:**
- Modify: `src/analysis/analyze.ts`
- Modify: `src/output/markdown.ts`
- Modify: `tests/integration.test.ts`
- Modify: `tests/markdown.test.ts`
- Modify: `scripts/package-smoke.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: discovered Python sources/configs and existing npm command suggestions.
- Produces: evidence-based Python `SuggestedCommand[]`, Python-aware Markdown, and installed-package Python smoke.

- [ ] **Step 1: Write failing command and Markdown tests**

Add Python-only fixtures for:

```ts
expect(manifest.commands).toContainEqual({
  name: "test",
  command: "python -m pytest",
  directory: ".",
  reason: "Pytest configuration detected",
});
expect(markdown).toContain("```python");
```

Also test unittest fallback, configured Ruff (`python -m ruff check .`),
configured mypy (`python -m mypy .`), mixed npm/Python deterministic ordering,
and the five-command cap. Do not suggest pytest from `.py` files alone.

- [ ] **Step 2: Run focused tests and confirm failure**

```powershell
npx vitest run tests/integration.test.ts tests/markdown.test.ts
```

Expected: FAIL because only package.json scripts and JS/JSON fences are supported.

- [ ] **Step 3: Implement evidence-based Python command detection**

Make command discovery async so it can read only discovered config files.
Detect pytest from `pytest.ini`, `[tool.pytest` in `pyproject.toml`, or a
standalone `pytest` dependency token in requirements/setup config. Detect Ruff
from `ruff.toml`, `.ruff.toml`, or `[tool.ruff`; mypy from `mypy.ini`,
`.mypy.ini`, or `[tool.mypy`; build from a `pyproject.toml` containing
`[build-system]`. Use unittest only when Python test paths exist and no pytest
evidence exists. Preserve existing npm suggestions first, de-duplicate by
`directory + command`, and cap at five.

- [ ] **Step 4: Add Python-aware rendering**

Map `.py` to `python`, `.toml` to `toml`, and `.ini`/`.cfg` to `ini` code
fences. Change the empty verification copy to `No verification commands were discovered.`
and leave all other output sections and budget behavior unchanged.

- [ ] **Step 5: Extend installed package smoke**

After the existing TypeScript fixture succeeds, create a Python fixture with
`pyproject.toml`, `src/session.py`, and `tests/test_session.py`. Run the packed
CLI against `refresh the Python session`, then assert `manifest.json` contains
a Python candidate and `context.md` contains a Python fence. The smoke must
accept either AST output or the documented `PYTHON_UNAVAILABLE` fallback so it
does not depend on CI interpreter availability.

- [ ] **Step 6: Run focused tests and package smoke**

```powershell
npx vitest run tests/integration.test.ts tests/markdown.test.ts
npm run build
npm run test:package
```

Expected: focused tests pass and output ends with `Package smoke passed`.

- [ ] **Step 7: Commit**

```powershell
git add src/analysis/analyze.ts src/output/markdown.ts tests/integration.test.ts tests/markdown.test.ts scripts/package-smoke.ts package.json
git commit -m "feat: expose Python verification context"
```

---

### Task 5: Add Python smoke benchmark and document support

**Files:**
- Create: `scripts/python-smoke.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `benchmarks/README.md`

**Interfaces:**
- Consumes: the complete Python adapter vertical slice.
- Produces: reproducible Python smoke evidence and accurate user/maintainer documentation.

- [ ] **Step 1: Implement the deterministic Python smoke**

Generate 120 Python sources and 40 tests in a temporary `src/` layout. Every
module imports the previous module, contains a task-relevant comment and public
function, and every third module has a test. Warm once, run three measured
iterations, compare a fingerprint of candidate paths/scores/reasons, require a
Python candidate and resolved import edge, and fail when median total duration
exceeds `4000 ms`. Support `CONTEXTPACK_PYTHON_SMOKE_LIMIT_MS` and
`CONTEXTPACK_PYTHON_SMOKE_ITERATIONS` positive-integer overrides.

Add:

```json
"perf:python": "tsx scripts/python-smoke.ts"
```

- [ ] **Step 2: Run the Python smoke**

```powershell
npm run perf:python
```

Expected: three deterministic runs, a stable fingerprint, and median below 4000 ms.

- [ ] **Step 3: Update product documentation**

Update both READMEs to state Python and mixed JS/Python support, the Python
3.8+ AST enhancement and lexical fallback, supported symbols/imports/configs,
verification commands, and current non-goals. Remove Python from unsupported
language lists but do not claim framework, type-inference, Skill, MCP, plugin,
or public-SDK support.

Add a `P1.1 Python Adapter Vertical Slice` benchmark section describing the
fixture, runtime, median, fallback behavior, quality gates, and P1.0 parity result.

- [ ] **Step 4: Run local quality and performance gates**

```powershell
npm run check
npm run perf:smoke
npm run perf:python
```

Expected: typecheck, all tests, build, package smoke, and both performance smokes pass.

- [ ] **Step 5: Build and run the full 43-task JS/TS parity evaluation**

The 43 pinned base commits were preflighted before implementation and contain
zero tracked `.py` files, so additive Python discovery must not change their
candidate sets.

```powershell
npm run build
node dist/cli.js eval-issues `
  --dataset C:\Users\Administrator\Documents\contextpack\.benchmarks\datasets\swe-bench-multilingual-js-ts.jsonl `
  --cache C:\Users\Administrator\Documents\contextpack\.benchmarks\repositories `
  --history 100 --budget 12000 --line-budgets 100,250,500 `
  --instance-timeout 600 --git-timeout 300 `
  --output .contextpack/evals/p11-full-43
```

Resume rather than restart if interrupted. Require 43 valid instances and zero skips.

- [ ] **Step 6: Compare against the validated P1.0 projection**

```powershell
npx tsx scripts/compare-eval-parity.ts `
  C:\Users\Administrator\Documents\contextpack\.contextpack\evals\p10-full-43\results.json `
  .contextpack/evals/p11-full-43/results.json
```

Expected: `Parity: equal`. Any mismatch blocks completion; do not relax the
projection. The aggregate remains R@10 `0.3891472868`, MRR `0.1771596393`,
line@500 `0.1030487768`, useful-hit@500 `0.2093023256`.

- [ ] **Step 7: Run Axios and historical replay parity checks**

```powershell
node dist/cli.js eval-issues `
  --dataset C:\Users\Administrator\Documents\contextpack\.benchmarks\datasets\swe-bench-multilingual-js-ts.jsonl `
  --cache C:\Users\Administrator\Documents\contextpack\.benchmarks\repositories `
  --repo axios/axios --history 50 --budget 12000 `
  --line-budgets 100,250,500 --instance-timeout 600 --git-timeout 300 `
  --output .contextpack/evals/p11-axios-smoke
node dist/cli.js eval --commits 20 --budget 12000 --query-mode title `
  --output .contextpack/evals/p11-history-title
node dist/cli.js eval --commits 20 --budget 12000 --query-mode keyword-ablated `
  --output .contextpack/evals/p11-history-ablated
```

Compare against `C:\Users\Administrator\Documents\contextpack\.contextpack\evals\p10-*`.
Expected Axios values remain R@10 `0.650`, MRR `0.380`, line@500 `0.577`,
useful-hit@500 `0.833`; predictions on every common replay commit remain
identical. Record valid-commit counts and expanded-sample aggregates separately.

- [ ] **Step 8: Final verification and commit**

```powershell
npm run check
npm run perf:smoke
npm run perf:python
git diff --check
git add scripts/python-smoke.ts package.json README.md README.zh-CN.md benchmarks/README.md
git commit -m "docs: validate Python adapter vertical slice (P1.1)"
```

Expected: all commands pass, only intended documentation/benchmark files are staged,
and raw `.contextpack/evals/p11-*` artifacts remain untracked.

## Final Review

Review the entire branch against
`docs/superpowers/specs/2026-07-19-python-adapter-design.md`. Confirm the worker
protocol is bounded and deterministic, warning/fallback behavior is explicit,
no source path can escape the repository, JS/TS parity is equal, the packed CLI
handles Python, and all support claims match measured behavior. Fix every
Critical or Important finding, rerun its covering tests, then repeat the final
quality and performance gates before integration.
