# P1.2 Python Benchmark Design

## Status

Approved on 2026-07-20. The executable task breakdown is recorded in
`docs/superpowers/plans/2026-07-20-python-benchmark.md`.

## Objective

Measure ContextPack's file and region retrieval quality on real Python issues.
P1.1 proved implementation and JavaScript/TypeScript compatibility, but its
synthetic smoke did not establish Python retrieval quality. P1.2 supplies that
missing evidence without changing ranking behavior.

The milestone succeeds only when the evaluator can reproduce a pinned Python
dataset, complete the declared runs without skips, preserve the JS/TS baseline,
and report an honest support verdict against thresholds fixed before the full
run.

## Scope

P1.2 includes:

- a normalized Python issue language in the existing issue benchmark schema;
- old-side gold-region extraction for existing `.py` patch files;
- a pinned SWE-bench Lite preparation path;
- deterministic full and balanced datasets with integrity manifests;
- language-aware issue report limitations;
- unit and integration coverage for Python dataset preparation and evaluation;
- a 57-instance engineering run and a 300-instance final run;
- exact parity verification against the P1.1 JS/TS full-43 projection;
- benchmark and product-documentation updates based on the measured verdict;
- a versioned root `PROJECT_STATE.md` handoff maintained each iteration.

P1.2 excludes:

- scorer, signal-weight, localization, selection, or token-budget changes;
- framework-specific Python semantics;
- Python type inference or a complete call graph;
- new runtime dependencies;
- Skill and MCP integration;
- changes to historical gates or datasets after results are visible.

## Considered Approaches

### Full 300 Only

Running only all 300 SWE-bench Lite tasks gives the strongest single result,
but makes every parser, cache, checkpoint, and report defect expensive to find.
It is retained as the final gate, not the development loop.

### Manually Curated Small Set

A hand-selected issue set would run quickly but would make selection bias hard
to audit and would not justify a public support claim. This option is rejected.

### Pinned Two-Tier Dataset

The selected approach derives both runs from one pinned official source. A
balanced 57-instance set exercises all repositories and infrastructure. The
complete 300-instance set remains the only support-claim dataset. The scorer is
frozen throughout, so the smaller set cannot become a tuning target.

## Dataset Contract

The source is fixed as:

| Field | Value |
|---|---|
| Dataset | `princeton-nlp/SWE-bench_Lite` |
| Revision | `6ec7bb89b9342f664a54a6e0a6ea6501d3437cc2` |
| License | MIT |
| Split | `test` |
| File | `data/test-00000-of-00001.parquet` |
| Parquet SHA-256 | `7a21f37b8bc179c7db5beeb14e88ac538ba283455c776e6b2535bbfb6e3551b4` |
| Source rows | 300 |

An eligible instance must have a valid repository slug, a hexadecimal base
commit, non-empty issue text, and at least one old-side unified-diff hunk in an
existing `.py` file. New files and non-Python patch files are excluded from
gold regions and counted in metadata. Preparation must fail on source checksum
drift, row-count drift, duplicate instance IDs, an unexpected repository
distribution, or any instance without a Python gold region.

The full dataset contains all 300 eligible instances sorted by `instanceId`.
The balanced dataset groups the same normalized instances by repository, sorts
each group by `instanceId`, takes at most five per repository, combines the
groups, and sorts the result by `instanceId`. With the pinned revision this
must produce exactly 57 instances across all 12 repositories. The manifest
records the exact selected IDs and repository counts, making the selection
independently reproducible.

Generated Parquet, JSONL, and manifest files remain ignored under
`.benchmarks/datasets/`. Source constants, selection logic, tests, and recorded
aggregate results are version controlled.

## Architecture

### Generic Issue Dataset Boundary

`IssueBenchmarkInstance.language` becomes a closed union of
`"javascript-typescript" | "python"`. Dataset reading and validation move to a
language-neutral module so the CLI and evaluator do not depend on the current
JS/TS preparation module. The report and checkpoint stay at version 1 because
their serialized result shape does not change.

The evaluator continues rejecting mixed source dataset/revision reports. A
single prepared Python dataset therefore has one source, revision, and
language. Dataset language is validated at load time and never inferred from a
repository checkout.

### Patch Region Extraction

The unified-diff parser accepts an explicit benchmark language and selects
supported extensions through a small language-to-file predicate. JS/TS keeps
its existing extension behavior byte-for-byte; Python accepts only `.py`.
Gold labels remain old-side hunks. Insertion-only hunks retain the existing
one-line anchor behavior.

Gold regions are never passed to `analyzeTask`. They are joined with completed
predictions only during metric calculation, preserving the existing
label-blind evaluation boundary.

### Python Dataset Preparation

A dedicated SWE-bench Lite Python adapter owns source metadata, row
normalization, integrity checks, full-set output, balanced selection, and both
manifests. It reuses the existing Parquet library and download conventions; no
dependency is added.

The preparation command writes both normalized JSONL files in one invocation.
It does not silently reuse output produced from a different revision or
checksum. `--force` may replace generated output only after source integrity is
verified.

### Evaluation And Reporting

`eval-issues --dataset <path>` continues to run any valid normalized dataset.
The default dataset remains the existing JS/TS file, preserving CLI behavior.
Checkpoint configuration matching, repository caching, timeouts, resume,
retry-skipped, audit, and diagnostics are reused unchanged.

