# ContextPack Project State

This file is the canonical project-status and iteration handoff for humans and
external models. Read `AGENTS.md` for operating rules, this file for current
state, the linked design and plan for active work, and `benchmarks/README.md`
for complete benchmark history.

## Snapshot

| Field | Value |
|---|---|
| Updated | 2026-07-20 |
| Base commit | `32dcf5f` |
| Active branch | `codex/p1.2-python-benchmark` |
| Active milestone | P1.2 Python Benchmark |
| Phase | Design approved; written specification awaiting review |
| Product status | Unpublished source preview moving toward a beta candidate |

## Current Position

P1.1 delivered a Python 3.8+ AST adapter, Python and mixed-repository
discovery, Python lexical and structural signals, verification commands, and a
controlled lexical fallback. It proved that adding Python did not change the
pinned JavaScript/TypeScript evaluation outputs. It did not measure retrieval
quality on real Python issues.

P1.2 closes that evidence gap. It adds no ranking experiment. The milestone
generalizes the real-issue evaluator to Python, prepares a pinned Python issue
dataset, runs a balanced engineering gate, and then runs the full support-
claim gate.

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
| Written P1.2 design | In review |
| Implementation plan | Pending design approval |
| Evaluator and preparation implementation | Not started |
| 57-task engineering run | Not started |
| 300-task support-claim run | Not started |
| Documentation and final verdict | Not started |

## Evidence And Artifacts

- Benchmark methodology and recorded results: `benchmarks/README.md`
- P1.2 design: `docs/superpowers/specs/2026-07-20-python-benchmark-design.md`
- P1.2 implementation plan: not written until the design is approved
- Generated datasets and repository caches: `.benchmarks/` (ignored)
- Raw P1.2 reports: `.contextpack/evals/p12-*` (ignored)

## Decision Log

| Date | Decision | Reason |
|---|---|---|
| 2026-07-20 | P1.2 is Python Benchmark, not Skill/MCP | Python implementation exists, but real-issue retrieval quality is unmeasured |
| 2026-07-20 | Use SWE-bench Lite at a pinned revision | Public, auditable source with 300 eligible Python tasks across 12 repositories |
| 2026-07-20 | Use 57-task engineering and 300-task final gates | Fast infrastructure feedback without weakening the final evidence |
| 2026-07-20 | Keep scoring frozen during P1.2 | This milestone measures Python retrieval; it does not tune against the test set |
| 2026-07-20 | Maintain this root status file each iteration | Give humans and external models one current, versioned handoff |

## Roadmap

1. P1.2 Python Benchmark: active.
2. P1.3 Agent Skill: expose the validated core through an installable agent workflow.
3. P1.4 MCP Server: expose `build_context_pack`, `explain_candidate`, and `doctor` as structured tools.

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
