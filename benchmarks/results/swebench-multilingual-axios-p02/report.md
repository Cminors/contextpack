# ContextPack Issue Retrieval Benchmark

This report evaluates retrieval against real issue/patch pairs. It does not execute patches or tests.

## Dataset

- Source: `SWE-bench/SWE-bench_Multilingual`
- Revision: `2b7aced941b4873e9cad3e76abbae93f481d1beb`
- Valid instances: 6/6
- Token budget: 12000
- Line budgets: 100, 250, 500

## File Retrieval

- Recall@5: 0.500
- Recall@10: 0.617
- MRR: 0.177
- Median tokens: 1716.5
- Median duration: 5151.5 ms

## Line-budget Retrieval

| Lines | Recall | Precision | F1 | Region hit | Region noise | Efficiency | nDCG | Useful hit | First hit |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 0.000 | 0.000 | 0.000 | 0.000 | 1.000 | 0.000 | 0.000 | 0.000 | n/a |
| 250 | 0.000 | 0.000 | 0.000 | 0.000 | 1.000 | 0.000 | 0.000 | 0.000 | n/a |
| 500 | 0.000 | 0.000 | 0.000 | 0.000 | 1.000 | 0.000 | 0.000 | 0.000 | n/a |

## Instances

| Instance | Repository | Gold files | R@5 | R@10 | MRR | Recall@max lines | Tokens | Duration ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| `axios__axios-4731` | `axios/axios` | 1 | 1.00 | 1.00 | 0.33 | 0.00 | 1601 | 4471 |
| `axios__axios-4738` | `axios/axios` | 1 | 1.00 | 1.00 | 0.20 | 0.00 | 1540 | 5530 |
| `axios__axios-5085` | `axios/axios` | 2 | 0.00 | 0.50 | 0.11 | 0.00 | 3174 | 4136 |
| `axios__axios-5316` | `axios/axios` | 5 | 0.00 | 0.20 | 0.17 | 0.00 | 1832 | 7416 |
| `axios__axios-5892` | `axios/axios` | 1 | 1.00 | 1.00 | 0.25 | 0.00 | 3661 | 4773 |
| `axios__axios-6539` | `axios/axios` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 947 | 9199 |

## Skipped

None.

## Limitations

- Gold regions are old-side unified-diff hunks, not human-authored context annotations.
- Insertion-only hunks are represented by a one-line anchor in the base checkout.
- Only existing JavaScript and TypeScript patch files are scored; new and unsupported files are excluded.
- Retrieval quality does not measure whether an agent can produce a correct patch or pass tests.
