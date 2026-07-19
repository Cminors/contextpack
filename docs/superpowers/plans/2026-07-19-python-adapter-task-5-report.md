# P1.1 Task 5 Report: Python Smoke And Documentation

## Scope

Implemented Task 5 from the P1.1 Python adapter plan on branch
`codex/p1.1-python-adapter`. The changes add a deterministic Python-only
performance/integration smoke and align package, user, Chinese, and benchmark
documentation with the implemented Python boundary.

## Changes

- Added `scripts/python-smoke.ts`, which generates 120 Python modules and 40
  test files, performs one warm analysis and three measured iterations, checks
  stable candidate fingerprints, requires Python candidates and a resolved
  internal import edge, and enforces a configurable 4,000 ms median limit.
- Added `npm run perf:python` and the positive-integer overrides
  `CONTEXTPACK_PYTHON_SMOKE_LIMIT_MS` and `CONTEXTPACK_PYTHON_SMOKE_ITERATIONS`.
- Updated package metadata and both READMEs to describe Python 3.8+ AST
  analysis, lexical fallback, symbols/imports/tests/configuration/commands,
  Python-only and mixed JS/Python repositories, and explicit non-goals.
- Added a P1.1 benchmark section with the measured synthetic smoke result and
  marked the fresh full-43 parity and real Python issue measurements as
  pending rather than claiming unrun results.

## Verification

- `npm run typecheck`: **passed**.
- `npm run perf:python`: **passed**; 120 modules + 40 tests, stable
  fingerprint, resolved import edge, and median total duration **848 ms**
  (848, 879, 725 ms), below the 4,000 ms default limit.
- The smoke reported the expected `NO_GIT_REPOSITORY` warning for its temporary
  fixture; no Python analysis warning occurred.
- Full `npm run check`, `npm run perf:smoke`, and fresh P1.1 full-43 parity are
  left for the parent agent's final integration gate.

## Concerns And Follow-up

- The smoke is intentionally synthetic and does not establish retrieval
  quality on real Python issue datasets.
- The benchmark section preserves P1.0 parity as a reference and explicitly
  labels the fresh P1.1 rerun as pending.
- `.superpowers/` and other existing untracked workflow files were not staged.
