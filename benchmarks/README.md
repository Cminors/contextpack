# ContextPack Retrieval Benchmark

This benchmark evaluates ContextPack as a retrieval proxy. It does not measure whether a coding agent completes a task successfully.

## Method

For each repository, `contextpack eval` scans local non-merge history and keeps commits that match the MVP scope:

- the title describes a feature addition (`feat:`, `feature:`, `add`, `implement`, `introduce`, or `support`);
- 1-15 JavaScript or TypeScript files changed;
- release, dependency, formatting, and lockfile commits are excluded;
- newly added files that do not exist in the parent revision are excluded from the reference set;
- the parent revision is analyzed in a detached temporary worktree;
- `title` mode uses the original commit title as the task;
- `keyword-ablated` mode removes exact gold paths, filenames, declarations, and a matching Conventional Commit scope before retrieval. Gold data is used only to remove leaked hints, never to generate predictions.

The changed files are an imperfect reference set. Recall is therefore a retrieval proxy, not an agent-success metric.

## Environment

- Date: 2026-07-13
- Node.js: 24.13.0
- Context budget: 12,000 tokens
- Git history window: 500 commits per replay
- Requested valid commits: 20 per repository

## Results

| Repository | JS/TS files | Valid commits | Recall@5 | Recall@10 | MRR | Noise@10 | Test recall | Median tokens | Median analysis |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `sindresorhus/p-map` | 6 | 12 | 1.000 | 1.000 | 0.757 | 0.501 | 1.000 | 1,498 | 666 ms |
| `modelcontextprotocol/typescript-sdk` | 635 | 20 | 0.292 | 0.414 | 0.605 | 0.825 | 0.472 | 9,002 | 2,029 ms |

`p-map` only contained 12 commits that satisfied the feature-addition filter, so it does not meet the desired 20-valid-commit sample size. The MCP TypeScript SDK supplies the meaningful medium-repository result.

## Benchmark V2 Keyword-Ablation Result

The same 20 MCP SDK feature commits were replayed in both query modes with the same 12,000-token budget and ranking implementation:

| Query mode | Commits | Recall@5 | Recall@10 | MRR | Noise@10 | Test recall | Median tokens |
|---|---:|---:|---:|---:|---:|---:|---:|
| `title` | 20 | 0.292 | 0.414 | 0.605 | 0.825 | 0.472 | 9,002 |
| `keyword-ablated` | 20 | 0.156 | 0.233 | 0.260 | 0.895 | 0.139 | 9,095 |

Eighteen of the 20 titles contained at least one removable answer hint; 30 hints were removed in total. Exact package, path, or declaration hints materially inflate the original historical-replay score. Keyword ablation preserves broader requirement language and records every removed hint for audit, but it does not synthesize an issue-style paraphrase.

## Baseline Comparison

The first MCP SDK run used the original mixed-commit evaluator and V0.1 ranking:

| Run | Recall@10 | MRR | Noise@10 | Median tokens | Median analysis |
|---|---:|---:|---:|---:|---:|
| V0.1 baseline, mixed commits | 0.210 | 0.267 | 0.925 | 13,854 | 3,351 ms |
| Feature-only evaluator before structural expansion | 0.403 | 0.559 | 0.835 | 9,555 | 1,946 ms |
| Current structural expansion | 0.414 | 0.605 | 0.825 | 9,002 | 2,029 ms |

These rows are not a controlled model-only comparison because the commit filter was corrected at the same time. They document iteration progress, not a causal uplift claim.

## Changes Informed By The Benchmark

- Feature-only historical replay filtering.
- Conventional Commit scope as an exact path-segment signal.
- Capped lexical seeds with workspace-package, test, config, and example diversity.
- NodeNext `.js` import resolution to TypeScript source files.
- Workspace package import resolution.
- Lower priority for legacy implementations unless requested.
- Configuration content matching only for explicit configuration/build intent.
- A hard 105% limit on the final rendered context pack.
- One- and two-level barrel/export propagation from task seeds.
- Bounded same-directory feature expansion.
- Category-aware prediction selection for tests, configs, examples, and barrels.
- Root-`tsconfig`-aware module resolution with bounded, task-focused TypeScript Program expansion.

## Rejected Experiments

The following experiments were implemented and tested, then removed because they reduced the fixed five-commit smoke benchmark:

- strong direct-test dependency promotion;
- bidirectional same-stem test promotion;
- frequency-normalized Git title terms;
- plain-text exported-symbol reference expansion;
- rare-term peak scoring;
- unconditional repository-wide TypeScript Program expansion: the fixed smoke set kept the same retrieval metrics while median analysis time initially increased from 3.45s to 13.98s; uniform semantic boosting also reduced Recall@10.

Keeping these negative results prevents repeating changes that look reasonable in isolation but reduce multi-file recall.

## Decision

The medium-repository result passes the MRR gate but does not pass the Recall@10 gate.

- MRR passes the threshold at 0.605.
- Token size and analysis latency pass their goals.
- Recall and test recall remain the limiting metrics.

The first bounded TypeScript Program path is enabled only for repositories with a root `tsconfig`. Benchmark V2 now makes keyword-agnostic localization the next retrieval priority: graph or reranking changes must improve the ablated track without regressing title mode. A future external issue/feature dataset is still required before measuring Coding Agent success. Adding a UI, more languages, or an embedded LLM is not justified by these results.

## Reproduce

```powershell
node dist/cli.js eval --commits 20 --budget 12000 --query-mode title --output benchmarks/results/<name>-title
node dist/cli.js eval --commits 20 --budget 12000 --query-mode keyword-ablated --output benchmarks/results/<name>-ablated
```

Run the command from the root of the repository being evaluated. Raw final reports are stored in:

- `benchmarks/results/p-map-final/`
- `benchmarks/results/typescript-sdk-final/`
- `benchmarks/results/typescript-sdk-v2-ablated-final/`
