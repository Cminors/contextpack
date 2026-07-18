import type {
  IssueBenchmarkReport,
  IssueCandidateDiagnostic,
  IssueEvaluationResult,
  RegionBudgetAggregate,
  RegionBudgetMetrics,
} from "./issue-types.js";

type ProjectedIssueResult = Omit<IssueEvaluationResult, "durationMs">;
type ProjectedAggregate = Omit<IssueBenchmarkReport["aggregate"], "medianDurationMs">;

export interface IssueParityProjection {
  version: IssueBenchmarkReport["version"];
  sourceDataset: string;
  sourceRevision: string;
  requestedInstances: number;
  validInstances: number;
  tokenBudget: number;
  lineBudgets: number[];
  results: ProjectedIssueResult[];
  skipped: Array<{ instanceId: string; reason: string }>;
  aggregate: ProjectedAggregate;
  limitations: string[];
}

export interface IssueParityComparison {
  equal: boolean;
  mismatches: string[];
}

const compareKeys = (left: string, right: string): number => left.localeCompare(right);

const projectRecord = <T>(record: Record<string, T>, project: (value: T) => T): Record<string, T> =>
  Object.fromEntries(
    Object.keys(record)
      .sort(compareKeys)
      .map((key) => [key, project(record[key] as T)]),
  );

const projectRegionMetrics = (metrics: Record<string, RegionBudgetMetrics>): Record<string, RegionBudgetMetrics> =>
  projectRecord(metrics, (metric) => ({ ...metric }));

const projectAggregateRegionMetrics = (
  metrics: Record<string, RegionBudgetAggregate>,
): Record<string, RegionBudgetAggregate> => projectRecord(metrics, (metric) => ({ ...metric }));

const projectCandidateDiagnostic = (diagnostic: IssueCandidateDiagnostic): IssueCandidateDiagnostic => ({
  ...diagnostic,
  breakdown: diagnostic.breakdown === null ? null : { ...diagnostic.breakdown },
  nonFiniteSignals: [...diagnostic.nonFiniteSignals],
  reasons: [...diagnostic.reasons],
});

const projectInstance = (result: IssueEvaluationResult): ProjectedIssueResult => {
  const { durationMs: _durationMs, regionMetrics, candidateDiagnostics, ...semantic } = result;
  return {
    ...semantic,
    goldRegions: result.goldRegions.map((region) => ({ ...region })),
    predictedRegions: result.predictedRegions.map((region) => ({ ...region })),
    goldFiles: [...result.goldFiles],
    predictions: [...result.predictions],
    regionMetrics: projectRegionMetrics(regionMetrics),
    ...(candidateDiagnostics === undefined ? {} : {
      candidateDiagnostics: {
        topCandidates: candidateDiagnostics.topCandidates.map(projectCandidateDiagnostic),
        goldCandidates: candidateDiagnostics.goldCandidates.map(projectCandidateDiagnostic),
      },
    }),
  };
};

const skipOrder = (left: { instanceId: string; reason: string }, right: { instanceId: string; reason: string }): number => {
  const instanceOrder = left.instanceId.localeCompare(right.instanceId);
  return instanceOrder === 0 ? left.reason.localeCompare(right.reason) : instanceOrder;
};

const projectAggregate = (aggregate: IssueBenchmarkReport["aggregate"]): ProjectedAggregate => {
  const { medianDurationMs: _medianDurationMs, regionMetrics, ...semantic } = aggregate;
  return {
    ...semantic,
    regionMetrics: projectAggregateRegionMetrics(regionMetrics),
  };
};

export const projectIssueParity = (report: IssueBenchmarkReport): IssueParityProjection => ({
  version: report.version,
  sourceDataset: report.sourceDataset,
  sourceRevision: report.sourceRevision,
  requestedInstances: report.requestedInstances,
  validInstances: report.validInstances,
  tokenBudget: report.tokenBudget,
  lineBudgets: [...report.lineBudgets],
  results: [...report.results]
    .sort((left, right) => left.instanceId.localeCompare(right.instanceId))
    .map(projectInstance),
  skipped: [...report.skipped]
    .sort(skipOrder)
    .map((skip) => ({ ...skip })),
  aggregate: projectAggregate(report.aggregate),
  limitations: [...report.limitations],
});

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const collectStructuredDifferences = (expected: unknown, actual: unknown): string[] => {
  const differences: string[] = [];

  const walk = (left: unknown, right: unknown, path: string): void => {
    if (Object.is(left, right)) return;

    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
        differences.push(path);
        return;
      }
      let arrayMismatch = false;
      for (let index = 0; index < left.length; index += 1) {
        const before = differences.length;
        walk(left[index], right[index], `${path}[${index}]`);
        if (differences.length !== before) arrayMismatch = true;
        differences.length = before;
      }
      if (arrayMismatch) differences.push(path);
      return;
    }

    if (isObject(left) || isObject(right)) {
      if (!isObject(left) || !isObject(right)) {
        differences.push(path);
        return;
      }
      const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort(compareKeys);
      for (const key of keys) {
        const childPath = path.length === 0 ? key : `${path}.${key}`;
        if (!(key in left) || !(key in right)) {
          differences.push(childPath);
        } else {
          walk(left[key], right[key], childPath);
        }
      }
      return;
    }

    differences.push(path);
  };

  const leftProjection = expected as IssueParityProjection;
  const rightProjection = actual as IssueParityProjection;
  const leftResults = leftProjection.results;
  const rightResults = rightProjection.results;
  const leftById = new Map(leftResults.map((result) => [result.instanceId, result]));
  const rightById = new Map(rightResults.map((result) => [result.instanceId, result]));
  const resultIds = [...new Set([...leftById.keys(), ...rightById.keys()])].sort(compareKeys);

  const leftWithoutResults = { ...leftProjection, results: undefined };
  const rightWithoutResults = { ...rightProjection, results: undefined };
  walk(leftWithoutResults, rightWithoutResults, "");

  for (const instanceId of resultIds) {
    const leftResult = leftById.get(instanceId);
    const rightResult = rightById.get(instanceId);
    if (leftResult === undefined || rightResult === undefined) {
      differences.push(`results[${instanceId}]`);
    } else {
      walk(leftResult, rightResult, `results[${instanceId}]`);
    }
  }

  return differences;
};

export function compareIssueParity(
  baseline: IssueBenchmarkReport,
  current: IssueBenchmarkReport,
): string[] {
  return collectStructuredDifferences(projectIssueParity(baseline), projectIssueParity(current));
}

export const compareIssueParityReport = (
  baseline: IssueBenchmarkReport,
  current: IssueBenchmarkReport,
): IssueParityComparison => {
  const mismatches = compareIssueParity(baseline, current);
  return { equal: mismatches.length === 0, mismatches };
};
