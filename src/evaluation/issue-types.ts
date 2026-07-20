import type { ScoreBreakdown } from "../types.js";

export interface LineRegion {
  path: string;
  startLine: number;
  endLine: number;
}

export interface GoldPatchRegion extends LineRegion {
  kind: "patch-hunk";
}

export type IssueBenchmarkLanguage = "javascript-typescript" | "python";

export interface IssueBenchmarkInstance {
  instanceId: string;
  sourceDataset: string;
  sourceRevision: string;
  repo: string;
  baseCommit: string;
  issueText: string;
  language: IssueBenchmarkLanguage;
  goldRegions: GoldPatchRegion[];
  metadata: {
    issueUrl: string | null;
    prUrl: string | null;
    createdAt: string | null;
    patchSha256: string;
    excludedPatchFiles: number;
  };
}

export interface RegionBudgetMetrics {
  budgetLines: number;
  emittedLines: number;
  coveredGoldLines: number;
  linePrecision: number;
  lineRecall: number;
  lineF1: number;
  hitRegionRate: number;
  noiseRegionRate: number;
  contextEfficiency: number;
  ndcg: number;
  firstUsefulHit: number | null;
}

export interface RegionBudgetAggregate {
  budgetLines: number;
  medianEmittedLines: number;
  linePrecision: number;
  lineRecall: number;
  lineF1: number;
  hitRegionRate: number;
  noiseRegionRate: number;
  contextEfficiency: number;
  ndcg: number;
  usefulHitRate: number;
  medianFirstUsefulHit: number | null;
}

export interface IssueCandidateDiagnostic {
  path: string;
  finalRank: number | null;
  scoreRank: number | null;
  scoreState: "finite" | "non-finite" | "missing";
  score: number | null;
  breakdown: ScoreBreakdown | null;
  nonFiniteSignals: Array<keyof ScoreBreakdown>;
  reasons: string[];
}

export interface IssueCandidateDiagnostics {
  topCandidates: IssueCandidateDiagnostic[];
  goldCandidates: IssueCandidateDiagnostic[];
}

export interface IssueEvaluationResult {
  instanceId: string;
  repo: string;
  baseCommit: string;
  goldRegions: GoldPatchRegion[];
  predictedRegions: LineRegion[];
  goldFiles: string[];
  predictions: string[];
  candidateDiagnostics?: IssueCandidateDiagnostics;
  recallAt5: number;
  recallAt10: number;
  reciprocalRank: number;
  regionMetrics: Record<string, RegionBudgetMetrics>;
  estimatedTokens: number;
  durationMs: number;
}

export interface IssueBenchmarkReport {
  version: 1;
  generatedAt: string;
  sourceDataset: string;
  sourceRevision: string;
  requestedInstances: number;
  validInstances: number;
  tokenBudget: number;
  lineBudgets: number[];
  results: IssueEvaluationResult[];
  skipped: Array<{ instanceId: string; reason: string }>;
  aggregate: {
    recallAt5: number;
    recallAt10: number;
    mrr: number;
    medianTokens: number;
    medianDurationMs: number;
    regionMetrics: Record<string, RegionBudgetAggregate>;
  };
  limitations: string[];
}

export interface IssueBenchmarkCheckpoint {
  version: 1;
  updatedAt: string;
  datasetFingerprint: string;
  sourceDataset: string;
  sourceRevision: string;
  requestedInstanceIds: string[];
  tokenBudget: number;
  lineBudgets: number[];
  historyCount: number;
  results: IssueEvaluationResult[];
  skipped: Array<{ instanceId: string; reason: string }>;
}
