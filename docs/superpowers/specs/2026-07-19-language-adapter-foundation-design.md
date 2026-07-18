# Language Adapter Foundation Design

**Date:** 2026-07-19

**Status:** Approved for implementation

## Goal

Separate language-specific repository discovery and source analysis from the
language-neutral ranking and context-selection pipeline. JavaScript and
TypeScript remain the only supported languages in this phase, and the existing
P0.9 behavior must remain reproducibly identical.

## Evidence And Scope

The current language coupling is concentrated in `src/repository/discover.ts`,
`src/repository/packages.ts`, `src/analysis/ast.ts`, `src/analysis/analyze.ts`,
`src/ranking/lexical.ts`, `src/ranking/predictions.ts`, and the doctor/output
surfaces. Ranking already consumes the normalized `FileAnalysis` IR, so the
lowest-risk boundary is the producer side of that IR.

This phase includes:

- a small internal `LanguageAdapter` contract;
- a deterministic adapter registry with one JavaScript/TypeScript adapter;
- moving the current TypeScript Compiler API producer behind that adapter;
- registry-driven source/config pattern discovery;
- compatibility facades for existing analysis exports;
- parity tests and a stable evaluation comparison script.

This phase explicitly excludes Python, other languages, parser dependencies,
dynamic plugin loading, MCP, Skills, public package exports, ranking changes,
manifest schema changes, and changes to the existing JS/TS heuristics.

## Architecture

The data flow becomes:

```text
adapter registry
    -> union source/config patterns
    -> shared ignore, sensitive-path filtering, normalization, and sorting
    -> deterministic adapter ownership
    -> adapter FileAnalysis producers
    -> shared config-file analysis and reverse-edge construction
    -> existing ranking, region localization, selection, and rendering
```

The internal contract is intentionally narrower than a general AST API:

```ts
export interface LanguageAdapter {
  readonly id: string;
  readonly sourcePatterns: readonly string[];
  readonly configPatterns: readonly string[];
  owns(filePath: string): boolean;
  analyzeFiles(
    repository: DiscoveredRepository,
    sourceFiles: readonly string[],
  ): Promise<FileAnalysis[]>;
  enrichSemanticReferences?(
    repository: DiscoveredRepository,
    files: FileAnalysis[],
    focusPaths: readonly string[],
  ): boolean;
}
```

The registry order is stable. Every discovered source path must have exactly one
owner; zero owners and multiple owners are typed errors. Adapter output keeps
the existing invariants: POSIX repository-relative paths, one-based inclusive
line ranges, normalized `SymbolRecord` values, deduplicated sorted edges, and
no paths outside the repository.

`FileAnalysis`, `ContextManifest`, `ContextCandidate`, and `ContextSelection`
remain the public internal representations for this release. `ContextManifest`
stays at version 1. `analyzeTask` keeps its current signature and phase order.
The existing `ast.ts` exports remain as compatibility facades while the
implementation moves to the adapter module.

## Error And Safety Behavior

The shared discovery layer continues to resolve the Git root, honor
`.gitignore`, exclude build/dependency/context directories, filter sensitive
paths, and sort paths deterministically. Existing `INVALID_ROOT`,
`UNSUPPORTED_REPOSITORY`, and no-Git warning behavior remains unchanged.
Parser and ownership failures are converted to `ContextPackError` values with
stable codes rather than leaking parser-specific exceptions.

## Verification Strategy

Parity is checked at increasing scope:

1. adapter ownership, pattern union, ordering, and dispatcher unit tests;
2. deep fixture parity for discovery and `FileAnalysis` fields;
3. unchanged ranking/region/selection tests and CLI artifact tests;
4. `npm run check` and `npm run perf:smoke`;
5. P0.9 full-set replay with 43 valid instances and zero skips, comparing a
   normalized projection that excludes only `generatedAt` and timing values.

The final P0.9 reference remains File Recall@10 `0.3891472868`, MRR
`0.1771596393`, line recall@500 `0.1030487768`, useful-hit@500 `0.2093023256`.
Every per-instance `predictions` and `predictedRegions` array must match the
reference exactly. Axios and both ten-commit replay modes must also reproduce
their P0.9 predictions and recorded metrics.

## Follow-Up Boundary

Once this phase passes, Python support can add a second adapter without
changing the ranking consumer. Skill and MCP work can expose a stable facade
after the adapter contract and manifest compatibility have been exercised.
