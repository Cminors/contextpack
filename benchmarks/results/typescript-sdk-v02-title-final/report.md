# ContextPack Historical Replay

This report measures a retrieval proxy, not Coding Agent success.

## Summary

- Query mode: `title`
- Valid commits: 20/20
- Recall@5: 0.347
- Recall@10: 0.439
- MRR: 0.635
- Noise@10: 0.820
- Test recall: 0.472
- Median tokens: 7889
- Median duration: 3945 ms

## Commits

| Commit | Evaluation query | Hints removed | R@5 | R@10 | MRR | Tokens |
|---|---|---:|---:|---:|---:|---:|
| `24be4040` | feat(server): accept Standard Schemas in inputRequired.elicit (#2369) | 0 | 0.50 | 0.67 | 1.00 | 7638 |
| `61866d7a` | feat(server): runtime-neutral OAuth discovery serving for web-standard hosts (#2422) | 0 | 0.50 | 0.50 | 1.00 | 8443 |
| `7635115d` | feat(server): runtime-neutral requireBearerAuth for web-standard hosts (#2420) | 0 | 0.33 | 0.50 | 0.33 | 8425 |
| `f172626a` | feat(packaging): ship CommonJS builds alongside ESM for v2 packages (#2405) | 0 | 0.00 | 0.10 | 0.10 | 7751 |
| `6cc7b1cb` | feat(node): export toWebRequest(), the IncomingMessage→Request conversion inside toNodeHandler (#2390) | 0 | 0.40 | 0.40 | 0.50 | 6352 |
| `c59dc3aa` | feat(server): expose icons on registerTool/registerPrompt (McpServer) (#2353) | 0 | 0.33 | 0.33 | 1.00 | 8118 |
| `78fbe273` | feat(core): reserved trace context _meta keys and propagation docs (SEP-414) (#2270) | 0 | 0.50 | 0.50 | 1.00 | 6986 |
| `49c0a711` | feat: deprecate roots, sampling, and logging runtime APIs (SEP-2577) (#2268) | 0 | 0.33 | 0.33 | 0.33 | 10438 |
| `4a5c863a` | Add consumer-sourced e2e requirements and the legacy SSE matrix column (#2203) | 0 | 0.00 | 0.11 | 0.17 | 8315 |
| `96db044f` | feat(core): add isSpecType / specTypeSchemas Records for runtime validation of spec types (#1887) | 0 | 0.33 | 0.67 | 0.20 | 5165 |
| `db83829c` | feat(core): custom-method support (3-arg setRequestHandler + request schema overload) (#1974) | 0 | 0.25 | 0.38 | 0.50 | 7185 |
| `e15a8ef3` | feat(compat): registerTool/registerPrompt accept raw Zod shape, auto-wrap with z.object() (#1901) | 0 | 0.33 | 0.33 | 1.00 | 7030 |
| `7cccc2ac` | feat(express): restore Resource-Server auth glue (requireBearerAuth, mcpAuthMetadataRouter) (#1907) | 0 | 0.50 | 0.50 | 0.50 | 4944 |
| `42cb6b2b` | feat(compat): export InMemoryTransport from public API surface (#1834) | 0 | 0.50 | 0.50 | 1.00 | 9702 |
| `9ed62fe7` | feat(client): support custom claims in PrivateKeyJwtProvider (#1875) | 0 | 0.50 | 1.00 | 0.50 | 6923 |
| `f73a5af4` | Add _meta support to registerPrompt (#1629) | 0 | 0.50 | 0.50 | 1.00 | 8027 |
| `045c62a1` | feat!: remove WebSocketClientTransport (#1783) | 0 | 0.33 | 0.67 | 1.00 | 8848 |
| `6711ed9a` | feat(client): add reconnectionScheduler to StreamableHTTPClientTransport (#1763) | 0 | 0.67 | 0.67 | 1.00 | 8405 |
| `e563e63b` | feat: introduce minimal AuthProvider interface with OAuthClientProvider adapter (#1710) | 0 | 0.00 | 0.00 | 0.06 | 8377 |
| `0784be1a` | feat: support Standard Schema for tool/prompt schemas (#1689) | 0 | 0.13 | 0.13 | 0.50 | 6830 |

## Query Audit

- `24be4040` original: feat(server): accept Standard Schemas in inputRequired.elicit (#2369); removed: none
- `61866d7a` original: feat(server): runtime-neutral OAuth discovery serving for web-standard hosts (#2422); removed: none
- `7635115d` original: feat(server): runtime-neutral requireBearerAuth for web-standard hosts (#2420); removed: none
- `f172626a` original: feat(packaging): ship CommonJS builds alongside ESM for v2 packages (#2405); removed: none
- `6cc7b1cb` original: feat(node): export toWebRequest(), the IncomingMessage→Request conversion inside toNodeHandler (#2390); removed: none
- `c59dc3aa` original: feat(server): expose icons on registerTool/registerPrompt (McpServer) (#2353); removed: none
- `78fbe273` original: feat(core): reserved trace context _meta keys and propagation docs (SEP-414) (#2270); removed: none
- `49c0a711` original: feat: deprecate roots, sampling, and logging runtime APIs (SEP-2577) (#2268); removed: none
- `4a5c863a` original: Add consumer-sourced e2e requirements and the legacy SSE matrix column (#2203); removed: none
- `96db044f` original: feat(core): add isSpecType / specTypeSchemas Records for runtime validation of spec types (#1887); removed: none
- `db83829c` original: feat(core): custom-method support (3-arg setRequestHandler + request schema overload) (#1974); removed: none
- `e15a8ef3` original: feat(compat): registerTool/registerPrompt accept raw Zod shape, auto-wrap with z.object() (#1901); removed: none
- `7cccc2ac` original: feat(express): restore Resource-Server auth glue (requireBearerAuth, mcpAuthMetadataRouter) (#1907); removed: none
- `42cb6b2b` original: feat(compat): export InMemoryTransport from public API surface (#1834); removed: none
- `9ed62fe7` original: feat(client): support custom claims in PrivateKeyJwtProvider (#1875); removed: none
- `f73a5af4` original: Add _meta support to registerPrompt (#1629); removed: none
- `045c62a1` original: feat!: remove WebSocketClientTransport (#1783); removed: none
- `6711ed9a` original: feat(client): add reconnectionScheduler to StreamableHTTPClientTransport (#1763); removed: none
- `e563e63b` original: feat: introduce minimal AuthProvider interface with OAuthClientProvider adapter (#1710); removed: none
- `0784be1a` original: feat: support Standard Schema for tool/prompt schemas (#1689); removed: none

## Skipped

- `95d28cba` Version Packages (beta) (#2471) — mechanical, release, or dependency commit
- `9b41b568` fix(client): initialize requests never carry a session id; capture only from the initialize response (#2469) — outside the feature-addition task scope
- `44797d77` fix(core): restore the v1 content default for tools/call results on the legacy era (#2456) — outside the feature-addition task scope
- `38349210` fix: convert elicitation Standard Schemas via an explicit wire-grammar walk (#2454) — outside the feature-addition task scope
- `cc70c5e6` fix(client): preserve pre-set transport handlers across the version-negotiation probe window (#2455) — mechanical, release, or dependency commit
- `0ab5d147` fix(server): trim OWS from standard MCP headers (#2453) — outside the feature-addition task scope
- `7e697354` fix(server): return Invalid Params for malformed resource URIs (#2451) — outside the feature-addition task scope
- `e2aeac20` chore(deps): bump denoland/setup-deno from 2.0.4 to 2.0.5 (#2443) — mechanical, release, or dependency commit
- `78fabea4` Use protected HTTP wiring in examples and guides (#2445) — outside the feature-addition task scope
- `561c6d83` fix(server): validate Content-Type by parsed media type instead of substring match (#2441) — outside the feature-addition task scope
- `7015d212` examples: web-standard twin of the bearer-auth story (#2424) — outside the feature-addition task scope
- `e8de519d` fix: keep validator providers off root declarations (#2425) — outside the feature-addition task scope
- `d2f1bed8` Fix import ordering in client auth (#2442) — outside the feature-addition task scope
- `ce2f65db` fix(core): make instanceof on SDK error classes work across bundled copies (#2384) — outside the feature-addition task scope
- `e6cc5dc6` chore(deps): bump actions/checkout from 6 to 7 (#2338) — mechanical, release, or dependency commit
- `1b90c96d` fix(packaging): expose Ajv from CJS validator subpaths (#2431) — outside the feature-addition task scope
- `ddba550f` docs: point readers (and their LLMs) at the markdown renditions (#2427) — outside the feature-addition task scope
- `43c13c5f` docs: fix sidebar overflow at mid-width viewports and add a favicon (#2426) — outside the feature-addition task scope
- `79dc162e` Read codemod target versions from workspace manifests at build time (#2419) — outside the feature-addition task scope
- `ddf6cc1d` docs(servers): document resources/subscribe serving; exercise subscriptions in the resources example (#2413) — outside the feature-addition task scope
- `35f6856a` Version Packages (beta) (#2416) — mechanical, release, or dependency commit
- `3c7ddafa` test(conformance): bump referee to 0.2.0-alpha.9; arm SEP-2575 diagnostic fixtures; fix post-dispatch -32021 HTTP status (#2399) — mechanical, release, or dependency commit
- `1ea960b5` chore(examples): bump better-auth to ^1.6.2 (#2415) — mechanical, release, or dependency commit
- `eacf2e5d` Add --protocol-version flag to cli-client example (#2406) — mechanical, release, or dependency commit
- `448ba0ff` chore: drop duplicate CommonJS changeset (#2414) — outside the feature-addition task scope
- `ef120b2b` chore: add missing changesets for CommonJS builds and codemod iterations (#2412) — outside the feature-addition task scope
- `d000de82` Update README.md (#2411) — outside the feature-addition task scope
- `1772473b` codemod iterations 5 (#2398) — outside the feature-addition task scope
- `ebca273a` docs: generate llms.txt, llms-full.txt, and markdown page renditions (#2407) — outside the feature-addition task scope
- `2f4ad132` chore(deps): bump changesets/action from 1.7.0 to 1.9.0 (#2260) — mechanical, release, or dependency commit
- `2dcf10be` Version Packages (beta) (#2404) — mechanical, release, or dependency commit
- `5ad6cd11` chore: prune consumed alpha changesets to unblock the release workflow (#2403) — mechanical, release, or dependency commit
- `a4002596` chore: enter beta prerelease mode (#2402) — outside the feature-addition task scope
- `e7137a70` Version Packages (alpha) (#2375) — mechanical, release, or dependency commit
- `c0a5680f` docs: name the current site in both version banners and add a beta callout to the landing page (#2401) — mechanical, release, or dependency commit
- `3c02ffb5` chore: add missing changeset for @modelcontextprotocol/core (#2400) — outside the feature-addition task scope
- `b1535054` docs: rebuild the v2 documentation around a task-based page tree (#2397) — outside the feature-addition task scope
- `708d5455` docs: turn the version banners into working cross-site links (#2396) — mechanical, release, or dependency commit
- `732abe0a` docs: replace the typedoc site with VitePress (v2 + v1 reface) (#2395) — outside the feature-addition task scope
- `801111ea` fix(packaging): inline the fast-uri URIComponent type; drop stale typesVersions (#2394) — outside the feature-addition task scope
- `14160f72` docs(migration): close v1-to-v2 guide gaps found while migrating sample dependents (#2392) — outside the feature-addition task scope
- `e4e8b22d` feat(codemod): manifest handling overhaul and fixes from migrating sample dependents (#2393) — outside the 1-15 source-file feature scope
- `199a28e9` docs: correctness and coverage pass for the 2026-07-28 revision (#2389) — outside the feature-addition task scope
- `36055d5b` codemod iterations (#2386) — outside the feature-addition task scope
- `49aeb8eb` docs(server,examples): document extension capabilities with a runnable example (#2387) — outside the feature-addition task scope
- `f0bf7852` Serve input_required handlers on 2025-era connections via a legacy fulfilment shim (#2381) — outside the feature-addition task scope
- `7c42d476` docs(migration): align four passages with the implementation (#2388) — outside the feature-addition task scope
- `326ee89b` docs(migration): dual-role instanceof caveat in the Errors section (#2385) — outside the feature-addition task scope
- `b96a94c6` docs(migration): close guide gaps surfaced by real v1-to-v2 migrations (#2382) — outside the feature-addition task scope
- `9f8ba612` fix(codemod): keep request() result schemas the call still needs (#2383) — outside the feature-addition task scope
- `ba27d201` feat(examples): add a reference host/server pair — cli-client + todos-server (#2380) — outside the 1-15 source-file feature scope
- `1823aae8` Implement MCP 2026-07-28 (#2286) — outside the 1-15 source-file feature scope
- `e4227d13` Version Packages (alpha) (#1845) — mechanical, release, or dependency commit
- `0fb8406d` v2: codemod iterations, canonical zod schema exports from `sdk-shared` (#2354) — outside the feature-addition task scope
- `7ea6fde1` test(client): cover refresh retry after invalid token 401 (#2367) — outside the feature-addition task scope
- `ee732d64` chore: switch to module ESNext + moduleResolution bundler (#2095) — outside the feature-addition task scope
- `6312f2a3` fix(middleware): stop bundling workspace type graphs into .d.ts (avoids dts-gen OOM) (#2339) — outside the feature-addition task scope
- `5e0249f5` test(integration): stop the cloudflare workers test from rewriting workspace dist mid-suite (#2307) — outside the feature-addition task scope
- `e84c3e9a` fix(server,client): non-SEP draft spec conformance (eager list handlers, pagination docs, path-sanitization note) (#2269) — outside the feature-addition task scope
- `1110a0c9` test(integration): fix cloudflare workers test leaking workerd processes (#2296) — outside the feature-addition task scope
- `f2a33206` test(conformance): bump the conformance pin to 0.2.0-alpha.3 (#2289) — mechanical, release, or dependency commit
- `e8c71801` fix(server): bound resumability version gates to supported versions, pin the unsupported-version rejection format (#2280) — mechanical, release, or dependency commit
- `278d7253` test(conformance): pin the conformance suite to 0.2.0-alpha.2 and reconcile the expected-failures baseline (#2279) — outside the feature-addition task scope
- `0657c3be` fix(test-conformance): stop leaking the conformance server and hanging on stale ports (#2276) — outside the feature-addition task scope
- `542d5c95` v2: SdkError tests + codemod (#2137) — outside the feature-addition task scope
- `f563440c` codemod iterations round 1 (#2274) — outside the feature-addition task scope
- `1b53a415` Port of #2239 (v1.x) to v2 (#2275) — outside the feature-addition task scope
- `8d55531d` feat(core): per-revision spec reference types and the 2026-07-28 wire contract surface (#2252) — outside the 1-15 source-file feature scope
- `ab552c30` codemod improvements (#2156) — outside the feature-addition task scope
- `db28156a` fix(types): restore task wire types removed with the task feature (#2248) — outside the feature-addition task scope
- `c8d7401b` [SEP-2663] refactor!: remove 2025-11 experimental tasks (#2128) — outside the feature-addition task scope
- `600ba75f` test(e2e): spec-version lifecycle infrastructure for the 2026-07-28 release (#2226) — mechanical, release, or dependency commit
- `86276ed0` feat(server): retain the negotiated protocol version and expose getNegotiatedProtocolVersion() (#2230) — mechanical, release, or dependency commit
- `71dcc704` test(conformance): pin conformance 0.2.0-alpha.1 and baseline the draft-spec suites (#2227) — outside the feature-addition task scope
- `c54abdb1` test(e2e): host the sse matrix column on the shipped legacy SSEServerTransport (#2229) — outside the feature-addition task scope
- `e03bca90` v2 backcompat: server legacy package (#2206) — outside the feature-addition task scope
- `83a54a45` Update README.md (#2225) — outside the feature-addition task scope
- `16d13abf` feat(client,server): bundle default validators, expose customisation via subpaths (#2088) — outside the 1-15 source-file feature scope
- `1998a186` Port the end-to-end test suite to v2 (#2179) — outside the feature-addition task scope
- `5fc42e9b` fix README.md badges and blockquote icon (#2022) — outside the feature-addition task scope
- `48251fe2` feat: add v2 codemod draft (#1950) — outside the 1-15 source-file feature scope
- `4f226c1e` v2 backwards compat: SdkError status code (#2049) — outside the feature-addition task scope
- `22595b96` `v2` backwards compat: specTypeSchema exported - synchronous StandardSchemaV1 (#2047) — outside the feature-addition task scope
- `2c0c481c` fix: add \| undefined to transport option callbacks for exactOptionalPropertyTypes (#1855) — outside the feature-addition task scope
- `4fbcfcd1` refactor(specTypeSchema): drop `as unknown as` casts; add allowlist drift guard (#1993) — outside the feature-addition task scope
- `9fc9070b` refactor(client,server): move stdio transports to ./stdio subpath export (#1871) — outside the feature-addition task scope
- `55b1f06c` refactor(core): _wrapHandler hook so subclasses don't redeclare setRequestHandler (#1976) — outside the feature-addition task scope
- `2a7611d4` fix(packages): add types/typesVersions for legacy moduleResolution: node (#1898) — outside the feature-addition task scope
- `5433f405` fix(node): make hono an optional peer dependency (#1896) — outside the feature-addition task scope
- `434b2f11` fix(core): move @cfworker/json-schema out of main barrel into /validators/cf-worker subpath (#1897) — outside the feature-addition task scope
- `b2565467` fix(core): fall back to z.toJSONSchema for zod schemas without ~standard.jsonSchema (#1895) — outside the feature-addition task scope
- `7d7e62cc` Update `README.md` and `docs/faq.md` to link full quickstart guides (#1554) — outside the feature-addition task scope
- `bdfd7f01` fix: retrieve stored result from tasks/result for failed tasks (#1930) — outside the feature-addition task scope
- `b8886e77` chore: update spec.types.ts from upstream (#1888) — outside the feature-addition task scope
- `6bec24a1` fix: validate clientMetadataUrl at construction time (fail-fast) (#1653) — outside the feature-addition task scope
- `595652ce` chore(ci): switch publish to OIDC trusted publishing (#1838) — outside the feature-addition task scope
- `b65eb093` ci: only match open PRs in spec-sync existence check (#1886) — outside the feature-addition task scope
- `d4f802ef` docs: seed initial review rules for automated code review (#1867) — outside the feature-addition task scope
- `16936682` ci: skip lefthook on spec-sync bot push (#1866) — outside the feature-addition task scope
- `1eb80c4d` `v2`: add guard methods (#1842) — outside the feature-addition task scope
- `7ba58dac` `v2`: cf workers fix (#1843) — outside the feature-addition task scope
- `df4b6cc8` fix: prevent stack overflow in transport close with re-entrancy guard (#1788) — outside the feature-addition task scope
- `653c5d00` Rewrite `docs/server.md` as a code-heavy, prose-light how-to guide (#1552) — outside the feature-addition task scope
- `1eb31236` fix(client): preserve custom Accept headers in StreamableHTTPClientTransport (#1655) — outside the feature-addition task scope
- `866c08d3` fix(core): allow additional JSON Schema properties in elicitInput requestedSchema (#1768) — outside the feature-addition task scope
- `00215619` Version Packages (alpha) (#1841) — mechanical, release, or dependency commit
- `424cbaee` v2 tsdown fix (#1840) — outside the feature-addition task scope
- `53fb84bd` fix(ci): split release.yml into version + publish jobs (#1836) — mechanical, release, or dependency commit
- `54fa96e7` Version Packages (alpha) (#1420) — mechanical, release, or dependency commit
- `38d6cd23` chore(fastify): remove stray packageManager field from subpackage (#1833) — outside the feature-addition task scope
- `babaa506` chore(ci): remove dead publish job from main.yml (#1829) — outside the feature-addition task scope
- `689148dc` fix(server): propagate negotiated protocol version to transport (#1660) — mechanical, release, or dependency commit
- `0fabc277` chore: enter alpha prerelease mode (#1823) — outside the feature-addition task scope
- `81e4b2a4` Adds Fastify Middleware for v2 (#1536) — outside the feature-addition task scope
- `5f32a90f` fix(core): make fromJsonSchema() use runtime-aware default validator … (#1825) — outside the feature-addition task scope
- `2fd7f5ff` `v2`: Web standards Request object in ctx (#1822) — outside the feature-addition task scope
- `9bc9abc6` Fix: Handle error responses in Streamable HTTP SSE streams (#1390) — outside the feature-addition task scope
- `fcde4882` chore: drop zod from peerDependencies (kept as direct dependency) (#1824) — outside the feature-addition task scope
- `89fb0947` fix(core): consolidate per-request cleanup in _requestWithSchema (#1790) — outside the feature-addition task scope
- `8822c963` fix(examples): return 404 for unknown session IDs, 400 for missing (#1770) — outside the feature-addition task scope
- `d6a02c85` fix(core): ensure standardSchemaToJsonSchema emits type:object (#1796) — outside the feature-addition task scope
- `a39a9eb4` test: add compile-time key-parity assertions for spec type checks (#1652) — outside the feature-addition task scope
- `d99f3ee5` fix: continue OAuth metadata discovery on 5xx responses (#1632) — outside the feature-addition task scope
- `4aec5f79` Private key jwt scopes (#1443) — outside the feature-addition task scope
- `9efecc27` ci: format fetch-spec-types output with prettier (#1782) — mechanical, release, or dependency commit
- `d0505c19` chore(v2): pnpm audit fix (#1789) — outside the feature-addition task scope
- `48aba0d3` fix(core): add explicit \| undefined to Transport interface optional properties (#1766) — outside the feature-addition task scope
- `9d924b15` docs: note type vs interface for structuredContent (#1784) — outside the feature-addition task scope
- `9d083923` SEP-2207: Refresh token guidance (#1523) — outside the feature-addition task scope
- `52764396` fix(stdio): always set windowsHide on Windows, not just in Electron (#1772) — outside the feature-addition task scope
- `e86b1835` [v2] Minor task-related refactors (#1758) — outside the feature-addition task scope
- `cc9c9d19` chore(deps): bump pnpm/action-setup from 4.3.0 to 5.0.0 (#1794) — mechanical, release, or dependency commit
- `7595bd09` chore(deps): bump actions/deploy-pages from 4 to 5 (#1792) — mechanical, release, or dependency commit
- `1eb8a529` chore(deps): bump actions/upload-pages-artifact from 3 to 4 (#1793) — mechanical, release, or dependency commit
- `d3543c76` chore(deps): bump actions/configure-pages from 5 to 6 (#1791) — mechanical, release, or dependency commit
- `42072eeb` Enable Dependabot for GitHub Actions (#1436) — outside the feature-addition task scope
- `905b1e5c` test(core): add unit tests for normalizeHeaders and createFetchWithInit (#1374) — outside the feature-addition task scope
- `cce3ac75` `v2`: pin workflow versions to commit SHAs (#1781) — outside the feature-addition task scope
- `64897f78` fix(stdio): skip non-JSON lines in ReadBuffer (#1762) — outside the feature-addition task scope
- `a2e50373` fix: abort in-flight request handlers on connection close (#1735) — outside the feature-addition task scope
- `5516c1ba` chore: add instructions docs (#1778) — outside the feature-addition task scope
- `01954e62` fix: convert remaining capability throws to SdkError (#1761) — outside the feature-addition task scope
- `379392d0` fix: add missing size field to ResourceSchema (#1574) — outside the feature-addition task scope
- `40174d2d` `v2`: Add left-hook pre-push (#1003) — outside the feature-addition task scope
- `78bae742` fix(server): call onerror callback for all transport errors (#1433) — outside the feature-addition task scope
- `0ed72374` `v2`: limit public exports (#1680) — outside the feature-addition task scope
- `f1ade75b` fix: handle EPIPE errors in StdioServerTransport to prevent process crash (#1568) — outside the feature-addition task scope
- `462c3fc4` `v2` - RFC Extract Tasks out of protocol.ts into TaskManager (#1673) — outside the feature-addition task scope
- `7d9c72ee` ci: remove claude-code-review workflow (#1754) — outside the feature-addition task scope
- `13a0d345` Don't swallow fetch TypeError as CORS in non-browser environments (#1595) — outside the feature-addition task scope
- `f9fda807` ci: skip claude.yml when comment is '@claude review' (#1737) — outside the feature-addition task scope
- `677511b5` Allow servers / clients to advertise extensions in the capability object (#1630) — outside the feature-addition task scope
- `9aed95a7` feat: add auth-test-server for OAuth conformance testing (#1384) — all changed source files were newly added
- `a7c7896a` Remove prefix on over-the-wire `ProtocolError`s (#1727) — outside the feature-addition task scope
- `72fe68b2` Restore negotiated protocol version on reconnection transport (#1591) — mechanical, release, or dependency commit

## Limitations

- Changed files are an imperfect proxy for the ideal context set.
- Commit titles can underspecify the original feature task.
- Title mode can contain exact path or declaration hints and should be compared with keyword-ablated results.
- Retrieval recall does not measure whether a Coding Agent completes the task successfully.
