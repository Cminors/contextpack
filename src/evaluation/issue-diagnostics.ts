import type { ContextCandidate, ScoreBreakdown } from "../types.js";
import { SCORE_WEIGHTS } from "../ranking/score.js";
import { auditIssueFailures } from "./issue-audit.js";
import type {
  IssueBenchmarkReport,
  IssueCandidateDiagnostic,
  IssueCandidateDiagnostics,
  IssueEvaluationResult,
} from "./issue-types.js";

export type RankingEvidenceCategory =
  | "candidate-not-found"
  | "non-finite-score"
  | "prediction-policy-displacement"
  | "no-direct-query-signal"
  | "direct-signal-below-cutoff";

export type RankingEvidenceCounts = Record<RankingEvidenceCategory, number>;

export interface IssueRankingDiagnosticEntry {
  instanceId: string;
  repo: string;
  category: RankingEvidenceCategory;
  goldCandidates: IssueCandidateDiagnostic[];
  bestGoldCandidate: IssueCandidateDiagnostic;
  tenthCandidateScore: number | null;
  scoreGapToTenth: number | null;
  dominantSignal: keyof ScoreBreakdown | null;
}

export interface IssueRankingDiagnostics {
  version: 1;
  generatedAt: string;
  sourceDataset: string;
  sourceRevision: string;
  eligibleMisses: number;
  diagnosedMisses: number;
  missingEvidence: string[];
  counts: RankingEvidenceCounts;
  entries: IssueRankingDiagnosticEntry[];
  limitations: string[];
}

const emptyCounts = (): RankingEvidenceCounts => ({
  "candidate-not-found": 0,
  "non-finite-score": 0,
  "prediction-policy-displacement": 0,
  "no-direct-query-signal": 0,
  "direct-signal-below-cutoff": 0,
});

function compareCandidatesByScore(left: ContextCandidate, right: ContextCandidate): number {
  const leftIsFinite = Number.isFinite(left.score);
  const rightIsFinite = Number.isFinite(right.score);
  if (leftIsFinite !== rightIsFinite) return leftIsFinite ? -1 : 1;
  if (leftIsFinite && left.score !== right.score) return right.score - left.score;
  return left.path.localeCompare(right.path);
}

export function collectIssueCandidateDiagnostics(
  candidates: readonly ContextCandidate[],
  goldFiles: readonly string[],
): IssueCandidateDiagnostics {
  const candidateByPath = new Map(candidates.map((candidate) => [candidate.path, candidate]));
  const finalRankByPath = new Map(candidates.map((candidate, index) => [candidate.path, index + 1]));
  const scoreRankByPath = new Map(
    [...candidates]
      .sort(compareCandidatesByScore)
      .map((candidate, index) => [candidate.path, index + 1]),
  );
  const diagnosticFor = (filePath: string): IssueCandidateDiagnostic => {
    const candidate = candidateByPath.get(filePath);
    if (!candidate) {
      return {
        path: filePath,
        finalRank: null,
        scoreRank: null,
        scoreState: "missing",
        score: null,
        breakdown: null,
        nonFiniteSignals: [],
        reasons: [],
      };
    }
    const signalKeys = Object.keys(candidate.breakdown) as Array<keyof ScoreBreakdown>;
    const nonFiniteSignals = signalKeys.filter((signal) => !Number.isFinite(candidate.breakdown[signal]));
    const finite = Number.isFinite(candidate.score) && nonFiniteSignals.length === 0;
    return {
      path: filePath,
      finalRank: finalRankByPath.get(filePath) ?? null,
      scoreRank: scoreRankByPath.get(filePath) ?? null,
      scoreState: finite ? "finite" : "non-finite",
      score: finite ? candidate.score : null,
      breakdown: finite ? candidate.breakdown : null,
      nonFiniteSignals,
      reasons: candidate.reasons,
    };
  };
  return {
    topCandidates: candidates.slice(0, 10).map((candidate) => diagnosticFor(candidate.path)),
    goldCandidates: goldFiles.map(diagnosticFor),
  };
}

