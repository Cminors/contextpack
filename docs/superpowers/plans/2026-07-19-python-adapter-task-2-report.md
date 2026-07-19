# P1.1 Task 2 Report: Python Discovery and Mixed Dispatch

## Scope

Implemented Task 2 from the P1.1 Python adapter plan on branch
`codex/p1.1-python-adapter`. The change is limited to discovery, project/config
metadata, default adapter registration, and doctor messaging. Ranking, command
suggestions, and rendering remain unchanged for Task 3/4.

## Changes

- Registered `pythonAdapter` second in the default language registry, preserving
  JavaScript/TypeScript dispatch order.
- Added the planned Python virtual-environment, cache, packaging, and install
  directory ignore patterns.
- Made unsupported-source errors and doctor source counts language-neutral.
- Added evidence-based `Python` project metadata for `.py` sources and Python
  packaging/test configuration markers. Mixed repositories receive the generic
  `JavaScript/TypeScript` label before `Python` when no existing JS-specific
  package label is present; existing JS-only package labels are preserved.
- Extended package-root resolution to include the nearest `pyproject.toml`,
  `setup.py`, or `setup.cfg`, with the existing longest-match behavior.
- Classified shared config files as `json`, `python`, or `text` by extension and
  retained source/config de-duplication (notably `setup.py`).

## Verification

- Focused discovery/AST/integration/doctor/registry tests: **29 passed**.
- Full Vitest suite: **25 files, 131 tests passed**.
- `npm run typecheck`: **passed**.

## Concerns and follow-up

- Python AST execution and fallback behavior belong to Task 1 and were not
  changed here.
- Python ranking semantics, verification command suggestions, Markdown fences,
  package smoke, and benchmark documentation remain for later P1.1 tasks.
- `.superpowers/sdd/progress.md` is an existing untracked workflow artifact and
  is intentionally excluded from the commit.
