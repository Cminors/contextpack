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

## V0.2 Structured Content Retrieval

V0.2 adds a bounded BM25-style source scan over comments, identifiers, string literals, and test titles. It keeps field and line evidence, applies length normalization and capped term frequency, suppresses secret-like strings and module specifiers, and folds the result into the existing lexical signal. Content receives less weight when a Conventional Commit scope already provides a precise path prior.

The same fixed 20 MCP SDK commits, query construction, and 12,000-token budget produced:

| Implementation | Query mode | Recall@5 | Recall@10 | MRR | Noise@10 | Test recall | Median tokens | Median analysis |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| V0.1 structural baseline | `title` | 0.292 | 0.414 | 0.605 | 0.825 | 0.472 | 9,002 | 2,029 ms |
| V0.2 structured content | `title` | 0.347 | 0.439 | 0.635 | 0.820 | 0.472 | 7,889 | 3,945 ms |
| V0.1 structural baseline | `keyword-ablated` | 0.156 | 0.233 | 0.260 | 0.895 | 0.139 | 9,095 | 1,533 ms |
| V0.2 structured content | `keyword-ablated` | 0.291 | 0.341 | 0.402 | 0.870 | 0.389 | 7,547 | 3,177 ms |

The content scorer clears the predeclared ablated gates and also improves the title track. Output compaction limits selected snippets to 16, caps a snippet at 120 lines, and renders two relationships per selected file; prediction ranking remains a separate top-20 list.

Latency was not stable across repeated full runs on the same machine. A preceding full run of the same retrieval scorer (before output-only compaction) measured 1,956 ms for title and 1,880 ms for keyword ablation, while the final artifact run measured 3,945 ms and 3,177 ms. The latest title result exceeds the 3,044 ms provisional gate, so latency should be remeasured in a controlled CI environment before calling the performance gate stable.

## V0.3 Performance Observability

`analyzeTask` now records repository discovery, file analysis, Git history, initial ranking, semantic enrichment, reranking, selection, and total duration separately. Historical replay also records Markdown rendering independently and reports per-phase medians.

The deterministic `npm run perf:smoke` fixture contains 360 TS/JS/test files, warms the process once, runs five measured analyses, verifies identical candidate fingerprints, and fails when median analysis exceeds 4,000 ms. The 2026-07-13 local baseline was:

| Discover | Files | Initial rank | Semantic | Rerank | Selection | Total |
|---:|---:|---:|---:|---:|---:|---:|
| 392 ms | 518 ms | 487 ms | 33 ms | 466 ms | 1 ms | 1,936 ms |

A one-commit MCP SDK diagnostic measured 7,559 ms analysis and 27 ms rendering: discovery 1,137 ms, files 3,371 ms, Git 755 ms, and initial ranking 2,235 ms dominated. This confirms that rendering was not the source of the earlier variance. The synthetic gate is a deterministic quantity-regression alarm, not a replacement for full historical replay or a latency SLA.

## P0.2 Real Issue And Line-level Evaluation

