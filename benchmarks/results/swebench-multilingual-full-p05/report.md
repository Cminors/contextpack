# ContextPack Issue Retrieval Benchmark

This report evaluates retrieval against real issue/patch pairs. It does not execute patches or tests.

## Dataset

- Source: `SWE-bench/SWE-bench_Multilingual`
- Revision: `2b7aced941b4873e9cad3e76abbae93f481d1beb`
- Valid instances: 43/43
- Token budget: 12000
- Line budgets: 100, 250, 500

## File Retrieval

- Recall@5: 0.117
- Recall@10: 0.299
- MRR: 0.079
- Median tokens: 3786
- Median duration: 5390 ms

## Line-budget Retrieval

| Lines | Recall | Precision | F1 | Region hit | Region noise | Efficiency | nDCG | Useful hit | First hit |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 0.000 | 0.000 | 0.000 | 0.000 | 1.000 | 0.000 | 0.000 | 0.000 | n/a |
| 250 | 0.062 | 0.004 | 0.008 | 0.063 | 0.987 | 0.004 | 0.021 | 0.116 | 147 |
| 500 | 0.070 | 0.003 | 0.006 | 0.072 | 0.990 | 0.003 | 0.025 | 0.140 | 153 |

## Instances

| Instance | Repository | Gold files | R@5 | R@10 | MRR | Recall@max lines | Tokens | Duration ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| `axios__axios-4731` | `axios/axios` | 1 | 1.00 | 1.00 | 0.33 | 0.00 | 3327 | 3730 |
| `axios__axios-4738` | `axios/axios` | 1 | 1.00 | 1.00 | 0.20 | 1.00 | 3472 | 3689 |
| `axios__axios-5085` | `axios/axios` | 2 | 0.00 | 0.50 | 0.11 | 0.23 | 3536 | 3814 |
| `axios__axios-5316` | `axios/axios` | 5 | 0.20 | 0.20 | 0.20 | 0.24 | 3534 | 5455 |
| `axios__axios-5892` | `axios/axios` | 1 | 1.00 | 1.00 | 0.25 | 1.00 | 3359 | 4065 |
| `axios__axios-6539` | `axios/axios` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 3597 | 7554 |
| `babel__babel-13928` | `babel/babel` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 3655 | 91412 |
| `babel__babel-14532` | `babel/babel` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 4203 | 111319 |
| `babel__babel-15445` | `babel/babel` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 2788 | 321918 |
| `babel__babel-15649` | `babel/babel` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 4296 | 129096 |
| `babel__babel-16130` | `babel/babel` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 4428 | 152348 |
| `facebook__docusaurus-10130` | `facebook/docusaurus` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 4097 | 19270 |
| `facebook__docusaurus-10309` | `facebook/docusaurus` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 4376 | 14385 |
| `facebook__docusaurus-8927` | `facebook/docusaurus` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 4199 | 18135 |
| `facebook__docusaurus-9183` | `facebook/docusaurus` | 3 | 0.33 | 0.33 | 0.25 | 0.00 | 4143 | 18330 |
| `facebook__docusaurus-9897` | `facebook/docusaurus` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 3889 | 20289 |
| `immutable-js__immutable-js-2005` | `immutable-js/immutable-js` | 1 | 0.00 | 1.00 | 0.14 | 0.00 | 3239 | 3174 |
| `immutable-js__immutable-js-2006` | `immutable-js/immutable-js` | 1 | 0.00 | 0.00 | 0.05 | 0.00 | 3601 | 3597 |
| `mrdoob__three.js-25687` | `mrdoob/three.js` | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 8799 | 18555 |
| `mrdoob__three.js-26589` | `mrdoob/three.js` | 3 | 0.00 | 0.00 | 0.00 | 0.00 | 4045 | 19608 |
| `mrdoob__three.js-27395` | `mrdoob/three.js` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 3769 | 14189 |
| `preactjs__preact-2757` | `preactjs/preact` | 1 | 0.00 | 1.00 | 0.11 | 0.00 | 4088 | 4141 |
| `preactjs__preact-2896` | `preactjs/preact` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 4113 | 4087 |
| `preactjs__preact-2927` | `preactjs/preact` | 1 | 0.00 | 0.00 | 0.08 | 0.00 | 3752 | 3814 |
| `preactjs__preact-3010` | `preactjs/preact` | 2 | 0.50 | 1.00 | 0.25 | 0.00 | 3573 | 3513 |
| `preactjs__preact-3062` | `preactjs/preact` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 3935 | 4566 |
| `preactjs__preact-3345` | `preactjs/preact` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 3090 | 5321 |
| `preactjs__preact-3454` | `preactjs/preact` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 4384 | 4425 |
| `preactjs__preact-3562` | `preactjs/preact` | 1 | 0.00 | 1.00 | 0.10 | 0.00 | 3786 | 3988 |
| `preactjs__preact-3567` | `preactjs/preact` | 2 | 0.00 | 0.50 | 0.13 | 0.00 | 3647 | 4088 |
| `preactjs__preact-3689` | `preactjs/preact` | 3 | 0.00 | 0.33 | 0.17 | 0.43 | 3338 | 3168 |
| `preactjs__preact-3739` | `preactjs/preact` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 3829 | 7325 |
| `preactjs__preact-3763` | `preactjs/preact` | 1 | 0.00 | 1.00 | 0.14 | 0.11 | 3672 | 3713 |
| `preactjs__preact-4152` | `preactjs/preact` | 1 | 0.00 | 1.00 | 0.10 | 0.00 | 3717 | 4228 |
| `preactjs__preact-4182` | `preactjs/preact` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 3399 | 4538 |
| `preactjs__preact-4245` | `preactjs/preact` | 1 | 0.00 | 0.00 | 0.08 | 0.00 | 4101 | 5329 |
| `preactjs__preact-4316` | `preactjs/preact` | 1 | 1.00 | 1.00 | 0.33 | 0.00 | 4030 | 5390 |
| `preactjs__preact-4436` | `preactjs/preact` | 2 | 0.00 | 0.50 | 0.17 | 0.00 | 4186 | 4297 |
| `vuejs__core-11589` | `vuejs/core` | 2 | 0.00 | 0.50 | 0.11 | 0.00 | 3931 | 17565 |
| `vuejs__core-11739` | `vuejs/core` | 4 | 0.00 | 0.00 | 0.00 | 0.00 | 4028 | 17995 |
| `vuejs__core-11870` | `vuejs/core` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 3476 | 13303 |
| `vuejs__core-11899` | `vuejs/core` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 4241 | 18221 |
| `vuejs__core-11915` | `vuejs/core` | 1 | 0.00 | 0.00 | 0.08 | 0.00 | 3014 | 10664 |

## Skipped

None.

## Limitations

- Gold regions are old-side unified-diff hunks, not human-authored context annotations.
- Insertion-only hunks are represented by a one-line anchor in the base checkout.
- Only existing JavaScript and TypeScript patch files are scored; new and unsupported files are excluded.
- Retrieval quality does not measure whether an agent can produce a correct patch or pass tests.
