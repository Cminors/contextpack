# ContextPack Issue Retrieval Benchmark

This report evaluates retrieval against real issue/patch pairs. It does not execute patches or tests.

## Dataset

- Source: `SWE-bench/SWE-bench_Multilingual`
- Revision: `2b7aced941b4873e9cad3e76abbae93f481d1beb`
- Valid instances: 22/22
- Token budget: 12000
- Line budgets: 100, 250, 500

## File Retrieval

- Recall@5: 0.000
- Recall@10: 0.000
- MRR: 0.000
- Median tokens: 4071
- Median duration: 16062.5 ms

## Line-budget Retrieval

| Lines | Recall | Precision | F1 | Region hit | Region noise | Efficiency | nDCG | Useful hit | First hit |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 0.000 | 0.000 | 0.000 | 0.000 | 1.000 | 0.000 | 0.000 | 0.000 | n/a |
| 250 | 0.000 | 0.000 | 0.000 | 0.000 | 1.000 | 0.000 | 0.000 | 0.000 | n/a |
| 500 | 0.000 | 0.000 | 0.000 | 0.000 | 1.000 | 0.000 | 0.000 | 0.000 | n/a |

## Instances

| Instance | Repository | Gold files | R@5 | R@10 | MRR | Recall@max lines | Tokens | Duration ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| `axios__axios-6539` | `axios/axios` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 3597 | 8372 |
| `babel__babel-13928` | `babel/babel` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 3655 | 95529 |
| `babel__babel-14532` | `babel/babel` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 4203 | 116242 |
| `babel__babel-15445` | `babel/babel` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 3387 | 311004 |
| `babel__babel-15649` | `babel/babel` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 4296 | 131244 |
| `babel__babel-16130` | `babel/babel` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 4428 | 188123 |
| `facebook__docusaurus-10130` | `facebook/docusaurus` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 4097 | 19198 |
| `facebook__docusaurus-10309` | `facebook/docusaurus` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 4376 | 14494 |
| `facebook__docusaurus-8927` | `facebook/docusaurus` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 4243 | 19114 |
| `facebook__docusaurus-9897` | `facebook/docusaurus` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 3889 | 20157 |
| `mrdoob__three.js-25687` | `mrdoob/three.js` | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 8799 | 19744 |
| `mrdoob__three.js-26589` | `mrdoob/three.js` | 3 | 0.00 | 0.00 | 0.00 | 0.00 | 4045 | 20606 |
| `mrdoob__three.js-27395` | `mrdoob/three.js` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 3769 | 13288 |
| `preactjs__preact-2896` | `preactjs/preact` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 4353 | 4691 |
| `preactjs__preact-3062` | `preactjs/preact` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 3935 | 4303 |
| `preactjs__preact-3345` | `preactjs/preact` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 4128 | 4945 |
| `preactjs__preact-3454` | `preactjs/preact` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 4378 | 4597 |
| `preactjs__preact-3739` | `preactjs/preact` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 3829 | 7331 |
| `preactjs__preact-4182` | `preactjs/preact` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 3399 | 4907 |
| `vuejs__core-11739` | `vuejs/core` | 4 | 0.00 | 0.00 | 0.00 | 0.00 | 4028 | 16215 |
| `vuejs__core-11870` | `vuejs/core` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 3476 | 13745 |
| `vuejs__core-11899` | `vuejs/core` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 4241 | 15910 |

## Skipped

None.

## Limitations

- Gold regions are old-side unified-diff hunks, not human-authored context annotations.
- Insertion-only hunks are represented by a one-line anchor in the base checkout.
- Only existing JavaScript and TypeScript patch files are scored; new and unsupported files are excluded.
- Retrieval quality does not measure whether an agent can produce a correct patch or pass tests.
