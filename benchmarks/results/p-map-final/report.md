# ContextPack Historical Replay

This report measures a retrieval proxy, not Coding Agent success.

## Summary

- Valid commits: 12/20
- Recall@5: 1.000
- Recall@10: 1.000
- MRR: 0.757
- Noise@10: 0.501
- Median tokens: 1497.5
- Median duration: 666 ms

## Commits

| Commit | Task title | R@5 | R@10 | MRR | Tokens |
|---|---|---:|---:|---:|---:|
| `dc597e50` | Add missing `index` parameter to mapper function in `pMapIterable` (#71) | 1.00 | 1.00 | 1.00 | 2008 |
| `5c59528d` | Add `pMapIterable` export (#63) | 1.00 | 1.00 | 1.00 | 2105 |
| `b58fc269` | Add `pMapSkip` as an acceptable return value in `Mapper` type (#60) | 1.00 | 1.00 | 0.33 | 1091 |
| `4875dee6` | Support `AbortController` (#58) | 1.00 | 1.00 | 1.00 | 2218 |
| `735d80e9` | Add another test | 1.00 | 1.00 | 0.50 | 2218 |
| `94eb5320` | Add support for multiple `pMapSkip`'s (#52) | 1.00 | 1.00 | 0.50 | 769 |
| `1f52aa45` | Add test cases for multiple mapper errors with stop on error (#49) | 1.00 | 1.00 | 1.00 | 1790 |
| `a24e9094` | Add support for AsyncIterable as input (#46) | 1.00 | 1.00 | 0.50 | 1583 |
| `a6666d1a` | Add code comment to tests | 1.00 | 1.00 | 0.25 | 1399 |
| `c9c08828` | Add `pMapSkip` (#39) | 1.00 | 1.00 | 1.00 | 1232 |
| `9f0b32fe` | Add `stopOnError` option (#16) | 1.00 | 1.00 | 1.00 | 1412 |
| `7a49c590` | Add TypeScript definitions (#13) | 1.00 | 1.00 | 1.00 | 804 |

## Skipped

- `3ada5f36` 7.0.5 — outside the feature-addition task scope
- `1af51b57` Fix `pMapIterable` mapper index for out-of-order promise inputs (#88) — outside the feature-addition task scope
- `65aaa8f4` Add rate limiting recipe — outside the 1-15 source-file feature scope
- `100a217d` Improve readme wording — outside the feature-addition task scope
- `47bc82e5` 7.0.4 — outside the feature-addition task scope
- `91ef8d19` Minor tweak — outside the feature-addition task scope
- `82b8cdc2` Fix concurrency control in `pMapIterable` (#77) — outside the feature-addition task scope
- `2ba3a002` 7.0.3 — outside the feature-addition task scope
- `65e893e3` Fix cleaning up abort listener (#81) — outside the feature-addition task scope
- `a38d5a71` 7.0.2 — outside the feature-addition task scope
- `34006c92` 7.0.1 — outside the feature-addition task scope
- `10768330` Fix `pMapIterable` not accepting async values in an iterator (#69) — outside the feature-addition task scope
- `8e08686e` Fix readme typo (#68) — outside the feature-addition task scope
- `0039552a` 7.0.0 — outside the feature-addition task scope
- `b6156396` Meta tweaks — outside the feature-addition task scope
- `136b08a3` Require Node.js 18 (#67) — outside the feature-addition task scope
- `66b039b2` 6.0.0 — outside the feature-addition task scope
- `ebb7c706` Meta tweaks — outside the feature-addition task scope
- `df887875` Drop `aggregate-error` dependency and require Node.js 16 (#65) — outside the feature-addition task scope
- `a5faf425` 5.5.0 — outside the feature-addition task scope
- `5ef93c23` 5.4.0 — outside the feature-addition task scope
- `3b62341e` 5.3.0 — outside the feature-addition task scope
- `e7ca665f` 5.2.0 — outside the feature-addition task scope
- `5ee5d937` Minor simplification — outside the feature-addition task scope
- `11bc75d3` Prevent some potential unhandled exceptions (#48) — outside the feature-addition task scope
- `874f1a0d` Fix docs typo — outside the feature-addition task scope
- `c470a485` 5.1.0 — outside the feature-addition task scope
- `4b5f9e7b` Do not run mapping after stop-on-error happened (#40) — outside the feature-addition task scope
- `9e11914d` Minor example improvement (#37) — outside the feature-addition task scope
- `4146ef4a` 5.0.0 — outside the feature-addition task scope
- `dcdbc7ac` Require Node.js 12 and move to ESM — outside the feature-addition task scope
- `54b51f90` Meta tweaks — outside the feature-addition task scope
- `0b5f9a3d` Move to GitHub Actions (#32) — outside the feature-addition task scope
- `76de3060` Document difference with `Promise.all()` — outside the feature-addition task scope
- `a4b4dec4` 4.0.0 — outside the feature-addition task scope
- `b342717a` Ensure `concurrency` is an integer — outside the feature-addition task scope
- `bf037695` Require Node.js 10 — outside the feature-addition task scope
- `f8ccb4e7` Tidelift tasks — outside the feature-addition task scope
- `ed1b661a` Fix test race condition (#21) — outside the feature-addition task scope
- `a8c06732` 3.0.0 — outside the feature-addition task scope
- `a200b629` Require Node.js 8 — outside the feature-addition task scope
- `e8707766` Tidelift tasks — outside the feature-addition task scope
- `19b83912` Create funding.yml — outside the feature-addition task scope
- `bcbc0f5f` Add Node.js 12 to testing (#19) — outside the 1-15 source-file feature scope
- `a44286e8` 2.1.0 — outside the feature-addition task scope
- `9834e9dc` Refactor TypeScript definition to CommonJS compatible export (#18) — outside the feature-addition task scope
- `091ce0ab` Update dev dependencies (#17) — mechanical, release, or dependency commit
- `3774d302` 2.0.0 — outside the feature-addition task scope
- `fcfcf919` Require Node.js 6 — outside the feature-addition task scope
- `386b340c` Make the readme example use async/await (#11) — outside the feature-addition task scope
- `e0a1c91c` 1.2.0 — outside the feature-addition task scope
- `50a3188c` Meta tweaks — outside the feature-addition task scope
- `15347cba` Stricter argument checking — outside the feature-addition task scope
- `c61810d7` 1.1.1 — outside the feature-addition task scope
- `6cda92d8` Removed index parameter, each call to next now increase index by one (#5) — outside the feature-addition task scope
- `ce04bc09` 1.1.0 — outside the feature-addition task scope
- `7e7c6b6d` Iterate over source iterable (#2) — outside the feature-addition task scope
- `cf8328bd` minor readme tweaks — outside the feature-addition task scope
- `fef15cfe` 1.0.0 — outside the feature-addition task scope
- `051cf269` init — commit has no replayable parent

## Limitations

- Changed files are an imperfect proxy for the ideal context set.
- Commit titles can underspecify the original feature task.
- Retrieval recall does not measure whether a Coding Agent completes the task successfully.
