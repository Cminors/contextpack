# ContextPack Issue Failure Audit

This report locates retrieval failures by pipeline stage. It does not infer an unobserved scoring cause.

## Summary

- Valid instances: 43
- Maximum line budget: 500
- File hit and useful region: 6
- File hit but region miss: 11
- Gold file ranked 11-20: 4
- Gold file outside the recorded top 20: 22
- Top-10 file-ranking misses: 26 (60.5%)

## By Repository

| Repository | File + region hit | Region miss | Rank 11-20 | Outside top 20 |
|---|---:|---:|---:|---:|
| `axios/axios` | 4 | 1 | 0 | 1 |
| `babel/babel` | 0 | 0 | 0 | 5 |
| `facebook/docusaurus` | 0 | 1 | 0 | 4 |
| `immutable-js/immutable-js` | 0 | 1 | 1 | 0 |
| `mrdoob/three.js` | 0 | 0 | 0 | 3 |
| `preactjs/preact` | 2 | 7 | 2 | 6 |
| `vuejs/core` | 0 | 1 | 1 | 3 |

## Top-10 File-ranking Misses

| Instance | Repository | Stage | Gold file (recorded rank) | First three predictions |
|---|---|---|---|---|
| `axios__axios-6539` | `axios/axios` | gold file outside top 20 | `lib/helpers/isAbsoluteURL.js` (>20) | `index.js`<br>`index.d.ts`<br>`lib/axios.js` |
| `babel__babel-13928` | `babel/babel` | gold file outside top 20 | `packages/babel-parser/src/parser/expression.js` (>20) | `scripts/parser-tests/typescript/error-codes.js`<br>`packages/babel-plugin-transform-react-jsx-self/src/index.js`<br>`packages/babel-plugin-syntax-typescript/src/index.js` |
| `babel__babel-14532` | `babel/babel` | gold file outside top 20 | `packages/babel-generator/src/node/parentheses.ts` (>20) | `packages/babel-plugin-external-helpers/src/index.ts`<br>`packages/babel-core/src/index.ts`<br>`packages/babel-parser/typings/babel-parser.d.ts` |
| `babel__babel-15445` | `babel/babel` | gold file outside top 20 | `packages/babel-generator/src/source-map.ts` (>20) | `babel-worker.cjs`<br>`babel.config.js`<br>`benchmark/babel-core/real-case-preset-env-flow/babel-parser-expression.mjs` |
| `babel__babel-15649` | `babel/babel` | gold file outside top 20 | `packages/babel-traverse/src/scope/lib/renamer.ts` (>20) | `packages/babel-core/src/index.ts`<br>`packages/babel-plugin-transform-class-static-block/src/index.ts`<br>`packages/babel-helper-replace-supers/src/index.ts` |
| `babel__babel-16130` | `babel/babel` | gold file outside top 20 | `packages/babel-helpers/src/index.ts` (>20) | `packages/babel-core/cjs-proxy.cjs`<br>`packages/babel-parser/src/util/scope.ts`<br>`packages/babel-helpers/test/fixtures/behavior/get-with-falsy-receiver/exec.js` |
| `facebook__docusaurus-10130` | `facebook/docusaurus` | gold file outside top 20 | `packages/docusaurus/src/server/brokenLinks.ts` (>20) | `packages/docusaurus-logger/src/__tests__/index.test.ts`<br>`packages/docusaurus-logger/src/index.ts`<br>`packages/docusaurus-cssnano-preset/src/remove-overridden-custom-properties/index.ts` |
| `facebook__docusaurus-10309` | `facebook/docusaurus` | gold file outside top 20 | `packages/docusaurus-plugin-content-docs/src/client/docsClientUtils.ts` (>20) | `packages/create-docusaurus/bin/index.js`<br>`packages/docusaurus-logger/src/__tests__/index.test.ts`<br>`packages/create-docusaurus/src/index.ts` |
| `facebook__docusaurus-8927` | `facebook/docusaurus` | gold file outside top 20 | `packages/docusaurus-utils/src/markdownLinks.ts` (>20) | `packages/docusaurus-mdx-loader/src/remark/transformImage/__tests__/index.test.ts`<br>`packages/docusaurus-mdx-loader/src/remark/transformImage/index.ts`<br>`packages/create-docusaurus/bin/index.js` |
| `facebook__docusaurus-9897` | `facebook/docusaurus` | gold file outside top 20 | `packages/docusaurus-utils/src/markdownUtils.ts` (>20) | `packages/docusaurus-plugin-content-blog/src/plugin-content-blog.d.ts`<br>`packages/docusaurus-plugin-content-docs/src/plugin-content-docs.d.ts`<br>`packages/create-docusaurus/bin/index.js` |
| `immutable-js__immutable-js-2006` | `immutable-js/immutable-js` | gold file ranked 11-20 | `src/Operations.js` (19) | `__tests__/List.ts`<br>`__tests__/Range.ts`<br>`__tests__/updateIn.ts` |
| `mrdoob__three.js-25687` | `mrdoob/three.js` | gold file outside top 20 | `src/core/Object3D.js` (>20)<br>`src/loaders/ObjectLoader.js` (>20) | `docs/page.js`<br>`docs/prettify/prettify.js`<br>`examples/jsm/cameras/CinematicCamera.js` |
| `mrdoob__three.js-26589` | `mrdoob/three.js` | gold file outside top 20 | `src/objects/Line.js` (>20)<br>`src/objects/Mesh.js` (>20)<br>`src/objects/Points.js` (>20) | `examples/jsm/animation/CCDIKSolver.js`<br>`examples/jsm/animation/MMDPhysics.js`<br>`examples/jsm/animation/MMDAnimationHelper.js` |
| `mrdoob__three.js-27395` | `mrdoob/three.js` | gold file outside top 20 | `src/math/Sphere.js` (>20) | `src/animation/PropertyBinding.js`<br>`test/e2e/puppeteer.js`<br>`examples/jsm/webxr/XRControllerModelFactory.js` |
| `preactjs__preact-2896` | `preactjs/preact` | gold file outside top 20 | `src/diff/children.js` (>20) | `debug/src/debug.js`<br>`compat/src/index.js`<br>`compat/test/ts/memo.tsx` |
| `preactjs__preact-2927` | `preactjs/preact` | gold file ranked 11-20 | `src/diff/props.js` (12) | `compat/test/browser/render.test.js`<br>`compat/src/render.js`<br>`src/internal.d.ts` |
| `preactjs__preact-3062` | `preactjs/preact` | gold file outside top 20 | `src/diff/props.js` (>20) | `hooks/src/index.js`<br>`debug/src/debug.js`<br>`compat/src/index.js` |
| `preactjs__preact-3345` | `preactjs/preact` | gold file outside top 20 | `hooks/src/index.js` (>20) | `babel.config.js`<br>`benches/package.json`<br>`benches/proxy-packages/preact-local-proxy/index.js` |
| `preactjs__preact-3454` | `preactjs/preact` | gold file outside top 20 | `src/diff/props.js` (>20) | `compat/src/index.js`<br>`debug/src/debug.js`<br>`hooks/src/index.js` |
| `preactjs__preact-3739` | `preactjs/preact` | gold file outside top 20 | `hooks/src/index.js` (>20) | `debug/src/debug.js`<br>`benches/scripts/bench.js`<br>`debug/test/browser/serializeVNode.test.js` |
| `preactjs__preact-4182` | `preactjs/preact` | gold file outside top 20 | `src/diff/index.js` (>20) | `demo/list.jsx`<br>`demo/logger.jsx`<br>`demo/people/index.tsx` |
| `preactjs__preact-4245` | `preactjs/preact` | gold file ranked 11-20 | `hooks/src/index.js` (12) | `benches/scripts/analyze.js`<br>`benches/scripts/index.js`<br>`debug/src/debug.js` |
| `vuejs__core-11739` | `vuejs/core` | gold file outside top 20 | `packages/compiler-sfc/src/script/utils.ts` (>20)<br>`packages/compiler-sfc/src/style/cssVars.ts` (>20)<br>`packages/runtime-core/src/hydration.ts` (>20)<br>`packages/shared/src/escapeHtml.ts` (>20) | `packages/compiler-core/__tests__/parse.spec.ts`<br>`packages/compiler-core/__tests__/scopeId.spec.ts`<br>`packages-private/dts-test/component.test-d.ts` |
| `vuejs__core-11870` | `vuejs/core` | gold file outside top 20 | `packages/runtime-core/src/helpers/renderList.ts` (>20) | `packages/runtime-dom/src/index.ts`<br>`packages/reactivity/__tests__/computed.spec.ts`<br>`packages/reactivity/__tests__/reactive.spec.ts` |
| `vuejs__core-11899` | `vuejs/core` | gold file outside top 20 | `packages/compiler-sfc/src/style/pluginScoped.ts` (>20) | `packages/compiler-dom/src/transforms/stringifyStatic.ts`<br>`packages/compiler-core/__tests__/parse.spec.ts`<br>`packages/compiler-sfc/src/compileScript.ts` |
| `vuejs__core-11915` | `vuejs/core` | gold file ranked 11-20 | `packages/compiler-core/src/tokenizer.ts` (13) | `packages/runtime-core/src/apiSetupHelpers.ts`<br>`packages/reactivity/src/reactive.ts`<br>`packages/compiler-core/src/options.ts` |

