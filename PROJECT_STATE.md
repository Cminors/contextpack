# ContextPack Project State

This file is the canonical project-status and iteration handoff for humans and
external models. Read `AGENTS.md` for operating rules, this file for current
state, the linked design and plan for active work, and `benchmarks/README.md`
for complete benchmark history.

## Snapshot

| Field | Value |
|---|---|
| Updated | 2026-07-21 |
| Base commit | `32dcf5f` |
| Active branch | `codex/p1.2-python-benchmark` |
| Active milestone | P1.2 Python Benchmark follow-up |
| Phase | Measurement complete with `invalid-run`; Python support claim withheld |
| Product status | Unpublished source preview moving toward a beta candidate |

## Current Position

P1.1 delivered a Python 3.8+ AST adapter, Python and mixed-repository
discovery, Python lexical and structural signals, verification commands, and a
controlled lexical fallback. It proved that adding Python did not change the
pinned JavaScript/TypeScript evaluation outputs. It did not measure retrieval
quality on real Python issues.

P1.2 attempted to close that evidence gap. It adds no ranking experiment. The milestone
generalizes the real-issue evaluator to Python, prepares a pinned Python issue
dataset, runs a balanced engineering gate, and then runs the full support-
claim gate. The balanced run was valid, but the full run retained four
persistent timeouts and is therefore an `invalid-run`; Python real-issue
retrieval remains unvalidated.

## Verified Baselines

| Milestone | Track | Result |
|---|---|---|
| P0.8 | JS/TS full 43 | 43/43 valid, 0 skips; R@10 `0.389`, MRR `0.177`, line@500 `0.099`, useful-hit@500 `0.186` |
| P0.9 | JS/TS full 43 | File predictions equal to P0.8; line@500 `0.103`, useful-hit@500 `0.209`; region misses `13 -> 11` |
| P1.0 | JS/TS adapter parity | Full-43 projection equal to P0.9 |
| P1.1 | Python synthetic smoke | Median `848 ms` recorded sample; bounded gate below `4,000 ms` |
| P1.1 | JS/TS regression | 43/43 valid, 0 skips; projection equal to P1.0 |

The P0.8 keyword-ablated replay aggregate remains an inherited caveat: R@10
`0.644`, MRR `0.577`, below the historical MRR floor `0.592`. The nine commits
shared with P0.7 reproduced the previous result exactly. P1.2 does not change
that gate or attempt to repair it.

## Active Iteration: P1.2 Python Benchmark

### Objective

Establish whether ContextPack retrieves useful files and code regions for real
Python issues before making a benchmark-backed Python support claim.

### Dataset

- Source: `princeton-nlp/SWE-bench_Lite`
- Revision: `6ec7bb89b9342f664a54a6e0a6ea6501d3437cc2`
- Split: `test`
- Parquet SHA-256: `7a21f37b8bc179c7db5beeb14e88ac538ba283455c776e6b2535bbfb6e3551b4`
- Eligible instances: 300 existing old-side Python patch instances across 12 repositories
- Engineering set: deterministic per-repository cap of five, 57 instances
- Final support-claim set: all 300 instances

### Declared Gates

The 57-instance engineering run must complete 57/57 with zero skips. The full
run must complete 300/300 with zero skips and meet every support-claim floor:

| Metric | Floor |
|---|---:|
| File Recall@10 | 0.250 |
| File MRR | 0.100 |
| Line recall @500 | 0.050 |
| Useful hit @500 | 0.100 |

Verdicts are fixed before the run:

- `validated`: all four floors pass on 300/300 valid instances with zero skips;
- `file-only`: both file floors pass, but either region floor fails;
- `not-validated`: either file floor fails;
- `invalid-run`: any instance remains skipped.

No threshold, dataset member, or scorer weight may be changed after observing
the benchmark result. A failed gate is a result to record, not a prompt to tune
against the test set.

### Scope

- Generalize normalized issue instances and old-side patch extraction to Python.
- Prepare pinned full and balanced JSONL datasets with auditable manifests.
- Preserve checkpoint, repository-cache, audit, diagnostic, and report behavior.
- Prove exact P1.1 parity on the pinned 43-task JS/TS projection.
- Run the balanced 57-task gate, then the full 300-task gate.
- Update English and Chinese support claims to match the measured verdict.

### Non-Goals

- No ranking, localization, selection, or scoring changes.
- No Django, FastAPI, or framework-specific ranking heuristics.
- No new runtime dependency.
- No Skill or MCP surface; those remain P1.3 and P1.4.
- No attempt to fix the inherited keyword-ablated replay floor.

### Work Status

