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

## P0.5 Zero-skip Baseline And Failure-stage Audit

P0.5 resumed the same checkpoint with the declared 600-second analysis and 300-second Git limits. All five previously skipped instances completed: the three Babel analyses took 321,918 ms, 129,096 ms, and 152,348 ms, while the cached Three.js and Vue retries recovered from their earlier network failures. The fixed set now has a zero-skip 43/43 report:

| Attempted | Valid | Skipped | File R@5 | File R@10 | MRR | Median tokens | Median analysis |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 43 | 43 | 0 | 0.117 | 0.299 | 0.079 | 3,786 | 5,390 ms |

| Line budget | Recall | Precision | F1 | Useful hit | Median first hit |
|---:|---:|---:|---:|---:|---:|
| 100 | 0.000 | 0.000 | 0.000 | 0.000 | n/a |
| 250 | 0.062 | 0.004 | 0.008 | 0.116 | 147 |
| 500 | 0.070 | 0.003 | 0.006 | 0.140 | 153 |

`eval-issues` now writes a deterministic `audit.json` and `audit.md` next to the benchmark report. The audit classifies the observed failure stage without guessing at an unrecorded scoring cause:

| Failure stage | Tasks |
|---|---:|
| Gold file in top 10 and useful region at 500 lines | 6 |
| Gold file in top 10 but no useful region | 11 |
| Gold file ranked 11-20 | 4 |
| Gold file outside the recorded top 20 | 22 |

The complete baseline therefore contains 26 top-10 file-ranking misses (60.5%) and 11 downstream localization misses. The four rank-11-20 cases are bounded reranking candidates; the 22 outside-top-20 cases require deeper retrieval diagnostics. The audit identifies where the observable pipeline failed, not why a score was low. Raw results and both audit formats are stored in `benchmarks/results/swebench-multilingual-full-p05/`.

## P0.6 Gold-file Score Diagnostics

P0.6 retains post-retrieval candidate evidence for gold files: final prediction rank, score-only rank, total score, score components, and explanation reasons. Labels remain isolated from retrieval and are joined only after the candidate list has been produced. A reproducible preparation script selects exactly the 22 P0.5 tasks whose gold files were outside the recorded top 20; all 22 completed without skips and remained top-10 misses.

The first diagnostic run exposed non-finite lexical scores in two tasks whose query terms included `constructor`. Lexical term weights used a normal object, so prototype-property names could read inherited values instead of numeric counts. A null-prototype term-weight record and regression test repair the arithmetic boundary. After rerunning the two affected tasks, every recorded candidate score is finite; `babel__babel-15445` moves from rank 753 to 351 and `preactjs__preact-3345` from 149 to 53, but neither reaches the top 20.

| Observed evidence for the best gold candidate | Tasks |
|---|---:|
| Candidate absent from the discovered set | 0 |
| Non-finite score after the repair | 0 |
| Score-ranked top 20 but displaced by prediction policy | 0 |
| No direct lexical or symbol signal | 0 |
| Direct signal present but below the top-10 cutoff | 22 |

Lexical evidence is the dominant weighted component for 20 tasks and dependency evidence for two. Gold-file final ranks fall into these bands: eight at 21-50, six at 51-100, seven at 101-500, and one above 500. The median score gap to the tenth candidate is `0.196` (range `0.104`-`0.333`). Thirteen gold files reach the `0.9` lexical content ceiling, while 20 of 22 tasks have at least one top-10 candidate at that ceiling. This is evidence of weak lexical discrimination on this fixed miss set, not proof that one generic stop-word rule will improve retrieval. Raw results and diagnostics are stored in `benchmarks/results/swebench-multilingual-p06-ranking-diagnostics/`.

## P0.7 Term Discrimination

P0.7 tested full-query normalization and a distinct-term coverage penalty. Applying both changes together raised Axios File Recall@10 to `0.700` but reduced MRR to `0.117`; exponents `0.3` and `0.2`, a four-term activation threshold, and the denominator-only variant also missed the `0.205` MRR gate. The current-code control reproduced only `0.182` MRR versus the recorded P0.3 `0.205`, but every full-query-denominator variant reduced it further. The denominator-cap removal was therefore rejected and the final scorer keeps `denominator = Math.max(2, Math.min(queryTerms.length, 6))` while multiplying the normalized contribution sum by `coverageRatio^0.4`, where `coverageRatio` is the fraction of distinct query terms matched by the file.

