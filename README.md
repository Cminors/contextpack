# ContextPack

Build a small, explainable context pack before handing a feature task to Codex, Claude Code, Cursor, or another coding agent.

ContextPack is local and read-only. It does not call an LLM, require an API key, or edit source code. It ranks JavaScript and TypeScript files using task terms, symbols, imports, tests, repository rules, and local Git co-change history.

## Quick start

Node.js 20 or newer is required.

```bash
cd your-project
npx contextpack task "add GitHub OAuth login"
```

The command writes:

```text
.contextpack/tasks/add-github-oauth-login/
├── context.md
└── manifest.json
```

Give `context.md` to your coding agent. It contains a ranked task map, inclusion reasons, relationships, applicable repository rules, verification commands, risk surface, and selected code snippets.

## Why this exists

Coding agents can explore a whole repository, but that exploration consumes time and context. ContextPack answers a narrower question first: which code, tests, rules, and historical relationships are most likely to matter for this task?

The ranking is deterministic and inspectable. It is not a semantic oracle and does not claim to replace an agent's own repository exploration.

## Commands

### Generate a task context pack

```bash
contextpack task <description> \
  --budget 12000 \
  --format both \
  --history 500
```

- `--budget`: 4000–32000 estimated tokens; default 12000.
- `--format`: `markdown`, `json`, or `both`.
- `--output`: custom output directory.
- `--history`: number of local non-merge commits used for co-change signals.

### Explain a result

```bash
contextpack explain src/auth.ts --task "add GitHub OAuth login"
contextpack explain loginWithGithub --task "add GitHub OAuth login"
```

This prints the score breakdown, reasons, and relationships for matching candidates.

### Historical replay evaluation

```bash
contextpack eval --commits 20 --budget 12000
```

Evaluation replays commit titles against their parent revisions in detached temporary Git worktrees. It never checks out the user's current worktree. The report includes Recall@5, Recall@10, MRR, Noise@10, test recall, token estimates, and duration.

These metrics are retrieval proxies. Changed files are not a complete ideal-context set, and high recall does not mean a Coding Agent will complete a task successfully.

## Supported scope

- JavaScript, JSX, TypeScript, and TSX repositories.
- npm, pnpm, Yarn, and Bun project metadata.
- Single packages and common workspace layouts.
- Small-to-medium feature additions.
- `AGENTS.md`, `CLAUDE.md`, Copilot instructions, Cursor rules, README, and CONTRIBUTING discovery.

ContextPack intentionally does not modify code, diagnose arbitrary bugs, provide a hosted service, or bundle an LLM.

## Ranking model

| Signal | Weight |
|---|---:|
| Task/path lexical match | 28% |
| Symbol relevance | 22% |
| Dependency proximity | 18% |
| Git title/co-change | 15% |
| Test relationship | 10% |
| Rule/config relevance | 7% |

Missing signals are treated as unavailable, not as negative evidence. Ties are resolved by repository-relative path for reproducibility.

## Security and privacy

- Analysis stays on the local machine.
- `.env`, private keys, credential files, dependencies, and build artifacts are excluded.
- Snippets matching common secret patterns are not emitted.
- Git is invoked with argument arrays and no shell interpolation.
- Historical replay verifies that the current branch, HEAD, index, and untracked-file fingerprint remain unchanged.

## Development

```bash
npm install
npm run check
```

## Benchmark status

The current medium-repository benchmark reaches Recall@10 0.403 and MRR 0.559 across 20 feature commits in the MCP TypeScript SDK. This is below the project release gate, so ContextPack should still be treated as an experimental V0.1 retrieval tool. See [`benchmarks/README.md`](benchmarks/README.md) for the method, limitations, and raw results.

## License

MIT
