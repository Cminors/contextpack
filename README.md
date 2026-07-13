# ContextPack

Give an AI coding assistant a small, focused repository briefing before it starts changing code.

[中文](README.zh-CN.md) | **English** | [Benchmark](benchmarks/README.md)

[![Status: Source Preview](https://img.shields.io/badge/status-source_preview-orange.svg)](#project-status)
[![Node.js 20+](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/Cminors/contextpack/actions/workflows/ci.yml/badge.svg)](https://github.com/Cminors/contextpack/actions/workflows/ci.yml)

ContextPack is a local command-line tool for JavaScript and TypeScript repositories. Describe a coding task in one sentence and it finds the code, tests, repository rules, and related files an AI coding assistant should inspect first. It then creates a `context.md` briefing that you can give to Codex, Cursor, Claude Code, or another coding agent.

```text
Your task description
    ↓
ContextPack analyzes the repository locally
    ↓
.contextpack/tasks/<task-name>/context.md
    ↓
Give context.md and the original task to your coding assistant
```

ContextPack does not call an LLM, require an API key, upload your repository, or edit your source code.

> [!IMPORTANT]
> ContextPack is still an unpublished source preview. There is no npm release or formal beta yet. It is suitable for small, guided tests using this document, not for presenting as a finished product.

## What problem does it solve?

A large repository can contain hundreds or thousands of files. Coding assistants can search on their own, but broad exploration consumes context and may miss tests, export surfaces, or local instructions such as `AGENTS.md`.

ContextPack answers one narrow question:

> For this task, which files and code regions should the assistant understand first, and why?

It does not write the implementation. It prepares the repository briefing the assistant should read before it starts.

## Who is it for?

Good fit:

- people using Codex, Cursor, Claude Code, or another AI coding assistant;
- people who already have a JavaScript or TypeScript repository;
- people who want to reduce blind exploration in a large codebase;
- testers who are comfortable trying experimental tooling and reporting problems.

Not a good fit yet:

- people without a code repository who only want a general chatbot;
- Python, Go, Rust, Java, or other non-JS/TS projects;
- users who expect the tool to edit or commit code automatically;
- teams that require a stable commercial SLA or proven agent-success improvements.

## Beginner quick start

You do not need to understand ContextPack's ranking algorithm, but you do need to open a terminal and copy commands.

If you do not know how to open a terminal in a folder:

- Windows 11: right-click empty space in the folder and select **Open in Terminal**. You can also select the File Explorer address bar, type `powershell`, and press Enter.
- macOS: open Terminal, type `cd ` with a trailing space, drag the target folder into the Terminal window, and press Enter.
- VS Code / Cursor: open the project and select **Terminal → New Terminal**.

### Step 0: Make sure you have a repository to analyze

The target project needs at least one supported source file:

```text
.js  .jsx  .ts  .tsx  .mjs  .cjs  .mts  .cts
```

Run ContextPack from the project root—the directory that normally contains `package.json`, `src/`, or `.git/`.

### Step 1: Install Node.js

Install the current LTS release from the [official Node.js download page](https://nodejs.org/en/download). ContextPack requires Node.js 20 or newer; new testers should use the current LTS.

Open a new terminal after installation and run:

```bash
node --version
npm --version
```

Continue when both commands print a version number.

Git is not required for basic static analysis, but installing [Git](https://git-scm.com/downloads/) enables commit-history and co-change signals. It also makes downloading and updating ContextPack easier.

### Step 2: Get and install the source preview

Do not run `npm install -g contextpack` yet—the npm package has not been published.

If Git is installed, run:

```bash
git clone https://github.com/Cminors/contextpack.git
cd contextpack
npm ci
npm run build
npm link
```

Without Git:

1. Open the [ContextPack GitHub page](https://github.com/Cminors/contextpack).
2. Select the green **Code** button, then **Download ZIP**.
3. Extract the ZIP file.
4. Open a terminal in the extracted ContextPack directory.
5. Run:

```bash
npm ci
npm run build
npm link
```

Verify the installation:

```bash
contextpack --version
```

Expected output:

```text
0.1.0
```

### Step 3: Run it inside your project

First change into the JavaScript or TypeScript project you want to analyze.

Windows example:

```powershell
cd "C:\Users\your-name\Documents\my-project"
contextpack task "fix the missing message after login timeout"
```

macOS / Linux example:

```bash
cd ~/projects/my-project
contextpack task "fix the missing message after login timeout"
```

Task descriptions can be written in English or Chinese. Describe what should change and where it happens:

```bash
contextpack task "add SMS verification to the administrator login flow"
contextpack task "fix upload progress stopping at 99% for large files"
contextpack task "add a created-at filter to the order list"
```

Avoid descriptions that contain no useful context:

```text
fix it
improve the code
there is a bug
```

### Step 4: Find the generated files

When the command finishes, it prints something similar to:

```text
Context pack: C:\path\to\my-project\.contextpack\tasks\fix-login-timeout
Selected 8 snippets; estimated 7421/12000 tokens.
```

The output directory contains:

```text
.contextpack/tasks/<task-name>/
├── context.md       # This is the file most users need
└── manifest.json    # Rankings, scores, and diagnostic data
```

If your file manager does not display `.contextpack`, open the project in VS Code, Cursor, or a terminal. Directories beginning with a dot may be hidden.

### Step 5: Give the result to your coding assistant

Upload, drag, or paste `context.md` into your coding assistant and include the original task.

You can copy this prompt:

```text
The attached context.md was generated by ContextPack from the current repository and task.
Read its repository rules, candidate files, snippets, relationships, and risk notes first.
Then complete this task: fix the missing message after login timeout.
If ContextPack's suggestions conflict with the actual repository, trust the repository.
```

`context.md` is supporting evidence, not an absolute answer. The assistant should still inspect the repository, run tests, and verify its changes.

## Most-used commands

### Generate a context pack

```bash
contextpack task <description>
```

All options:

```bash
contextpack task <description> \
  --budget 12000 \
  --format both \
  --history 500 \
  --output <directory>
```

| Option | Purpose | Default |
|---|---|---:|
| `--budget <4000..32000>` | Maximum estimated context-token budget | `12000` |
| `--format markdown\|json\|both` | Write Markdown, JSON, or both | `both` |
| `--history <count>` | Local Git commits used for history signals | `500` |
| `--output <directory>` | Custom output directory | generated automatically |

### Explain a recommendation

```bash
contextpack explain src/auth.ts --task "add GitHub OAuth"
contextpack explain loginWithGithub --task "add GitHub OAuth"
```

### Show help

```bash
contextpack --help
contextpack task --help
contextpack explain --help
```

## Troubleshooting

### `contextpack` is not recognized / command not found

Return to the ContextPack source directory and run:

```bash
npm run build
npm link
```

Then close and reopen your terminal. If global linking still does not work, run the built CLI directly from the target project directory.

Windows:

```powershell
node "C:\path\to\contextpack\dist\cli.js" task "your task"
```

macOS / Linux:

```bash
node "/path/to/contextpack/dist/cli.js" task "your task"
```

### `node` or `npm` is not recognized

Node.js is either missing or the terminal has not been restarted since installation. Install the current LTS release, close all terminal windows, and try again.

### `No supported JavaScript or TypeScript source files were found`

The current directory contains no supported JS/TS files. Make sure you changed into the actual project root, not the ContextPack directory, your desktop, or an empty folder.

### ContextPack says the directory is not a Git repository

This is not fatal. Static analysis continues without Git-history signals. Install Git and use a Git repository when you want the complete ranking signal set.

### Analysis takes too long

The first run on a large repository may be slower. Reduce the history window:

```bash
contextpack task "your task" --history 100
```

Do not run ContextPack from a directory containing several unrelated projects. Change into the real project root first.

### Recommendations are unrelated to the task

- Make the task description more specific.
- Include the business object, failure symptom, or feature location.
- Check that you are on the correct branch and in the correct repository root.
- Report the issue with a sanitized task and `manifest.json` in [GitHub Issues](https://github.com/Cminors/contextpack/issues). Remove anything you do not want to publish first.

### Does ContextPack change my repository?

No. The normal `task` and `explain` commands read the repository and write generated files under `.contextpack/`. They do not edit source files, create commits, or call an external AI service.

## Updating and uninstalling

If you cloned with Git, update the source preview with:

```bash
cd contextpack
git pull
npm ci
npm run build
npm link
```

If you downloaded a ZIP, download and extract the latest version again, then rerun `npm ci`, `npm run build`, and `npm link`.

Remove the global link with:

```bash
npm uninstall -g contextpack
```

This does not remove the source directory or any `.contextpack/` results already generated in other projects.

## What does it generate?

`context.md` contains:

- the task and repository snapshot;
- ranked files and symbols;
- evidence explaining each selected file;
- import, export, test, and Git co-change relationships;
- applicable `AGENTS.md`, `CLAUDE.md`, Copilot, and Cursor rules;
- existing test, typecheck, and build commands;
- relevant files omitted by the budget;
- source snippets bounded by the token budget.

`manifest.json` provides machine-readable candidates, score breakdowns, relationships, budgets, warnings, and timing data. It is primarily useful for diagnostics and integrations.

## Privacy and safety

- Analysis runs locally.
- No LLM or API key is required.
- Repositories and generated results are not uploaded.
- `.env`, private keys, credentials, dependency directories, and build outputs are excluded.
- Snippets matching common secret patterns are not emitted.
- Git commands use argument arrays instead of shell-string interpolation.
- Historical evaluation uses isolated worktrees and does not switch the active workspace.

Automated filtering cannot guarantee that every sensitive value will be recognized. Review `context.md` before sending it to a third-party service.

## Supported scope

Supported today:

- JavaScript, JSX, TypeScript, TSX, MJS, CJS, MTS, and CTS;
- npm, pnpm, Yarn, and Bun project metadata;
- single-package repositories and common workspace/monorepo layouts;
- `tsconfig` path aliases;
- bounded TypeScript symbol and dependency relationships;
- local Git titles, file co-change history, and common agent instruction files;
- task descriptions in English and Chinese.

Not supported or not yet proven:

- automatic code changes or automatic agent execution;
- Python, Go, Rust, Java, and other languages;
- arbitrary large refactors, security audits, or complete bug diagnosis;
- hosted accounts, team collaboration, or built-in LLM calls;
- claims that ContextPack reliably improves final coding-agent success.

## Benchmark and current capability

ContextPack currently has two evaluation tracks:

1. historical replay, which checks whether real changed files are retrieved;
2. SWE-bench Multilingual JS/TS, which evaluates file and line-level retrieval for real issues.

Current key results:

| Evaluation | Samples | Recall@10 | MRR | What it measures |
|---|---:|---:|---:|---|
| MCP TypeScript SDK, title mode | 20 | 0.439 | 0.635 | medium-repository file retrieval |
| MCP TypeScript SDK, keyword ablation | 20 | 0.341 | 0.402 | retrieval after answer hints are removed |
| SWE-bench Axios issues | 6 | 0.617 | 0.205 | real-issue file and region smoke test |

Query-aware region localization raises Axios line recall from `0.000` at every budget to `0.167`, `0.355`, and `0.411` at 100, 250, and 500 emitted lines. Useful-hit rate reaches `0.667` at 500 lines, but this is still a six-task smoke result with high region noise—not evidence of general agent success.

See the [Benchmark document](benchmarks/README.md) for methodology, raw results, limitations, and rejected experiments.

## Evaluation commands for maintainers

Normal testers do not need these commands.

```bash
# Historical replay
contextpack eval --commits 20 --budget 12000 --query-mode title
contextpack eval --commits 20 --budget 12000 --query-mode keyword-ablated

# Prepare the pinned SWE-bench JS/TS dataset
npm run benchmark:prepare:swebench

# Real issue/patch retrieval evaluation
contextpack eval-issues --instance axios__axios-4738
contextpack eval-issues --repo axios/axios
contextpack eval-issues --line-budgets 100,250,500
```

Evaluation datasets and repository snapshots stay in the ignored `.benchmarks/` cache. Real-issue reports separate file Recall/MRR from the actual emitted regions. Gold labels are used only after retrieval has produced predictions.

## Reporting a test problem

Open a [GitHub Issue](https://github.com/Cminors/contextpack/issues) and include:

- operating system;
- `node --version` and `npm --version`;
- the ContextPack command you ran;
- the complete error message;
- approximate repository size and structure;
- for poor recommendations, a sanitized task and `manifest.json`.

Do not upload private source code, tokens, `.env` files, or other credentials.

## Project status

ContextPack is an unpublished experimental source preview. The core CLI, package structure, automated tests, performance smoke test, real-issue evaluation, and a first query-aware region localizer are in place. npm publishing, a formal release, zero-knowledge installation, full 43-task validation, and broadly reliable within-file localization are not finished.

The current goal is to let a small group of testers use the project safely and report understandable feedback—not to promote it broadly.

## Development

```bash
npm ci
npm run check
npm run test:coverage
npm run perf:smoke
```

Current quality gate: 68 tests passing, more than 88% line coverage, no production dependency vulnerabilities, and a deterministic 360-file performance smoke test. GitHub CI verifies Node.js 20 and 22.

## License

[MIT](LICENSE)