The final coverage-only variant produced the following six-task Axios result:

| Implementation | File R@5 | File R@10 | MRR | Line recall @100 | @250 | @500 | Useful hit @500 | Median tokens | Median analysis |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| P0.7 coverage-only term discrimination | 0.567 | 0.650 | 0.338 | 0.185 | 0.373 | 0.411 | 0.667 | 3,301 | 3,153 ms |

Historical replay on this checkout found only nine valid feature commits rather than the recorded baseline's 20. Per the replay gate this count difference is noted rather than treated as a failure; both available query modes remained above their metric floors:

| Query mode | Valid commits | Recall@10 | MRR |
|---|---:|---:|---:|
| `title` | 9 | 0.604 | 0.622 |
| `keyword-ablated` | 9 | 0.604 | 0.622 |

On the fixed 22-task P0.6 ranking-miss subset, all tasks completed without skips. File Recall@10 increased from `0.000` to `0.114` and MRR from `0.000` to `0.081`; File Recall@5 reached `0.068`. This confirms that the coverage multiplier promotes some known gold files into the top 10. Raw P0.7 artifacts are stored under `.contextpack/evals/` and remain intentionally untracked.

The full 43-task SWE-bench Multilingual set was validated in P0.8 and produced a full-set uplift; see the P0.8 section.

## P0.8 Full-Set Validation

P0.8 ran the full 43-task SWE-bench Multilingual set on the committed P0.7 scorer (`coverageRatio^0.4`, denominator cap retained). **Verdict: uplift versus the P0.5 full-set baseline.** Every instance completed successfully, with 43 valid results and zero skips.

| Metric | P0.5 baseline | P0.8 result | Delta |
|---|---:|---:|---:|
| File Recall@5 | 0.117 | 0.242 | +0.125 |
| File Recall@10 | 0.299 | 0.389 | +0.090 |
| File MRR | 0.079 | 0.177 | +0.098 |
| Line recall @100 | 0.000 | 0.026 | +0.026 |
| Line recall @250 | 0.062 | 0.070 | +0.008 |
| Line recall @500 | 0.070 | 0.099 | +0.029 |
| Useful hit @500 | 0.140 | 0.186 | +0.046 |

All three primary must-not-regress floors passed: File Recall@10 `0.389 >= 0.279`, MRR `0.177 >= 0.059`, and line recall @500 `0.099 >= 0.050`. The P0.8 audit contains seven file-hit/region-hit tasks, 13 file-hit/region-miss tasks, nine gold files ranked 11-20, and 14 gold files outside the recorded top 20. Compared with P0.5, the coverage multiplier moved more gold files into retrieval range, while the downstream localization-miss group increased from 11 to 13 because the top-10 file-hit population also increased.

### Self-Replay

| Query mode | Valid commits | Recall@10 | MRR | P0.7 record | Floor | Gate |
|---|---:|---:|---:|---:|---:|---|
| `title` | 10 | 0.644 | 0.660 | 0.604 / 0.622 | 0.574 / 0.592 | pass |
| `keyword-ablated` (two-run average) | 10 | 0.644 | 0.577 | 0.604 / 0.622 | 0.574 / 0.592 | **MRR fail** |

The keyword-ablated mode was run twice because its first MRR was below the floor; both runs reproduced `0.644 / 0.577`, so the average is unchanged and the formal aggregate replay MRR gate fails by `0.015`. The valid-commit count increased from nine to ten because the committed P0.7 change itself became eligible. On the nine commits shared with the P0.7 record, keyword-ablated Recall@10 and MRR reproduce the prior values exactly (`0.604409 / 0.622354`). The new P0.7 commit alone has Recall@10 `1.000` and reciprocal rank `0.167` after keyword ablation removes `lexical`, which explains the aggregate MRR decrease without hiding the failed gate.

Raw P0.8 artifacts remain intentionally untracked under `.contextpack/evals/p08-*`.

## P0.9 Multi-Region Selection

