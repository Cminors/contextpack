import type { IssueBenchmarkReport } from "./issue-types.js";
import { SWE_BENCH_LITE_PYTHON } from "./swebench-python-dataset.js";

export const PYTHON_SUPPORT_FLOORS = {
  recallAt10: 0.250,
  mrr: 0.100,
  lineRecallAt500: 0.050,
  usefulHitAt500: 0.100,
} as const;

export type PythonBenchmarkVerdict =
  | "validated"
  | "file-only"
  | "not-validated"
  | "invalid-run";

export interface PythonBenchmarkGateResult {
  verdict: PythonBenchmarkVerdict;
  failures: string[];
  metrics: {
    recallAt10: number;
    mrr: number;
    lineRecallAt500: number;
    usefulHitAt500: number;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

const finiteMetric = (value: unknown): number => (
  typeof value === "number" && Number.isFinite(value) ? value : Number.NaN
);

export const evaluatePythonBenchmarkGates = (
  report: IssueBenchmarkReport,
): PythonBenchmarkGateResult => {
  const rawReport: Record<string, unknown> = isRecord(report) ? report : {};
  const aggregate = isRecord(rawReport.aggregate) ? rawReport.aggregate : {};
  const regionMetrics = isRecord(aggregate.regionMetrics) ? aggregate.regionMetrics : {};
  const rawAt500 = regionMetrics["500"];
  const at500 = isRecord(rawAt500) ? rawAt500 : undefined;
  const metrics = {
    recallAt10: finiteMetric(aggregate.recallAt10),
    mrr: finiteMetric(aggregate.mrr),
    lineRecallAt500: finiteMetric(at500?.lineRecall),
    usefulHitAt500: finiteMetric(at500?.usefulHitRate),
  };
  const results = Array.isArray(rawReport.results) ? rawReport.results : [];
  const resultInstanceIds = results.map((result) => (
    isRecord(result) && typeof result.instanceId === "string" && result.instanceId.length > 0
      ? result.instanceId
      : null
  ));
  const hasUniqueResultInstanceIds = resultInstanceIds.every((instanceId) => instanceId !== null)
    && new Set(resultInstanceIds).size === resultInstanceIds.length;
  const expectedLineBudgets = [100, 250, 500];
  const hasExpectedLineBudgets = Array.isArray(rawReport.lineBudgets)
    && rawReport.lineBudgets.length === expectedLineBudgets.length
    && rawReport.lineBudgets.every((budget, index) => budget === expectedLineBudgets[index]);
  const infrastructureFailures = [
    ...(rawReport.sourceDataset === SWE_BENCH_LITE_PYTHON.id ? [] : ["source dataset mismatch"]),
    ...(rawReport.sourceRevision === SWE_BENCH_LITE_PYTHON.revision ? [] : ["source revision mismatch"]),
    ...(rawReport.version === 1 ? [] : ["report version must be 1"]),
    ...(rawReport.requestedInstances === 300 ? [] : ["requested instance count must be 300"]),
    ...(rawReport.validInstances === 300 ? [] : ["valid instance count must be 300"]),
    ...(rawReport.tokenBudget === 12_000 ? [] : ["token budget must be 12000"]),
    ...(hasExpectedLineBudgets ? [] : ["line budgets must be exactly 100,250,500"]),
    ...(results.length === 300 ? [] : ["result count must be 300"]),
    ...(results.length !== 300 || hasUniqueResultInstanceIds ? [] : ["result instance IDs must be unique"]),
    ...(Array.isArray(rawReport.skipped) && rawReport.skipped.length === 0
      ? []
      : ["skipped instances must be empty"]),
    ...(at500 === undefined ? ["500-line aggregate is missing"] : []),
    ...(Number.isFinite(metrics.recallAt10) ? [] : ["Recall@10 must be a finite number"]),
    ...(Number.isFinite(metrics.mrr) ? [] : ["MRR must be a finite number"]),
    ...(at500 === undefined || Number.isFinite(metrics.lineRecallAt500)
      ? []
      : ["line recall @500 must be a finite number"]),
    ...(at500 === undefined || Number.isFinite(metrics.usefulHitAt500)
      ? []
      : ["useful hit @500 must be a finite number"]),
  ];
  if (infrastructureFailures.length > 0) {
    return { verdict: "invalid-run", failures: infrastructureFailures, metrics };
  }

  const fileFailures = [
    ...(metrics.recallAt10 >= PYTHON_SUPPORT_FLOORS.recallAt10 ? [] : ["Recall@10 below 0.250"]),
    ...(metrics.mrr >= PYTHON_SUPPORT_FLOORS.mrr ? [] : ["MRR below 0.100"]),
  ];
  if (fileFailures.length > 0) {
    return { verdict: "not-validated", failures: fileFailures, metrics };
  }

  const regionFailures = [
    ...(metrics.lineRecallAt500 >= PYTHON_SUPPORT_FLOORS.lineRecallAt500
      ? []
      : ["line@500 below 0.050"]),
    ...(metrics.usefulHitAt500 >= PYTHON_SUPPORT_FLOORS.usefulHitAt500
      ? []
      : ["useful-hit@500 below 0.100"]),
  ];
  return regionFailures.length > 0
    ? { verdict: "file-only", failures: regionFailures, metrics }
    : { verdict: "validated", failures: [], metrics };
};