Report limitations become language-aware. A Python report says that only
existing Python patch files are scored; a JS/TS report preserves its current
wording. Raw reports remain under `.contextpack/evals/p12-*`.

### Project State Ledger

`PROJECT_STATE.md` is the canonical cross-model handoff for current milestone,
verified baselines, active gates, known caveats, decisions, artifact paths, and
roadmap. It does not replace:

- `AGENTS.md`, which defines agent operating rules;
- design specifications, which define approved behavior;
- implementation plans, which define executable steps;
- `benchmarks/README.md`, which retains full methodology and result history.

Every milestone updates the ledger before completion. Metrics enter the ledger
only after raw artifacts exist and have been independently read back.

## Evaluation Protocol

All runs use the committed scorer and these fixed settings:

```text
history: 100
token budget: 12000
line budgets: 100,250,500
instance timeout: 600 seconds
Git timeout: 300 seconds
```

The sequence is mandatory:

1. Run focused dataset, parser, evaluator, resume, and report tests.
2. Run `npm run check` and `npm run perf:smoke`.
3. Re-run the pinned 43-task JS/TS set and require exact P1.1 projection parity.
4. Run the balanced Python set and require 57/57 valid with zero skips.
5. Audit failures and infrastructure behavior without changing the scorer,
   selected instances, or declared thresholds.
6. Run all 300 Python instances and require 300/300 valid with zero skips.
7. Read aggregate values from `results.json`, apply the declared verdict, and
   update benchmark and product documentation.

Interrupted runs resume from matching checkpoints. Persistent skips are
retried with `--retry-skipped`; any remaining skip makes that run invalid.

## Gates And Verdicts

### Compatibility Gates

- Existing JS/TS dataset preparation output remains stable.
- The P1.1 full-43 stable projection is exactly equal per instance.
- No ranking or selection source file changes.
- `npm run check` passes.
- `npm run perf:smoke` remains below `4,000 ms` median.

### Engineering Gate

The balanced run must produce 57/57 valid results and zero skips. Its metrics
are recorded for diagnosis but do not establish the public support verdict.

### Support-Claim Gate

The full 300-task run uses these predeclared floors:

| Metric | Floor |
|---|---:|
| File Recall@10 | 0.250 |
| File MRR | 0.100 |
| Line recall @500 | 0.050 |
| Useful hit @500 | 0.100 |

The verdict is deterministic:

- `validated`: all four floors pass on 300/300 with zero skips;
- `file-only`: both file floors pass, but one or both region floors fail;
- `not-validated`: either file floor fails;
- `invalid-run`: any instance remains skipped.

The result is descriptive, not self-correcting. P1.2 does not tune the scorer
or lower a floor after seeing the result. A failed run is documented with its
failure-stage distribution and becomes input to a separately designed future
milestone.

## Testing

Unit coverage must prove:

- `.py` hunks are accepted only for Python instances;
- JS/TS patch parsing is unchanged;
- new files, unsupported files, unsafe paths, and no-old-side hunks are
  classified correctly;
- normalized Python instances reject invalid language, commit, metadata,
  duplicate ID, and empty-gold inputs;
- full and balanced selection is deterministic and produces 300 and 57 IDs;
- manifests contain revision, checksum, repository counts, and selected IDs;
- source checksum or distribution drift fails closed;
- language-aware limitations render correctly;
- Python checkpoints resume and reject incompatible configurations.

Integration coverage uses a local Python Git fixture and proves that issue
text reaches analysis, gold data remains label-blind, `.py` predictions and
regions are scored, repository state is unchanged, and no network access is
required by tests.

## Error Handling

Preparation errors distinguish download failure, integrity mismatch, source
drift, and normalized dataset validation. No partially downloaded file replaces
a verified cache. Evaluation preserves the existing per-instance skip record,
timeout isolation, checkpoint persistence, and retry behavior.

An unavailable Python interpreter is not automatically a skipped issue: the
P1.1 adapter's controlled lexical fallback still produces a result and warning.
The benchmark environment must nevertheless record the detected interpreter so
the final run is reproducible. The support claim applies to the measured
environment and does not convert the lexical fallback into an AST-quality
claim.

## Documentation And Claims

Before the full result, documentation may say that ContextPack implements a
Python adapter and that real-issue validation is in progress. After the run:

- `validated` permits a benchmark-backed Python retrieval claim with exact
  metrics and stated limitations;
- `file-only` permits only a file-retrieval claim and must state that region
  localization is not validated;
- `not-validated` or `invalid-run` must retain experimental wording and report
  the failed gates.

`benchmarks/README.md` receives full methodology, aggregate tables, failure
audit, runtime, environment, and raw artifact paths. `README.md`,
`README.zh-CN.md`, and `PROJECT_STATE.md` receive the concise result and claim
boundary.

## Follow-Up Boundary

P1.3 may design an installable Agent Skill only after P1.2 records its verdict.
P1.4 may design an MCP server after the shared callable facade is stable. A
failed P1.2 gate does not block all integration work, but every Skill or MCP
surface must preserve the same qualified Python claim rather than presenting
unvalidated retrieval as complete support.