P0.9 tested whether query-derived alternate regions can recover P0.8's file-hit/region-miss cases without changing file retrieval. The label-blind Phase 1 diagnostic found a gold-overlapping second or third cluster for 9 of the 13 misses, exceeding the predeclared threshold of `max(3, ceil(13 * 0.25)) = 4`. Proposal generation did not receive gold paths or line ranges; gold regions were used only to classify the completed proposals.

The implementation keeps primary file selection ahead of alternates: it selects up to ten primary snippets first, then adds at most two alternate snippets globally within the existing token and 16-snippet limits, before resuming remaining primaries. On the full 43-task set, every instance completed with zero skips and every per-instance file `predictions` array exactly matched P0.8.

| Metric | P0.8 | P0.9 | Delta |
|---|---:|---:|---:|
| File Recall@5 | 0.242 | 0.242 | 0.000 |
| File Recall@10 | 0.389 | 0.389 | 0.000 |
| File MRR | 0.177 | 0.177 | 0.000 |
| Line recall @100 | 0.026 | 0.026 | 0.000 |
| Line recall @250 | 0.070 | 0.070 | 0.000 |
| Line recall @500 | 0.099 | 0.103 | +0.004 |
| Useful hit @500 | 0.186 | 0.209 | +0.023 |
| File-hit/region-miss tasks | 13 | 11 | -2 |

The non-gating @500 region-quality measures also moved in the intended direction:

| Metric | P0.8 | P0.9 | Delta |
|---|---:|---:|---:|
| Line precision | 0.003776 | 0.004072 | +0.000296 |
| Noise region rate | 0.986919 | 0.985465 | -0.001453 |
| Context efficiency | 0.003776 | 0.004069 | +0.000293 |
| nDCG | 0.033199 | 0.035125 | +0.001926 |

The six-task Axios smoke passed its gates with File Recall@10 `0.650`, MRR `0.380`, line recall @500 `0.577`, and useful hit @500 `0.833`. Its file-hit/region-miss count fell to zero.

Historical replay retained ten valid commits in both modes. Title produced Recall@10 `0.644` and MRR `0.660`; keyword-ablated produced `0.644` and `0.577`. All ten common-commit prediction arrays exactly matched P0.8. The keyword-ablated aggregate therefore inherits P0.8's formal MRR floor failure (`0.577 < 0.592`); it is not a P0.9 regression.

**Verdict: retain P0.9.** It reduces the full-set localization-miss count and improves both line recall @500 and useful-hit @500 while leaving file retrieval unchanged. Raw diagnostics and evaluation artifacts remain intentionally untracked under `.contextpack/evals/p09-*`.

## P1.0 Language Adapter Foundation

P1.0 moved JavaScript/TypeScript discovery and compiler-backed analysis behind a deterministic internal language-adapter registry. Ranking, region selection, rendering, manifest version, and CLI behavior remain unchanged. The registry validates unique adapter ownership, merges source/config patterns deterministically, and dispatches the existing normalized `FileAnalysis` producer; it does not add a public plugin API or support additional languages.

The local gates passed: `npm run check` (24 test files, 115 tests, build, and package smoke) and `npm run perf:smoke` (final median total `1,310 ms`, below the `4,000 ms` limit).

The full 43-task run used the pinned dataset and repository cache from the main checkout, with `43/43` valid instances and zero skips. The stable projection comparison against P0.9 returned `Parity: equal`, including every per-instance `predictions` and `predictedRegions` array.

| Metric | P0.9 reference | P1.0 | Delta |
|---|---:|---:|---:|
| File Recall@5 | 0.242 | 0.242 | 0.000 |
| File Recall@10 | 0.389 | 0.389 | 0.000 |
| File MRR | 0.177 | 0.177 | 0.000 |
| Line recall @100 | 0.026 | 0.026 | 0.000 |
| Line recall @250 | 0.070 | 0.070 | 0.000 |
| Line recall @500 | 0.103 | 0.103 | 0.000 |
| Useful hit @500 | 0.209 | 0.209 | 0.000 |

The six-task Axios smoke also reproduced the P0.9 gates: File Recall@10 `0.650`, MRR `0.380`, line recall @500 `0.577`, and useful-hit @500 `0.833`, with `6/6` valid instances and zero skips.

