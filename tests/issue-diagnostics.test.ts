import { describe, expect, it } from "vitest";
import { diagnoseIssueRanking } from "../src/evaluation/issue-diagnostics.js";
import type {
  IssueBenchmarkReport,
  IssueCandidateDiagnostic,
  IssueEvaluationResult,
} from "../src/evaluation/issue-types.js";
import { renderIssueDiagnostics } from "../src/output/markdown.js";

const breakdown = (
  lexical: number,
  symbol = 0,
): NonNullable<IssueCandidateDiagnostic["breakdown"]> => ({
  lexical,
  symbol,
  dependency: lexical === 0 && symbol === 0 ? 0.5 : 0,
  git: 0,
  test: 0,
  rule: 0,
});

function result(
  instanceId: string,
  candidate: IssueCandidateDiagnostic,
  topScore = 0.5,
): IssueEvaluationResult {
  const predictions = Array.from({ length: 20 }, (_, index) => `src/prediction-${index + 1}.ts`);
  return {
    instanceId,
    repo: "example/repo",
    baseCommit: "a".repeat(40),
    goldRegions: [{ path: candidate.path, startLine: 1, endLine: 2, kind: "patch-hunk" }],
    predictedRegions: [],
    goldFiles: [candidate.path],
    predictions,
    candidateDiagnostics: {
      topCandidates: [{
        path: predictions[9]!,
        finalRank: 10,
        scoreRank: 10,
        scoreState: "finite",
        score: topScore,
        breakdown: breakdown(1),
        nonFiniteSignals: [],
        reasons: [],
      }],
      goldCandidates: [candidate],
    },
    recallAt5: 0,
    recallAt10: 0,
    reciprocalRank: 0,
    regionMetrics: { "500": {
      budgetLines: 500, emittedLines: 100, coveredGoldLines: 0, linePrecision: 0, lineRecall: 0,
      lineF1: 0, hitRegionRate: 0, noiseRegionRate: 1, contextEfficiency: 0, ndcg: 0, firstUsefulHit: null,
    } },
    estimatedTokens: 100,
    durationMs: 10,
  };
}

function report(results: IssueEvaluationResult[]): IssueBenchmarkReport {
  return {
    version: 1,
    generatedAt: "2026-07-14T00:00:00.000Z",
    sourceDataset: "fixture/issues",
    sourceRevision: "fixture-v1",
    requestedInstances: results.length,
    validInstances: results.length,
    tokenBudget: 12_000,
    lineBudgets: [500],
    results,
    skipped: [],
    aggregate: {
      recallAt5: 0, recallAt10: 0, mrr: 0, medianTokens: 100, medianDurationMs: 10, regionMetrics: {},
    },
    limitations: [],
  };
}

describe("issue ranking diagnostics", () => {
  it("classifies observable ranking conditions without claiming causality", () => {
    const diagnostics = diagnoseIssueRanking(report([
      result("missing", { path: "src/missing.ts", finalRank: null, scoreRank: null, scoreState: "missing", score: null, breakdown: null, nonFiniteSignals: [], reasons: [] }),
      result("non-finite", { path: "src/invalid.ts", finalRank: 40, scoreRank: 40, scoreState: "non-finite", score: null, breakdown: null, nonFiniteSignals: ["lexical"], reasons: [] }),
      result("policy", { path: "src/policy.ts", finalRank: 25, scoreRank: 12, scoreState: "finite", score: 0.4, breakdown: breakdown(0.8), nonFiniteSignals: [], reasons: [] }),
      result("no-direct", { path: "src/structural.ts", finalRank: 30, scoreRank: 30, scoreState: "finite", score: 0.08, breakdown: breakdown(0), nonFiniteSignals: [], reasons: [] }),
      result("below", { path: "src/below.ts", finalRank: 35, scoreRank: 35, scoreState: "finite", score: 0.2, breakdown: breakdown(0.5), nonFiniteSignals: [], reasons: [] }),
    ]));

    expect(diagnostics.counts).toEqual({
      "candidate-not-found": 1,
      "non-finite-score": 1,
      "prediction-policy-displacement": 1,
      "no-direct-query-signal": 1,
      "direct-signal-below-cutoff": 1,
    });
    expect(diagnostics.entries.map((entry) => entry.category)).toEqual([
      "candidate-not-found",
      "non-finite-score",
      "prediction-policy-displacement",
      "no-direct-query-signal",
      "direct-signal-below-cutoff",
    ]);
    expect(diagnostics.entries[4]).toMatchObject({ scoreGapToTenth: 0.3, dominantSignal: "lexical" });
    const markdown = renderIssueDiagnostics(diagnostics);
    expect(markdown).toContain("Non-finite score: 1");
    expect(markdown).not.toContain("NaN");
  });

  it("reports missing evidence from backward-compatible checkpoints", () => {
    const legacy = result("legacy", {
      path: "src/legacy.ts", finalRank: null, scoreRank: null, score: null, breakdown: null, reasons: [],
      scoreState: "missing", nonFiniteSignals: [],
    });
    delete legacy.candidateDiagnostics;
    const diagnostics = diagnoseIssueRanking(report([legacy]));
    const markdown = renderIssueDiagnostics(diagnostics);

    expect(diagnostics).toMatchObject({ eligibleMisses: 1, diagnosedMisses: 0, missingEvidence: ["legacy"] });
    expect(markdown).toContain("does not claim a causal root cause");
    expect(markdown).toContain("Missing diagnostic evidence: 1");
  });
});
