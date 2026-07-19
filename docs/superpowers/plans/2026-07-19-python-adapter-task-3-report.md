# P1.1 Task 3 Report: Python Lexical and Structural Ranking

## Scope

Implemented Task 3 from the P1.1 Python adapter plan on branch
`codex/p1.1-python-adapter`. The changes extend lexical and structural ranking
for Python while preserving the existing JavaScript/TypeScript scoring
constants and behavior.

## Changes

- Added Python-only lexical tokenization for `#` comments and triple-single-
  and triple-double-quoted strings, including line-local evidence.
- Included non-configured Python files in BM25 content scoring.
- Kept the original JavaScript/TypeScript tokenizer isolated so private fields,
  hashbangs, and other existing syntax retain their prior interpretation.
- Recognized `__init__.py` as a two-hop package barrel with the existing
  dependency strengths.
- Normalized Python `test_foo.py` and `foo_test.py` stems alongside their
  source module for the existing test-strength signal.
- Added Python test, config, and barrel categories to bounded prediction
  selection, with deterministic mixed-language ordering.
- Classified top-level `def test_*`, async test functions, and `class Test*`
  nodes as pytest tests even when their paths are outside conventional test
  directories.

No score weights, BM25 constants, denominator, coverage multiplier, or
JavaScript/TypeScript path behavior were changed.

## Verification

- TDD RED: focused tests failed at the expected eight missing Python behavior
  points (lexical, structural, prediction, pytest classification, and
  integration).
- Focused Task 3 suite: **55 passed**.
- Full Vitest suite: **25 files, 140 tests passed**.
- `npm run typecheck`: **passed**.
- `git diff --check`: **passed**.

## Concerns and follow-up

- Python lexical support is intentionally path-based (`.py`) because the
  tokenizer API predates language metadata; this prevents new `#` handling from
  changing JavaScript private-field behavior.
- Python semantic references remain empty by design; richer call/reference
  analysis is outside P1.1.
- Verification-command discovery, Markdown fences, package smoke, and the
  Python performance benchmark remain for Tasks 4-5.