Historical replay produced 11 valid commits in each mode on this branch. The expanded aggregates were title Recall@10 `0.6243867` / MRR `0.6228355`, and keyword-ablated Recall@10 `0.6243867` / MRR `0.5470779`. The P0.9 artifacts contain 10 common commits; on that common set, both modes had zero prediction-array mismatches and reproduced title `0.6439683 / 0.6601190` and keyword-ablated `0.6439683 / 0.5767857` (rounded `0.644 / 0.660` and `0.644 / 0.577`). The additional eligible commit was `88a601` (P0.9), whose per-commit result was Recall@10 `0.4285714` / MRR `0.25`; the larger aggregate is therefore a sample-set difference, not an adapter regression.

**Verdict: parity.** P1.0 changes the internal producer boundary only. The full-set outputs and metrics, including the six Axios instances, match P0.9; the ten common replay commits also match in every prediction array and both aggregate metrics. The expanded 11-commit replay aggregates differ only because the eligible sample set includes the additional P0.9 commit described above. Raw artifacts remain intentionally untracked under `.contextpack/evals/p10-*`.

## P1.1 Python Adapter Vertical Slice

P1.1 adds the first non-JavaScript language adapter while keeping the P1.0
JavaScript/TypeScript path unchanged. Python 3.8+ files are discovered and
batched through the standard-library `ast` worker; the normalized analysis
includes top-level functions, async functions, classes, methods, variables,
repository-internal imports, pytest-style test classification, and common
Python packaging/configuration files. Python `#` comments and strings
participate in lexical ranking, and evidence-based suggestions cover pytest,
unittest fallback, Ruff, mypy, and Python builds. If Python is unavailable or a
file cannot be parsed, the adapter emits a warning and retains lexical
fallback output so mixed repositories remain usable.

The deterministic local smoke generates 120 Python modules and 40 test files,
warms one analysis, then runs three measured iterations. It requires a Python
candidate, a resolved internal import edge, stable candidate paths/scores/
reasons, and a median total duration at or below 4,000 ms. The recorded Task 5
sample passed with median total duration **848 ms** (runs: 848, 879, and 725 ms)
and confirmed a resolved import edge. Runtime varies by host and concurrent
load; the enforced claim is the 4,000 ms ceiling. This is a synthetic
performance and integration smoke, not a Python benchmark against real issue data.

The fresh P1.1 JavaScript/TypeScript validation completed all **43/43** pinned
instances with zero skips and `Parity: equal` against P1.0. The full-set
aggregate remained R@10 `0.3891472868`, MRR `0.1771596393`, line@500
`0.1030487768`, and useful-hit@500 `0.2093023256`. The six-task Axios smoke
also remained R@10 `0.650`, MRR `0.380`, line@500 `0.577`, and useful-hit@500
`0.833`.

The P1.1 self-replay tracks had 16 valid commits: title R@10 `0.5899801587`
and MRR `0.5636160714`; keyword-ablated R@10 `0.5651785714` and MRR
`0.4979910714`. The 11 commits shared with P1.0 produced identical prediction
arrays in both modes; the aggregate changes reflect five newly eligible P1.1
commits. Raw artifacts remain untracked under `.contextpack/evals/p11-*`.

**Verdict: parity.** P1.1 adds Python analysis without changing any pinned
JavaScript/TypeScript retrieval output. A real Python issue benchmark remains
a future measurement, so the synthetic smoke does not establish Python
retrieval quality on external repositories.

## P1.2 Python Benchmark

**Verdict: invalid-run.** The frozen full SWE-bench Lite Python run completed
296 of 300 instances. Four SymPy instances timed out at the declared 600-second
analysis limit on both the initial attempt and the permitted skipped-instance
retry. The run therefore cannot validate Python real-issue retrieval. The
observed 296-instance aggregate also missed the useful-hit @500 floor; the
other three numeric floors passed, but they cannot support a product claim
because the zero-skip validity gate failed.