| Item | Status |
|---|---|
| Repository and evaluator reconnaissance | Complete |
| Dataset source and two-tier scale decision | Complete |
| Written P1.2 design | Approved |
| Implementation plan | Approved and executing |
| Generic dataset language and Python patch regions | Complete; Task 1 review clean (`d1501bf`) |
| Pinned full/balanced Python dataset preparation | Complete; Task 2 review clean (`332af84`) |
| Python issue evaluator | Complete; Task 3 review clean (`81bd109`) |
| Automated Python support gates | Complete; Task 4 review clean (`eee54e0`) |
| Quality, performance, data, and JS/TS parity validation | Complete; Task 5 passed |
| 57-task engineering run | Complete; 57/57 valid, zero skips; Task 6 |
| 300-task support-claim run | Complete; 296/300 valid, 4 persistent skips; `invalid-run` |
| Documentation and final verdict | Complete; support claim withheld |

### P1.2 Compatibility Checkpoint

- `npm run check` passed with 28 test files and 216 tests, followed by a
  successful build and installed-package smoke.
- The JavaScript/TypeScript 360-file performance smoke passed with median
  total duration `3,003 ms`, below the `4,000 ms` limit.
- The Python performance smoke passed with median total duration `1,474 ms`,
  160 Python candidates, and a resolved repository-internal import edge.
- The pinned Python preparation produced 300 full and 57 balanced instances.
  Independent JSONL and manifest parsing confirmed 300/57 unique matching
  IDs, 12 repository keys in each manifest, source revision
  `6ec7bb89b9342f664a54a6e0a6ea6501d3437cc2`, and Parquet SHA-256
  `7a21f37b8bc179c7db5beeb14e88ac538ba283455c776e6b2535bbfb6e3551b4`.
- The P1.2 JavaScript/TypeScript projection completed 43/43 instances with
  zero skips and returned `Parity: equal` against the P1.0 reference. Its
  aggregate remained Recall@10 `0.38914728682170546`, MRR
  `0.1771596392663424`, line recall @500 `0.10304877678487387`, and useful
  hit @500 `0.20930232558139536`.

### P1.2 Python Engineering Checkpoint

The balanced engineering run completed 57/57 requested instances with 57
unique results and zero skips. The report contains all configured region
budgets (`100`, `250`, and `500`). This is an engineering validity gate only;
it is not the Python support verdict. The completed frozen 300-task run
supersedes it for support decisions and ended as `invalid-run`.

| Metric | Result |
|---|---:|
| File Recall@5 | `0.2982456140350877` |
| File Recall@10 | `0.47368421052631576` |
| File MRR | `0.18793068529910634` |
| Line recall @100 | `0.01417004048582996` |
| Line recall @250 | `0.058953050642801326` |
| Line recall @500 | `0.10338114576749088` |
| Useful hit @500 | `0.17543859649122806` |
| Median estimated tokens | `3996` |
| Median duration | `26590 ms` |

The audit classified 6 instances as file-hit/region-hit, 21 as
file-hit/region-miss, 9 as file-miss ranks 11-20, and 21 as file-miss outside
the top 20. Its aggregate failure counts were 30 file-ranking misses and 21
region-localization misses. The run environment was Node `v24.13.0`, Python
`3.9.11`, and Windows 10 Pro `10.0.19041` x64.

### P1.2 Python Full-Set Verdict

**Verdict: `invalid-run`.** The frozen full run requested all 300 instances but
produced 296 valid, unique results and four persistent skips. The skipped
instances were `sympy__sympy-17630`, `sympy__sympy-17655`,
`sympy__sympy-18057`, and `sympy__sympy-18087`; each timed out after the fixed
600,000 ms analysis limit on both its initial attempt and the permitted
`--resume --retry-skipped` retry. No timeout, dataset, scorer, region policy,
selection rule, budget, or floor was changed.

| Metric | Observed on 296 valid instances | Frozen floor | Result |
|---|---:|---:|---|
| File Recall@5 | `0.20270270270270271` | - | Diagnostic only |
| File Recall@10 | `0.3108108108108108` | `0.250` | Numeric pass; not claimable |
| File MRR | `0.12599583761541977` | `0.100` | Numeric pass; not claimable |
| Line recall @100 | `0.022093749067433277` | - | Diagnostic only |
| Line recall @250 | `0.04989810621961652` | - | Diagnostic only |
| Line recall @500 | `0.06671778756556317` | `0.050` | Numeric pass; not claimable |
| Useful hit @500 | `0.09797297297297297` | `0.100` | **Fail** |
| Median estimated tokens | `3997` | - | Diagnostic only |
| Median duration | `56072 ms` | - | Diagnostic only |