## File Hit / Region Misses

| Instance | Repository | Gold file (recorded rank) |
|---|---|---|
| `axios__axios-4731` | `axios/axios` | `lib/adapters/http.js` (3) |
| `facebook__docusaurus-9183` | `facebook/docusaurus` | `packages/docusaurus-theme-classic/src/options.ts` (4)<br>`packages/docusaurus-theme-classic/src/theme/CodeBlock/Content/String.tsx` (>20)<br>`website/docusaurus.config.js` (>20) |
| `immutable-js__immutable-js-2005` | `immutable-js/immutable-js` | `src/CollectionImpl.js` (7) |
| `preactjs__preact-2757` | `preactjs/preact` | `src/diff/index.js` (9) |
| `preactjs__preact-3010` | `preactjs/preact` | `src/diff/children.js` (9)<br>`src/index.d.ts` (4) |
| `preactjs__preact-3562` | `preactjs/preact` | `compat/src/render.js` (10) |
| `preactjs__preact-3567` | `preactjs/preact` | `hooks/src/index.js` (8)<br>`hooks/src/internal.d.ts` (12) |
| `preactjs__preact-4152` | `preactjs/preact` | `src/diff/children.js` (10) |
| `preactjs__preact-4316` | `preactjs/preact` | `src/diff/props.js` (3) |
| `preactjs__preact-4436` | `preactjs/preact` | `src/diff/index.js` (6)<br>`src/internal.d.ts` (18) |
| `vuejs__core-11589` | `vuejs/core` | `packages/reactivity/src/effect.ts` (9)<br>`packages/runtime-core/src/apiWatch.ts` (>20) |

## Limitations

- The audit identifies the pipeline stage where retrieval failed; it does not prove the underlying scoring cause.
- Gold-file ranks are limited to the 20 prediction paths stored by the issue benchmark.
- A useful region means overlap with an old-side patch hunk at the largest configured line budget.
