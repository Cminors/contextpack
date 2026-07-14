import type { IssueBenchmarkReport, IssueEvaluationResult } from "./issue-types.js";

export type IssueAuditCategory =
  | "file-hit-region-hit"
  | "file-hit-region-miss"
  | "file-miss-rank-11-20"
  | "file-miss-outside-top-20";

export interface IssueAuditEntry {
  instanceId: string;
  repo: string;
  category: IssueAuditCategory;
  goldFiles: Array<{ path: string; rank: number | null }>;
  topPredictions: string[];
}

export interface IssueAuditCounts {
  fileHitRegionHit: number;
  fileHitRegionMiss: number;
  fileMissRank11To20: number;
  fileMissOutsideTop20: number;
}

export interface IssueFailureAudit {
  version: 1;
  generatedAt: string;
  sourceDataset: string;
  sourceRevision: string;
  validInstances: number;
  maximumLineBudget: number;
  counts: IssueAuditCounts & {
    fileRankingMisses: number;
    regionLocalizationMisses: number;
  };
  byRepository: Array<{ repo: string; counts: IssueAuditCounts }>;
  entries: IssueAuditEntry[];
  limitations: string[];
}

const emptyCounts = (): IssueAuditCounts => ({
  fileHitRegionHit: 0,
  fileHitRegionMiss: 0,
  fileMissRank11To20: 0,
  fileMissOutsideTop20: 0,
});

function categoryFor(
  result: IssueEvaluationResult,
  goldFiles: IssueAuditEntry["goldFiles"],
  maximumLineBudget: number,
): IssueAuditCategory {
  const hasTopTenHit = goldFiles.some(({ rank }) => rank !== null && rank <= 10);
  const hasRecordedTopTwentyHit = goldFiles.some(({ rank }) => rank !== null && rank <= 20);
  const firstUsefulHit = result.regionMetrics[String(maximumLineBudget)]?.firstUsefulHit;
  const hasUsefulRegion = firstUsefulHit !== null && firstUsefulHit !== undefined;

  if (hasTopTenHit) return hasUsefulRegion ? "file-hit-region-hit" : "file-hit-region-miss";
  return hasRecordedTopTwentyHit ? "file-miss-rank-11-20" : "file-miss-outside-top-20";
}

function increment(counts: IssueAuditCounts, category: IssueAuditCategory): void {
  if (category === "file-hit-region-hit") counts.fileHitRegionHit += 1;
  else if (category === "file-hit-region-miss") counts.fileHitRegionMiss += 1;
  else if (category === "file-miss-rank-11-20") counts.fileMissRank11To20 += 1;
  else counts.fileMissOutsideTop20 += 1;
}

export function auditIssueFailures(report: IssueBenchmarkReport): IssueFailureAudit {
  const maximumLineBudget = report.lineBudgets.at(-1) ?? 0;
  const counts = emptyCounts();
  const repositoryCounts = new Map<string, IssueAuditCounts>();
  const entries = report.results.map((result): IssueAuditEntry => {
    const goldFiles = result.goldFiles.map((goldFile) => {
      const index = result.predictions.indexOf(goldFile);
      return { path: goldFile, rank: index < 0 ? null : index + 1 };
    });
    const category = categoryFor(result, goldFiles, maximumLineBudget);
    increment(counts, category);
    const perRepository = repositoryCounts.get(result.repo) ?? emptyCounts();
    increment(perRepository, category);
    repositoryCounts.set(result.repo, perRepository);
    return {
      instanceId: result.instanceId,
      repo: result.repo,
      category,
      goldFiles,
      topPredictions: result.predictions.slice(0, 10),
    };
  });

  return {
    version: 1,
    generatedAt: report.generatedAt,
    sourceDataset: report.sourceDataset,
    sourceRevision: report.sourceRevision,
    validInstances: report.validInstances,
    maximumLineBudget,
    counts: {
      ...counts,
      fileRankingMisses: counts.fileMissRank11To20 + counts.fileMissOutsideTop20,
      regionLocalizationMisses: counts.fileHitRegionMiss,
    },
    byRepository: [...repositoryCounts]
      .map(([repo, repoCounts]) => ({ repo, counts: repoCounts }))
      .sort((left, right) => left.repo.localeCompare(right.repo)),
    entries,
    limitations: [
      "The audit identifies the pipeline stage where retrieval failed; it does not prove the underlying scoring cause.",
      "Gold-file ranks are limited to the 20 prediction paths stored by the issue benchmark.",
      "A useful region means overlap with an old-side patch hunk at the largest configured line budget.",
    ],
  };
}
