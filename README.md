<div align="center">

# ContextPack

**Give coding agents the right repository context before they start coding.**

Local, deterministic, and explainable task-context retrieval for JavaScript and TypeScript repositories.

[中文](README.zh-CN.md) | **English** | [Benchmark](benchmarks/README.md)

[![Status: Experimental](https://img.shields.io/badge/status-experimental-orange.svg)](#project-status)
[![Node.js 20+](https://img.shields.io/badge/node-%3E%3D20-339933.svg?logo=node.js&logoColor=white)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/Cminors/contextpack/actions/workflows/ci.yml/badge.svg)](https://github.com/Cminors/contextpack/actions/workflows/ci.yml)

</div>

ContextPack turns a feature request into a compact, evidence-backed map of the code, tests, repository rules, and Git relationships a coding agent should inspect first.

> **In plain English:** A large repository can contain thousands of files. Before an AI starts changing code, ContextPack finds the small set of code, tests, and project rules that actually matter for the task, then prepares them as a focused briefing. It does not write the code; it helps the coding agent understand the right part of the project before it begins.

```bash
contextpack task "add GitHub OAuth login"
```

```text
.contextpack/tasks/add-github-oauth-login/
|-- context.md       # Give this to Codex, Claude Code, Cursor, or another agent
`-- manifest.json    # Scores, evidence, relationships, and budget metadata
```

ContextPack does not call an LLM, require an API key, edit source code, or upload your repository.

## Why ContextPack

Coding agents can search an entire repository, but broad exploration spends context and often misses tests, export surfaces, or local instructions. ContextPack answers a narrower question:

> For this task, which files and symbols should the agent understand first, and why?

Every recommendation includes a score breakdown and concrete evidence. The same repository state, task, and options produce the same ranking.

## What You Get

A generated `context.md` contains:

- a ranked task map of files and symbols;
- selected code snippets under a configurable token budget;
- import, export, test, and local Git co-change relationships;
- applicable `AGENTS.md`, `CLAUDE.md`, Copilot, and Cursor rules;
- existing verification commands from package scripts;
- omitted candidates and risk-surface notes.

Example task map:

```text
Rank  File / symbol                         Evidence
1     src/auth/github.ts#GithubProvider     lexical + symbol
2     src/auth/index.ts                     export barrel
3     test/auth/github.test.ts              direct test relationship
4     src/session/store.ts                  import + Git co-change
```

## Quick Start

ContextPack currently ships as an experimental source preview. The npm package is not published yet.

```bash
git clone https://github.com/Cminors/contextpack.git
cd contextpack
npm ci
npm run build
npm link
```

Run it from an existing JavaScript or TypeScript repository:

```bash
cd /path/to/your-project
contextpack task "add GitHub OAuth login"
```

Requirements: Node.js 20 or newer and Git for history-aware ranking.

## Commands

### Build a context pack

```bash
contextpack task <description> \
  --budget 12000 \
  --format both \
  --history 500
```

| Option | Purpose |
|---|---|
| `--budget <4000..32000>` | Maximum estimated context size; default `12000` |
| `--format markdown\|json\|both` | Output format; default `both` |
| `--history <count>` | Local non-merge commits used for history signals |
| `--output <directory>` | Custom output directory |

### Explain a recommendation

```bash
contextpack explain src/auth.ts --task "add GitHub OAuth login"
contextpack explain loginWithGithub --task "add GitHub OAuth login"
```

### Evaluate retrieval on repository history

```bash
contextpack eval --commits 20 --budget 12000
```

Historical replay runs against parent revisions in detached temporary worktrees. It never checks out or modifies the active worktree.

## How Ranking Works

ContextPack combines six deterministic signals:

| Signal | Weight |
|---|---:|
| Task and path lexical match | 28% |
| Symbol relevance | 22% |
| Dependency and export proximity | 18% |
| Git title and co-change history | 15% |
| Test relationship | 10% |
| Rule and configuration relevance | 7% |

Candidate generation is bounded by workspace package, test, config, example, and export-barrel diversity. Missing signals are treated as unavailable, not negative evidence.

## Benchmark

Historical replay measures a retrieval proxy, not coding-agent success.

| Repository | JS/TS files | Feature commits | Recall@10 | MRR | Median tokens | Median analysis |
|---|---:|---:|---:|---:|---:|---:|
| `sindresorhus/p-map` | 6 | 12 | 1.000 | 0.757 | 1,498 | 666 ms |
| `modelcontextprotocol/typescript-sdk` | 635 | 20 | 0.414 | 0.605 | 9,002 | 2,029 ms |

The medium-repository result passes the MRR target (`>= 0.60`) but remains below the Recall@10 target (`>= 0.70`). See the [method, raw reports, limitations, and rejected experiments](benchmarks/README.md).

## Supported Scope

**Supported today**

- JavaScript, JSX, TypeScript, and TSX;
- npm, pnpm, Yarn, and Bun metadata;
- single-package repositories and common workspace layouts;
- `tsconfig` path aliases and bounded, task-focused TypeScript symbol relationships;
- small-to-medium feature additions;
- local Git history and common coding-agent instruction files.

**Not supported yet**

- automatic code changes;
- arbitrary bug diagnosis, security audits, or large refactors;
- Python, Go, Rust, Java, and other languages;
- hosted storage, accounts, collaboration, or built-in LLM calls;
- claims about improving final agent success rate.

## Privacy And Safety

- Repository analysis stays on the local machine.
- `.env`, private keys, credentials, dependencies, and build outputs are excluded.
- Snippets matching common secret patterns are not emitted.
- Git commands use argument arrays without shell interpolation.
- Evaluation verifies that branch, HEAD, index, and untracked files remain unchanged.

## Project Status

ContextPack is an experimental V0.1 with V0.2 retrieval work in progress. The CLI is usable and tested, but the medium-repository recall target has not been reached. Repositories with a root `tsconfig` now receive compiler-aware path resolution and bounded semantic expansion; config-less monorepos stay on the faster structural path until benchmark evidence justifies broader Program analysis.

## Development

```bash
npm ci
npm run check
npm run test:coverage
```

Current local quality gate: 33 tests passing, 90%+ line coverage, and no production dependency vulnerabilities. GitHub CI verifies Node.js 20 and 22.

## License

[MIT](LICENSE)