P0.2 adds a second, external evaluation track based on the 43 JavaScript/TypeScript tasks from [SWE-bench Multilingual](https://www.swebench.com/multilingual.html). The adapter pins Hugging Face dataset revision `2b7aced941b4873e9cad3e76abbae93f481d1beb` (MIT) and verifies the official seven-repository/43-instance distribution. The downloaded Parquet file is cached outside Git with SHA-256 `28b7f874e48496399077d276f9f2b163a077ddf0a70dc507c148d58da826baa9`.

The normalized JSONL retains the real issue text, repository, `base_commit`, source revision, and derived gold regions, but not the raw solution patch. Gold regions come from old-side unified-diff hunks so they refer to lines that exist in the pre-solution checkout. New files and non-JS/TS patch files are explicitly excluded; insertion-only hunks use a one-line base-side anchor. [SWE-bench's dataset schema](https://www.swebench.com/SWE-bench/guides/datasets/) is the upstream contract.

Predictions and labels remain separated: ContextPack receives only the issue text and repository checkout. The evaluator reads gold regions after retrieval and reports:

- file Recall@5, Recall@10, and MRR over the ranked candidate list;
- line precision, recall, and F1 under fixed 100/250/500 emitted-line budgets;
- gold-region hit rate and predicted-region noise rate;
- context efficiency, nDCG, useful-hit rate, and first useful line rank.

The first checked-in smoke baseline covers all six Axios tasks:

| Tasks | File R@5 | File R@10 | MRR | Line recall @100 | @250 | @500 | Median analysis |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 6 | 0.500 | 0.617 | 0.177 | 0.000 | 0.000 | 0.000 | 5,152 ms |

All six tasks completed without skips. File ranking found at least some gold files, but no emitted snippet overlapped a gold hunk. For example, `axios__axios-4738` ranked the correct file fifth while selecting lines 9-13; the patch hunk is at lines 420-428. This is direct evidence that the current one-symbol-per-file snippet policy loses useful within-file location even when file retrieval succeeds. The next model change should target line localization and must improve this fixed track without regressing the historical title and keyword-ablated tracks.

This six-task run is the pre-localization pipeline baseline, not a claim about the full 43-task benchmark. Raw results are stored in `benchmarks/results/swebench-multilingual-axios-p02/`.

## P0.3 Query-aware Region Localization

P0.3 keeps file ranking and region localization as separate decisions. The content index now retains bounded repeated occurrences for matched terms, while explanation evidence remains capped at four entries. Within each ranked file, the localizer anchors on the strongest retrieval term, scores nearby multi-term clusters for density and field quality, then emits a deterministic region of at most 32 lines. HTML issue-template comments, Markdown links, and bare URLs are removed before task-term extraction so boilerplate does not become a seed.

The same six Axios tasks, dataset revision, repository commits, Git history window, token budget, and line budgets produced:

| Implementation | File R@5 | File R@10 | MRR | Line recall @100 | @250 | @500 | Useful hit @500 | Median tokens | Median analysis |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| P0.2 symbol-first regions | 0.500 | 0.617 | 0.177 | 0.000 | 0.000 | 0.000 | 0.000 | 1,716.5 | 5,152 ms |
| P0.3 query-aware regions | 0.533 | 0.617 | 0.205 | 0.167 | 0.355 | 0.411 | 0.667 | 3,503 | 4,190.5 ms |

All six tasks still complete without skips. File Recall@10 is unchanged, MRR improves, and every declared line budget now has a non-zero useful hit. On `axios__axios-4738`, the selected `lib/adapters/http.js` region moves from lines 9-13 to lines 397-428, covering the gold hunk at 420-428; its first useful line is emitted at rank 83 under the 100-line budget.

This is evidence that the localization mechanism works on the fixed smoke track, not that within-file retrieval is solved generally. Two of the six tasks still have no useful region at 500 lines, and region noise remains high. A first full 43-task attempt exceeded a 30-minute local execution limit while processing the Babel repository and produced no aggregate artifact; full-set runtime and cancellation therefore remain a separate evaluation-infrastructure task. Raw six-task results are stored in `benchmarks/results/swebench-multilingual-axios-p03/`.

## P0.4 Resumable Full-set Runner

P0.4 makes the external evaluator durable before another 43-task attempt. With `--instance-timeout`, each analysis runs in an isolated Worker that can be terminated without ending the outer run. Repository fetches use the independent `--git-timeout` limit plus Git's low-speed cutoff. After every completed or skipped instance, the evaluator atomically replaces `checkpoint.json`. `--resume` reuses completed entries, while `--resume --retry-skipped` keeps successful results and retries only failures.

A checkpoint is rejected when its dataset fingerprint, selected instance IDs, token budget, line budgets, or Git history window differ from the requested run. This prevents accidental aggregation across incompatible experiments. A built-CLI Axios smoke run completed normally and a second invocation resumed the finished checkpoint without checking out or analyzing the repository again.

The P0.4 fixed-set run attempted all 43 instances. The first aggregate contained 33 valid results and 10 skips. `--resume --retry-skipped` retained those 33 successes and recovered five more transient failures, producing the checked-in 38-valid baseline:

| Attempted | Valid | Skipped | File R@5 | File R@10 | MRR | Median tokens | Median analysis |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 43 | 38 | 5 | 0.132 | 0.325 | 0.086 | 3,769 | 4,943.5 ms |

| Line budget | Recall | Precision | F1 | Useful hit | Median first hit |
|---:|---:|---:|---:|---:|---:|
| 100 | 0.000 | 0.000 | 0.000 | 0.000 | n/a |
| 250 | 0.070 | 0.005 | 0.009 | 0.132 | 147 |
| 500 | 0.079 | 0.004 | 0.007 | 0.158 | 153 |

Three Babel analyses remained above the shortened 30-second retry limit, one Three.js fetch reached the 180-second Git timeout, and one Vue fetch failed with a TLS disconnect. Aggregates use the 38 valid instances, not all 43 attempted instances. The lower full-set region recall and high noise show that the Axios localization gain does not generalize reliably yet. Raw results are stored in `benchmarks/results/swebench-multilingual-full-p04/`.

A task-level failure split makes the next retrieval bottleneck explicit. At least one gold file appears in the top ten predictions for 16 of 38 valid tasks. Six of those tasks also have a useful region within the 500-line budget, while ten retrieve a gold file but miss every gold region. The remaining 22 tasks have no gold-file hit in the top ten. Multi-region selection can address the ten localization failures, but it cannot repair the larger upstream file-ranking group by itself.

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
- Structured source-content retrieval with BM25-style rarity, saturation, and length normalization.
- Explainable content evidence containing only normalized task terms, source fields, and line numbers.
- A compact output policy of at most 16 snippets, 120 lines per snippet, and two rendered relationships per file.

## Rejected Experiments

The following experiments were implemented and tested, then removed because they reduced the fixed five-commit smoke benchmark:

- strong direct-test dependency promotion;
- bidirectional same-stem test promotion;
- frequency-normalized Git title terms;
- plain-text exported-symbol reference expansion;
- rare-term peak scoring;
- unconditional repository-wide TypeScript Program expansion: the fixed smoke set kept the same retrieval metrics while median analysis time initially increased from 3.45s to 13.98s; uniform semantic boosting also reduced Recall@10.
- task-seeded Personalized PageRank over imports, TypeScript references, and Git co-change edges: on the fixed five-commit smoke set, keyword-ablated Recall@10 / MRR improved from `0.153 / 0.166` to `0.193 / 0.212`, but title mode regressed from `0.467 / 0.587` to `0.433 / 0.556`; reducing graph weight from `0.08` to `0.04` did not recover the title track, so the graph signal was removed.

Keeping these negative results prevents repeating changes that look reasonable in isolation but reduce multi-file recall.

## Decision

The V0.2 content scorer and P0.3 query-aware region localizer are retained as the default retrieval path.

- Keyword-ablated Recall@10, MRR, and test recall exceed their predeclared gates by `0.058`, `0.122`, and `0.200` respectively.
- Title Recall@10 and MRR improve rather than regress; Noise@10 falls on both tracks.
- Final median token use is lower than V0.1 on both tracks.
- The P0.3 Axios track produces non-zero line recall at 100/250/500 lines without reducing file Recall@10.

The external track still measures retrieval rather than Coding Agent success. The next evidence milestone is to resolve the five skipped instances and establish a stable all-43 report. Retrieval work should then audit the 22 file-ranking misses before testing multi-region selection on the ten file-hit/region-miss tasks, followed by CLI packaging validation; adding a UI, more languages, or an embedded LLM is not justified by these results alone.

## Reproduce

```powershell
node dist/cli.js eval --commits 20 --budget 12000 --query-mode title --output benchmarks/results/<name>-title
node dist/cli.js eval --commits 20 --budget 12000 --query-mode keyword-ablated --output benchmarks/results/<name>-ablated
npm run benchmark:prepare:swebench
node dist/cli.js eval-issues --repo axios/axios --history 50 --budget 12000 --line-budgets 100,250,500 --output benchmarks/results/swebench-multilingual-axios-p03
node dist/cli.js eval-issues --history 100 --budget 12000 --line-budgets 100,250,500 --instance-timeout 600 --git-timeout 300 --output .contextpack/evals/swebench-multilingual-full-43
node dist/cli.js eval-issues --history 100 --budget 12000 --line-budgets 100,250,500 --instance-timeout 600 --git-timeout 300 --output .contextpack/evals/swebench-multilingual-full-43 --resume
```

Run the command from the root of the repository being evaluated. Raw final reports are stored in:

- `benchmarks/results/p-map-final/`
- `benchmarks/results/typescript-sdk-final/`
- `benchmarks/results/typescript-sdk-v2-ablated-final/`
- `benchmarks/results/typescript-sdk-v02-title-final/`
- `benchmarks/results/typescript-sdk-v02-ablated-final/`
- `benchmarks/results/swebench-multilingual-axios-p02/`
- `benchmarks/results/swebench-multilingual-axios-p03/`