function bestGoldCandidate(candidates: IssueCandidateDiagnostic[]): IssueCandidateDiagnostic {
  return [...candidates].sort((left, right) =>
    (left.finalRank ?? Number.POSITIVE_INFINITY) - (right.finalRank ?? Number.POSITIVE_INFINITY)
    || (left.scoreRank ?? Number.POSITIVE_INFINITY) - (right.scoreRank ?? Number.POSITIVE_INFINITY)
    || left.path.localeCompare(right.path),
  )[0]!;
}

function evidenceCategory(candidate: IssueCandidateDiagnostic): RankingEvidenceCategory {
  if (candidate.scoreState === "missing") return "candidate-not-found";
  if (candidate.scoreState === "non-finite") return "non-finite-score";
  if (candidate.score === null || candidate.breakdown === null) return "non-finite-score";
  if ((candidate.finalRank ?? Number.POSITIVE_INFINITY) > 20
    && (candidate.scoreRank ?? Number.POSITIVE_INFINITY) <= 20) {
    return "prediction-policy-displacement";
  }
  if (candidate.breakdown.lexical === 0 && candidate.breakdown.symbol === 0) {
    return "no-direct-query-signal";
  }
  return "direct-signal-below-cutoff";
}

function dominantSignal(candidate: IssueCandidateDiagnostic): keyof ScoreBreakdown | null {
  const breakdown = candidate.breakdown;
  if (!breakdown) return null;
  const signals = Object.keys(SCORE_WEIGHTS) as Array<keyof ScoreBreakdown>;
  const ranked = signals.sort((left, right) =>
    breakdown[right] * SCORE_WEIGHTS[right] - breakdown[left] * SCORE_WEIGHTS[left],
  );
  const strongest = ranked[0];
  return strongest && breakdown[strongest] * SCORE_WEIGHTS[strongest] > 0 ? strongest : null;
}

function diagnosticEntry(result: IssueEvaluationResult): IssueRankingDiagnosticEntry | null {
  const diagnostics = result.candidateDiagnostics;
  if (!diagnostics || diagnostics.goldCandidates.length === 0) return null;
  const best = bestGoldCandidate(diagnostics.goldCandidates);
  const tenthCandidateScore = diagnostics.topCandidates.at(-1)?.score ?? null;
  return {
    instanceId: result.instanceId,
    repo: result.repo,
    category: evidenceCategory(best),
    goldCandidates: diagnostics.goldCandidates,
    bestGoldCandidate: best,
    tenthCandidateScore,
    scoreGapToTenth: best.score === null || tenthCandidateScore === null
      ? null
      : Number((tenthCandidateScore - best.score).toFixed(6)),
    dominantSignal: dominantSignal(best),
  };
}

export function diagnoseIssueRanking(report: IssueBenchmarkReport): IssueRankingDiagnostics {
  const outsideTopTwenty = new Set(
    auditIssueFailures(report).entries
      .filter((entry) => entry.category === "file-miss-outside-top-20")
      .map((entry) => entry.instanceId),
  );
  const counts = emptyCounts();
  const entries: IssueRankingDiagnosticEntry[] = [];
  const missingEvidence: string[] = [];

  for (const result of report.results.filter((item) => outsideTopTwenty.has(item.instanceId))) {
    const entry = diagnosticEntry(result);
    if (!entry) {
      missingEvidence.push(result.instanceId);
      continue;
    }
    counts[entry.category] += 1;
    entries.push(entry);
  }

  return {
    version: 1,
    generatedAt: report.generatedAt,
    sourceDataset: report.sourceDataset,
    sourceRevision: report.sourceRevision,
    eligibleMisses: outsideTopTwenty.size,
    diagnosedMisses: entries.length,
    missingEvidence,
    counts,
    entries,
    limitations: [
      "These categories describe observed candidate and score conditions; they are not causal ground truth.",
      "No direct query signal means both lexical and symbol components are zero after task normalization.",
      "A non-finite score is an arithmetic integrity failure and must be fixed before interpreting relative rank.",
      "Prediction-policy displacement means a gold file is score-ranked in the top 20 but moved below the final top 20 by category-aware prioritization.",
      "Candidate not found means the gold path was absent from the supported discovered candidate set; it does not identify which discovery rule excluded it.",
    ],
  };
}
