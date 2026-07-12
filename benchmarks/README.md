# ContextPack Retrieval Benchmark

This benchmark evaluates ContextPack as a retrieval proxy. It does not measure whether a coding agent completes a task successfully.

## Method

For each repository, `contextpack eval` scans local non-merge history and keeps commits that match the MVP scope:

- the title describes a feature addition (`feat:`, `feature:`, `add`, `implement`, `introduce`, or `support`);
- 1-15 JavaScript or TypeScript files changed;
- release, dependency, formatting, and lockfile commits are excluded;
- newly added files that do not exist in the parent revision are excluded from the reference set;
- the commit title is used as the task and the parent revision is analyzed in a detached temporary worktree.

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
| `modelcontextprotocol/typescript-sdk` | 635 | 20 | 0.280 | 0.403 | 0.559 | 0.835 | 0.458 | 9,555 | 1,946 ms |

`p-map` only contained 12 commits that satisfied the feature-addition filter, so it does not meet the desired 20-valid-commit sample size. The MCP TypeScript SDK supplies the meaningful medium-repository result.

## Baseline Comparison

The first MCP SDK run used the original mixed-commit evaluator and V0.1 ranking:

| Run | Recall@10 | MRR | Noise@10 | Median tokens | Median analysis |
|---|---:|---:|---:|---:|---:|
| V0.1 baseline, mixed commits | 0.210 | 0.267 | 0.925 | 13,854 | 3,351 ms |
| Current feature-only evaluator | 0.403 | 0.559 | 0.835 | 9,555 | 1,946 ms |

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

## Decision

The medium-repository result does not pass the release gate of `Recall@10 >= 0.70` and `MRR >= 0.60`.

- MRR is close to the threshold at 0.559.
- Token size and analysis latency pass their goals.
- Recall and test recall remain the limiting metrics.

The next retrieval work should focus on cross-file expansion from high-confidence symbols: exported barrel files, direct tests, and same-feature files identified through symbol references. Adding a UI, more languages, or an embedded LLM is not justified by these results.

## Reproduce

```powershell
node dist/cli.js eval --commits 20 --budget 12000 --output benchmarks/results/<name>
```

Run the command from the root of the repository being evaluated. Raw final reports are stored in:

- `benchmarks/results/p-map-final/`
- `benchmarks/results/typescript-sdk-final/`