The zero-skip validity gate failed independently of the metric floors. The
frozen checker exited `2` and reported `Verdict: invalid-run`, plus failures for
the valid-instance count, result count, and skipped list. Its reported metrics
match `results.json`. The partial aggregate cannot validate Python file or
region retrieval and says nothing about code generation or patch correctness.

Independent raw validation confirmed version `1`, 300 requested checkpoint
IDs matching the 300 unique prepared dataset IDs, 296 unique result IDs, the
four missing IDs listed above, zero unexpected result IDs, source revision
`6ec7bb89b9342f664a54a6e0a6ea6501d3437cc2`, token budget `12000`, history
window `100`, and line budgets `100,250,500`. The environment was Node
`v24.13.0`, Python `3.9.11`, and Windows 10 Pro `10.0.19041` x64.

## Evidence And Artifacts

- Benchmark methodology and recorded results: `benchmarks/README.md`
- P1.2 design: `docs/superpowers/specs/2026-07-20-python-benchmark-design.md`
- P1.2 implementation plan: `docs/superpowers/plans/2026-07-20-python-benchmark.md`
- Generated datasets and repository caches: `.benchmarks/` (ignored)
- Raw P1.2 reports: `.contextpack/evals/p12-*` (ignored)
- Prepared Python datasets:
  `.benchmarks/datasets/swe-bench-lite-python-{full-300,balanced-57}.jsonl`
- P1.2 JavaScript/TypeScript parity report:
  `.contextpack/evals/p12-js-ts-full-43/results.json`
- P1.2 Python balanced engineering artifacts:
  `.contextpack/evals/p12-python-balanced-57/{results,checkpoint,audit,diagnostics}.json`
- P1.2 Python full invalid-run artifacts:
  `.contextpack/evals/p12-python-full-300/{results,checkpoint,audit,diagnostics}.json`
- P1.2 frozen checker stdout and stderr:
  `.contextpack/evals/p12-python-full-300/task7-gate.{stdout,stderr}.log`
- P1.2 full-run resume and retry logs:
  `.contextpack/evals/p12-python-full-300/task7-{resume,retry-skipped}.{stdout,stderr}.log`
- Stable parity reference: `.contextpack/evals/p10-full-43/results.json`

## Decision Log

| Date | Decision | Reason |
|---|---|---|
| 2026-07-20 | P1.2 is Python Benchmark, not Skill/MCP | Python implementation exists, but real-issue retrieval quality is unmeasured |
| 2026-07-20 | Use SWE-bench Lite at a pinned revision | Public, auditable source with 300 eligible Python tasks across 12 repositories |
| 2026-07-20 | Use 57-task engineering and 300-task final gates | Fast infrastructure feedback without weakening the final evidence |
| 2026-07-20 | Keep scoring frozen during P1.2 | This milestone measures Python retrieval; it does not tune against the test set |
| 2026-07-20 | Maintain this root status file each iteration | Give humans and external models one current, versioned handoff |
| 2026-07-21 | Balanced Python engineering gate passed | 57/57 valid with zero skips; engineering evidence only, superseded for support decisions by the completed full `invalid-run` |
| 2026-07-21 | Full Python support-claim run is `invalid-run` | Four SymPy instances persistently exceeded the frozen 600-second timeout; useful-hit @500 also missed its numeric floor |
| 2026-07-21 | Withhold the Python retrieval support claim | A partial 296-instance aggregate cannot satisfy the declared 300/300 zero-skip gate |
| 2026-07-21 | Final P1.2 evidence commit | `9946b97` (`docs: validate Python retrieval on real issues (P1.2)`) |

## Roadmap

1. P1.2 Python Benchmark follow-up: obtain a valid 300/300 report under a new,
   predeclared iteration before making any Python retrieval support claim.
2. P1.3 Agent Skill: pending a valid P1.2 report; expose the validated core
   through an installable agent workflow.
3. P1.4 MCP Server: pending P1.3; expose `build_context_pack`,
   `explain_candidate`, and `doctor` as structured tools.

The remaining 11 JS/TS localization misses are a future retrieval hypothesis,
not part of P1.2.

## Iteration Maintenance Contract

Every milestone must update this file before completion:

1. Replace the snapshot and active-iteration status.
2. Add verified metrics only after reading raw result artifacts.
3. Record failed gates and caveats without softening them.
4. Add important decisions with their reason and commit reference when known.
5. Link the active design, implementation plan, raw artifact locations, and
   benchmark documentation.
6. Keep detailed methodology in `benchmarks/README.md`; keep this file concise
   enough for a new model to understand the project in one pass.
