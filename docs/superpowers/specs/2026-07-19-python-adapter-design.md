# Python Adapter Vertical Slice Design

**Date:** 2026-07-19

**Status:** Approved for implementation

## Goal

Add first-class Python repository support without changing the ranking weights,
region-localization, selection, manifest, or CLI contracts. Python gets only
additive lexical and structural path handling; existing JS/TS behavior remains
unchanged. A Python
repository, and a repository mixing Python with JavaScript/TypeScript, should
produce useful context packs with deterministic source discovery, symbols,
internal imports, pytest-aware test classification, and evidence-based
verification commands.

## Scope

This phase includes:

- a second internal `LanguageAdapter` for `.py` files;
- Python source and configuration discovery with virtual-environment filtering;
- a standard-library `ast` batch worker invoked through a JSON stdin/stdout
  protocol and embedded in the Node bundle;
- top-level functions, async functions, classes, methods, variables, imports,
  one-based source ranges, and Python test/config classification;
- deterministic resolution of relative and repository-internal dotted imports;
- Python project-type metadata and verification-command suggestions;
- extension-aware config-file language labels and Python Markdown fences;
- Python-aware lexical comments and test-file structural heuristics;
- controlled lexical fallback with a warning when Python is unavailable or a
  file cannot be parsed;
- Python-only, mixed-repository, ignored-directory, malformed-input, package,
  and performance smoke coverage.

Explicit non-goals are Django/FastAPI semantics, Python type inference,
cross-language semantic references, dynamic import discovery, Go/Rust/Java
adapters, public plugin APIs, Skills/MCP integration, and ranking-weight
changes.

## Architecture

The existing flow remains:

```text
language registry
    -> union source/config patterns and shared filtering
    -> one adapter owner per source path
    -> JavaScript/TypeScript adapter + Python adapter
    -> normalized FileAnalysis values
    -> existing ranking, region selection, and rendering
```

The Python adapter owns `**/*.py`. It launches one worker per analysis batch
with `spawnSync(command, args, { input })`, where every argument is an array
element and the request is JSON:

```json
{"version":1,"root":"/repo","files":["src/app.py","tests/test_app.py"]}
```

The worker reads files with Python's standard-library `ast`, and emits only a
versioned JSON response. Each result contains symbols, import records with a
module name and relative-import level, `isTest`, `isConfig`, and parse errors.
Node resolves imports against the discovered `.py` paths, reads file content
for the normalized IR, and fills reverse edges exactly as the JavaScript
adapter does. The worker source is a TypeScript string bundled into `dist/cli.js`
so packed installations do not depend on an extra untracked file.

Python public symbols are module-level functions/classes/variables whose names
do not begin with `_`; class methods use `Class.method` and the same visibility
rule. Async definitions are functions/methods. If a non-empty module has no
recognized records, it receives the existing `module` fallback symbol.

Import resolution tries repository-relative dotted modules (`module.py` and
`module/__init__.py`), `src/` layouts, unique known-path suffixes, and relative
modules from the containing package. Ambiguous suffixes, external imports,
dynamic imports, and unresolved imports are omitted. No semantic-reference
enrichment is added in P1.1; `references`, `referencedBy`, and
`referenceSymbols` remain empty for Python.

The lexical tokenizer will recognize `#` comments and include Python files in
the BM25 document set. Existing JavaScript/TypeScript tokenization and the P0.7
coverage multiplier remain unchanged. Structural scoring will also recognize
`__init__.py` barrels and the `test_foo.py`/`foo_test.py` naming conventions so
Python tests receive the same bounded test-strength treatment as JS test files.

## Discovery And Metadata

The default registry keeps JavaScript/TypeScript first and registers Python
second. Python config patterns include nested `pyproject.toml`, `setup.py`,
`setup.cfg`, `tox.ini`, `pytest.ini`, `requirements*.txt`, `Pipfile`,
`poetry.lock`, and `uv.lock`. `setup.py` is discovered as a source file and is
emitted once by the Python adapter with `isConfig: true`; shared config analysis
must not duplicate it. Virtual environments and generated Python directories
(`.venv`, `venv`, `__pycache__`, `.tox`, `.nox`, `site-packages`, and `eggs`)
are ignored before ownership checks.

Project metadata reports `Python` when Python source or configuration evidence
exists and preserves existing JavaScript/TypeScript labels for JS projects.
The singular Node package-manager field remains unchanged; mixed Python/Node
tooling is represented through project labels and commands rather than a
breaking snapshot-schema change.

Verification suggestions preserve all existing npm script behavior. Python
commands are added only with evidence: `python -m pytest` for pytest config or
dependency evidence, `python -m unittest discover` for Python test files without
pytest evidence, and configured Ruff, mypy, or build commands when their config
sections/files are present. Suggestions remain deterministic and capped at five.

## Failure Behavior

If no Python executable is available, the adapter emits a warning with stable
code `PYTHON_UNAVAILABLE` and produces lexical-only Python analyses with empty
imports and symbols. A malformed individual file receives the same controlled
fallback and a `PYTHON_PARSE_FAILED` warning; malformed worker output or a
non-zero worker process produces `PYTHON_ANALYSIS_FAILED`; other files continue
to analyze.
The repository remains usable for mixed projects and does not silently claim
semantic Python coverage. JavaScript/TypeScript behavior is unaffected.

## Verification Strategy

Verification is layered:

1. protocol, symbol, import-resolution, fallback, registry, and config tests;
2. Python-only and mixed JS/Python integration fixtures, including command and
   Markdown output assertions;
3. unchanged JavaScript/TypeScript behavior and P1.0 parity projection;
4. `npm run check`, `npm run perf:smoke`, and package smoke from the packed CLI;
5. a deterministic Python smoke benchmark over a generated multi-file fixture,
   with a fixed candidate fingerprint and a documented latency ceiling.

The final acceptance bar is all existing checks passing, Python smoke passing,
and no change to the P1.0 43-task, Axios, or common replay predictions. A
Python runtime is used when available; fallback tests explicitly exercise the
controlled warning path so CI without Python remains deterministic.

## Follow-Up Boundary

After this vertical slice is stable, later work may add richer Python semantic
references, framework-aware signals, other language adapters, and a public
Skills/MCP facade. None of those are prerequisites for P1.1.
