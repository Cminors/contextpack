# ContextPack Issue Ranking Diagnostics

This report records observed ranking evidence for issue tasks whose gold files remain outside the final top 20. It does not claim a causal root cause.

## Summary

- Eligible outside-top-20 misses: 22
- Diagnosed misses: 22
- Missing diagnostic evidence: 0
- Candidate not found: 0
- Non-finite score: 0
- Prediction-policy displacement: 0
- No direct lexical or symbol signal: 0
- Direct signal below cutoff: 22

## Instances

| Instance | Repository | Observed evidence | Best gold file | Final rank | Score rank | Score | Gap to 10th | Dominant signal |
|---|---|---|---|---:|---:|---:|---:|---|
| `axios__axios-6539` | `axios/axios` | direct signal below cutoff | `lib/helpers/isAbsoluteURL.js` | 90 | 90 | 0.276 | 0.306 | lexical |
| `babel__babel-13928` | `babel/babel` | direct signal below cutoff | `packages/babel-parser/src/parser/expression.js` | 175 | 175 | 0.180 | 0.198 | dependency |
| `babel__babel-14532` | `babel/babel` | direct signal below cutoff | `packages/babel-generator/src/node/parentheses.ts` | 1891 | 1891 | 0.098 | 0.333 | lexical |
| `babel__babel-15445` | `babel/babel` | direct signal below cutoff | `packages/babel-generator/src/source-map.ts` | 351 | 351 | 0.255 | 0.179 | lexical |
| `babel__babel-15649` | `babel/babel` | direct signal below cutoff | `packages/babel-traverse/src/scope/lib/renamer.ts` | 48 | 48 | 0.284 | 0.128 | lexical |
| `babel__babel-16130` | `babel/babel` | direct signal below cutoff | `packages/babel-helpers/src/index.ts` | 482 | 482 | 0.242 | 0.194 | lexical |
| `facebook__docusaurus-10130` | `facebook/docusaurus` | direct signal below cutoff | `packages/docusaurus/src/server/brokenLinks.ts` | 37 | 37 | 0.381 | 0.201 | lexical |
| `facebook__docusaurus-10309` | `facebook/docusaurus` | direct signal below cutoff | `packages/docusaurus-plugin-content-docs/src/client/docsClientUtils.ts` | 272 | 272 | 0.254 | 0.267 | lexical |
| `facebook__docusaurus-8927` | `facebook/docusaurus` | direct signal below cutoff | `packages/docusaurus-utils/src/markdownLinks.ts` | 90 | 90 | 0.316 | 0.227 | lexical |
| `facebook__docusaurus-9897` | `facebook/docusaurus` | direct signal below cutoff | `packages/docusaurus-utils/src/markdownUtils.ts` | 100 | 100 | 0.309 | 0.206 | lexical |
| `mrdoob__three.js-25687` | `mrdoob/three.js` | direct signal below cutoff | `src/loaders/ObjectLoader.js` | 42 | 42 | 0.258 | 0.174 | lexical |
| `mrdoob__three.js-26589` | `mrdoob/three.js` | direct signal below cutoff | `src/objects/Mesh.js` | 236 | 236 | 0.149 | 0.283 | lexical |
| `mrdoob__three.js-27395` | `mrdoob/three.js` | direct signal below cutoff | `src/math/Sphere.js` | 27 | 27 | 0.225 | 0.117 | dependency |
| `preactjs__preact-2896` | `preactjs/preact` | direct signal below cutoff | `src/diff/children.js` | 49 | 49 | 0.322 | 0.193 | lexical |
| `preactjs__preact-3062` | `preactjs/preact` | direct signal below cutoff | `src/diff/props.js` | 37 | 37 | 0.330 | 0.110 | lexical |
| `preactjs__preact-3345` | `preactjs/preact` | direct signal below cutoff | `hooks/src/index.js` | 53 | 53 | 0.320 | 0.208 | lexical |
| `preactjs__preact-3454` | `preactjs/preact` | direct signal below cutoff | `src/diff/props.js` | 111 | 111 | 0.254 | 0.248 | lexical |
| `preactjs__preact-3739` | `preactjs/preact` | direct signal below cutoff | `hooks/src/index.js` | 36 | 36 | 0.329 | 0.104 | lexical |
| `preactjs__preact-4182` | `preactjs/preact` | direct signal below cutoff | `src/diff/index.js` | 126 | 126 | 0.272 | 0.246 | lexical |
| `vuejs__core-11739` | `vuejs/core` | direct signal below cutoff | `packages/compiler-sfc/src/style/cssVars.ts` | 48 | 48 | 0.383 | 0.131 | lexical |
| `vuejs__core-11870` | `vuejs/core` | direct signal below cutoff | `packages/runtime-core/src/helpers/renderList.ts` | 71 | 71 | 0.339 | 0.153 | lexical |
| `vuejs__core-11899` | `vuejs/core` | direct signal below cutoff | `packages/compiler-sfc/src/style/pluginScoped.ts` | 58 | 58 | 0.382 | 0.147 | lexical |

## Missing Evidence

None.

## Limitations

- These categories describe observed candidate and score conditions; they are not causal ground truth.
- No direct query signal means both lexical and symbol components are zero after task normalization.
- A non-finite score is an arithmetic integrity failure and must be fixed before interpreting relative rank.
- Prediction-policy displacement means a gold file is score-ranked in the top 20 but moved below the final top 20 by category-aware prioritization.
- Candidate not found means the gold path was absent from the supported discovered candidate set; it does not identify which discovery rule excluded it.
