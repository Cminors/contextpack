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

export const evaluatePythonBenchmarkGates = (
  report: IssueBenchmarkReport,
): PythonBenchmarkGateResult => {
  const at500 = report.aggregate.regionMetrics["500"];
  const metrics = {
    recallAt10: report.aggregate.recallAt10,
    mrr: report.aggregate.mrr,
    lineRecallAt500: at500?.lineRecall ?? Number.NaN,
    usefulHitAt500: at500?.usefulHitRate ?? Number.NaN,
  };
  const infrastructureFailures = [
    ...(report.sourceDataset === SWE_BENCH_LITE_PYTHON.id ? [] : ["source dataset mismatch"]),
    ...(report.sourceRevision === SWE_BENCH_LITE_PYTHON.revision ? [] : ["source revision mismatch"]),
    ...(report.requestedInstances === 300 ? [] : ["requested instance count must be 300"]),
    ...(report.validInstances === 300 ? [] : ["valid instance count must be 300"]),
    ...(report.results.length === 300 ? [] : ["result count must be 300"]),
    ...(report.skipped.length === 0 ? [] : ["skipped instances must be empty"]),
    ...(at500 === undefined ? ["500-line aggregate is missing"] : []),
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
