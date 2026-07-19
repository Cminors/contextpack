# P1.1 Task 1 Report

Status: complete.

Implemented the Python language adapter vertical slice with a version-1 embedded
Python standard-library `ast` worker, deterministic repository-internal import
resolution, normalized `FileAnalysis` output, and controlled unavailable,
analysis, and per-file parse fallback warnings.

Files:

- `src/types.ts`
- `src/languages/python-worker.ts`
- `src/languages/python.ts`
- `tests/python-adapter.test.ts`

Tests:

- `npx vitest run tests/python-adapter.test.ts tests/language-registry.test.ts` (19 passed)
- `npm run typecheck` (passed)

Review hardening added strict nested worker-response validation with requested
path completeness checks, relative-import suffix restrictions, and lexical
fallback for non-zero/malformed worker output. Node and the embedded worker now
enforce repository-root and realpath containment before reading source files.
Unsafe-path fallbacks also expose only a synthetic root-contained absolute path.
A filesystem symlink regression test verifies escaped content remains unread,
the warning is `PYTHON_ANALYSIS_FAILED`, and fallback metadata stays inside the
repository; it skips only when the platform cannot create file symlinks.

Commit: `feat: add Python AST language adapter` (atomic implementation commit).

Concerns: Python 3.8+ is preferred for AST analysis; when no interpreter is
available, the adapter intentionally returns lexical-only records and a stable
`PYTHON_UNAVAILABLE` warning. Framework-specific semantics and Python reference
enrichment remain outside Task 1.