The source is the `test` split of `princeton-nlp/SWE-bench_Lite`, pinned at
revision `6ec7bb89b9342f664a54a6e0a6ea6501d3437cc2`. The pinned Parquet file is
MIT licensed and has SHA-256
`7a21f37b8bc179c7db5beeb14e88ac538ba283455c776e6b2535bbfb6e3551b4`.
Preparation keeps all 300 instances whose old-side patch contains at least one
existing Python file. The engineering set applies a deterministic cap of five
instances per repository, producing 57 instances across the same 12
repositories; the support-claim set contains all 300.

| Metric | Balanced engineering set | Full support-claim attempt |
|---|---:|---:|
| Requested / valid / skipped | 57 / 57 / 0 | 300 / 296 / 4 |
| File Recall@5 | 0.2982456140350877 | 0.20270270270270271 |
| File Recall@10 | 0.47368421052631576 | 0.3108108108108108 |
| File MRR | 0.18793068529910634 | 0.12599583761541977 |
| Line recall @100 | 0.01417004048582996 | 0.022093749067433277 |
| Line recall @250 | 0.058953050642801326 | 0.04989810621961652 |
| Line recall @500 | 0.10338114576749088 | 0.06671778756556317 |
| Useful hit @500 | 0.17543859649122806 | 0.09797297297297297 |
| Median estimated tokens | 3,996 | 3,997 |
| Median duration | 26,590 ms | 56,072 ms |

The full metrics above describe only the 296 valid instances. They are retained
for diagnosis and are not a 300-task aggregate.

| Frozen full-set gate | Requirement | Observed | Status |
|---|---:|---:|---|
| Run validity | 300 valid, 0 skipped | 296 valid, 4 skipped | **Fail** |
| File Recall@10 | >= 0.250 | 0.3108108108108108 | Numeric pass; not claimable |
| File MRR | >= 0.100 | 0.12599583761541977 | Numeric pass; not claimable |
| Line recall @500 | >= 0.050 | 0.06671778756556317 | Numeric pass; not claimable |
| Useful hit @500 | >= 0.100 | 0.09797297297297297 | **Fail** |

The frozen checker exited with code `2` and reported `Verdict: invalid-run`,
with failures for the valid-instance count, result count, and non-empty skipped
list. The persistent skips were `sympy__sympy-17630`,
`sympy__sympy-17655`, `sympy__sympy-18057`, and
`sympy__sympy-18087`; each reason was `Analysis timed out after 600000 ms.`

The largest-budget failure-stage audit covers the 296 valid results:

| Stage | Count |
|---|---:|
| File hit, region hit | 23 |
| File hit, region miss | 69 |
| File miss, rank 11-20 | 43 |
| File miss, outside top 20 | 161 |
| All file-ranking misses | 204 |
| All region-localization misses | 69 |

| Repository | File+region hit | File hit / region miss | Rank 11-20 miss | Outside top 20 |
|---|---:|---:|---:|---:|
| `astropy/astropy` | 1 | 1 | 0 | 4 |
| `django/django` | 10 | 21 | 13 | 70 |
| `matplotlib/matplotlib` | 0 | 3 | 2 | 18 |
| `mwaskom/seaborn` | 0 | 2 | 1 | 1 |
| `pallets/flask` | 0 | 2 | 1 | 0 |
| `psf/requests` | 4 | 2 | 0 | 0 |
| `pydata/xarray` | 0 | 3 | 0 | 2 |
| `pylint-dev/pylint` | 1 | 2 | 2 | 1 |
| `pytest-dev/pytest` | 2 | 5 | 2 | 8 |
| `scikit-learn/scikit-learn` | 0 | 5 | 5 | 13 |
| `sphinx-doc/sphinx` | 0 | 2 | 3 | 11 |
| `sympy/sympy` | 5 | 21 | 14 | 33 |

Both runs used Node `v24.13.0`, Python `3.9.11`, and Windows 10 Pro
`10.0.19041` x64. The full run used a 12,000-token budget, a 100-commit history
window, line budgets 100/250/500, a 600-second per-instance analysis timeout,
and a 300-second Git timeout. It was resumed only from its atomic checkpoint;
after the first 296-valid/4-skipped pass, only the four recorded skips were
retried.

