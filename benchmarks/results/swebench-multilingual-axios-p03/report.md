# ContextPack Issue Retrieval Benchmark

This report evaluates retrieval against real issue/patch pairs. It does not execute patches or tests.

## Dataset

- Source: `SWE-bench/SWE-bench_Multilingual`
- Revision: `2b7aced941b4873e9cad3e76abbae93f481d1beb`
- Valid instances: 6/6
- Token budget: 12000
- Line budgets: 100, 250, 500

## File Retrieval

- Recall@5: 0.533
- Recall@10: 0.617
- MRR: 0.205
- Median tokens: 3503
- Median duration: 4190.5 ms

## Line-budget Retrieval

| Lines | Recall | Precision | F1 | Region hit | Region noise | Efficiency | nDCG | Useful hit | First hit |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 0.167 | 0.015 | 0.028 | 0.167 | 0.958 | 0.015 | 0.055 | 0.167 | 83 |
| 250 | 0.355 | 0.019 | 0.032 | 0.361 | 0.942 | 0.019 | 0.115 | 0.500 | 113 |
| 500 | 0.411 | 0.016 | 0.029 | 0.431 | 0.948 | 0.016 | 0.141 | 0.667 | 124.5 |

## Instances

| Instance | Repository | Gold files | R@5 | R@10 | MRR | Recall@max lines | Tokens | Duration ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| `axios__axios-4731` | `axios/axios` | 1 | 1.00 | 1.00 | 0.33 | 0.00 | 3327 | 4510 |
| `axios__axios-4738` | `axios/axios` | 1 | 1.00 | 1.00 | 0.33 | 1.00 | 3472 | 3162 |
| `axios__axios-5085` | `axios/axios` | 2 | 0.00 | 0.50 | 0.11 | 0.23 | 3536 | 3156 |
| `axios__axios-5316` | `axios/axios` | 5 | 0.20 | 0.20 | 0.20 | 0.24 | 3534 | 4768 |
| `axios__axios-5892` | `axios/axios` | 1 | 1.00 | 1.00 | 0.25 | 1.00 | 3359 | 3871 |
| `axios__axios-6539` | `axios/axios` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 3597 | 8013 |

## Skipped

None.

## Limitations

- Gold regions are old-side unified-diff hunks, not human-authored context annotations.
- Insertion-only hunks are represented by a one-line anchor in the base checkout.
- Only existing JavaScript and TypeScript patch files are scored; new and unsupported files are excluded.
- Retrieval quality does not measure whether an agent can produce a correct patch or pass tests.