```powershell
$root = 'C:\Users\Administrator\Documents\contextpack'
npm run benchmark:prepare:swebench-python
node dist/cli.js eval-issues `
  --dataset "$root\.benchmarks\datasets\swe-bench-lite-python-full-300.jsonl" `
  --cache "$root\.benchmarks\repositories" `
  --history 100 --budget 12000 --line-budgets 100,250,500 `
  --instance-timeout 600 --git-timeout 300 `
  --output "$root\.contextpack\evals\p12-python-full-300"
node dist/cli.js eval-issues `
  --dataset "$root\.benchmarks\datasets\swe-bench-lite-python-full-300.jsonl" `
  --cache "$root\.benchmarks\repositories" `
  --history 100 --budget 12000 --line-budgets 100,250,500 `
  --instance-timeout 600 --git-timeout 300 `
  --output "$root\.contextpack\evals\p12-python-full-300" `
  --resume --retry-skipped
npm run benchmark:validate:python -- `
  "$root\.contextpack\evals\p12-python-full-300\results.json"
```

Raw artifacts remain ignored under
`.contextpack/evals/p12-python-balanced-57/` and
`.contextpack/evals/p12-python-full-300/`; prepared datasets and manifests
remain ignored under `.benchmarks/datasets/`. Gold regions are old-side diff
hunks rather than human context labels, insertion-only hunks use a one-line
base anchor, new or unsupported patch files are excluded, and the evaluation
measures retrieval rather than patch correctness or agent task success. The
audit localizes the failure stage but does not prove the scoring cause.

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
- Bounded multi-region selection after ten primary snippets, with at most two alternates globally.
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

The external track still measures retrieval rather than Coding Agent success. P0.8 proves that P0.7 term discrimination improves the full 43-task baseline, and P0.9 reduces file-hit/region-miss cases from 13 to 11 while preserving every file prediction array. The expanded ten-commit keyword-ablated replay aggregate still misses its historical MRR floor, but P0.9 reproduces all P0.8 replay predictions exactly. P1.2 does not validate Python real-issue retrieval: four persistent skips make the full run invalid, and the observed 296-instance useful-hit rate also misses its floor. P1.3 remains pending a valid Python benchmark report. The remaining 11 JS/TS localization misses and the inherited replay-floor caveat remain future retrieval hypotheses. Adding a UI, more languages, or an embedded LLM is not justified by these results alone.

## Reproduce

```powershell
node dist/cli.js eval --commits 20 --budget 12000 --query-mode title --output benchmarks/results/<name>-title
node dist/cli.js eval --commits 20 --budget 12000 --query-mode keyword-ablated --output benchmarks/results/<name>-ablated
npm run benchmark:prepare:swebench
npm run benchmark:prepare:diagnostics
node dist/cli.js eval-issues --repo axios/axios --history 50 --budget 12000 --line-budgets 100,250,500 --output benchmarks/results/swebench-multilingual-axios-p03
node dist/cli.js eval-issues --history 100 --budget 12000 --line-budgets 100,250,500 --instance-timeout 600 --git-timeout 300 --output .contextpack/evals/swebench-multilingual-full-43
node dist/cli.js eval-issues --history 100 --budget 12000 --line-budgets 100,250,500 --instance-timeout 600 --git-timeout 300 --output .contextpack/evals/swebench-multilingual-full-43 --resume
node dist/cli.js eval-issues --dataset .benchmarks/datasets/swe-bench-multilingual-p06-ranking-misses.jsonl --history 100 --budget 12000 --line-budgets 100,250,500 --instance-timeout 600 --git-timeout 300 --output .contextpack/evals/p06-ranking-diagnostics
```

Run the command from the root of the repository being evaluated. Raw final reports are stored in:

- `benchmarks/results/p-map-final/`
- `benchmarks/results/typescript-sdk-final/`
- `benchmarks/results/typescript-sdk-v2-ablated-final/`
- `benchmarks/results/typescript-sdk-v02-title-final/`
- `benchmarks/results/typescript-sdk-v02-ablated-final/`
- `benchmarks/results/swebench-multilingual-axios-p02/`
- `benchmarks/results/swebench-multilingual-axios-p03/`
- `benchmarks/results/swebench-multilingual-full-p04/`
- `benchmarks/results/swebench-multilingual-full-p05/`
- `benchmarks/results/swebench-multilingual-p06-ranking-diagnostics/`
