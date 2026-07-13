import type { AnalysisTimings, EvaluationCommitResult, EvaluationReport } from "../types.js";

const PHASES: Array<Exclude<keyof AnalysisTimings, "totalMs">> = [
  "discoverMs",
  "fileAnalysisMs",
  "gitHistoryMs",
  "initialRankingMs",
  "semanticEnrichmentMs",
  "rerankingMs",
  "selectionMs",
];

const mean = (values: number[]): number => values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const current = sorted[middle] ?? 0;
  return sorted.length % 2 === 1 ? current : ((sorted[middle - 1] ?? current) + current) / 2;
}

export function commitMetrics(goldFiles: string[], predictions: string[]): Pick<EvaluationCommitResult, "recallAt5" | "recallAt10" | "reciprocalRank" | "noiseAt10" | "testRecall"> {
  const gold = new Set(goldFiles);
  const recall = (count: number): number => {
    if (gold.size === 0) return 0;
    return predictions.slice(0, count).filter((item) => gold.has(item)).length / gold.size;
  };
  const first = predictions.findIndex((item) => gold.has(item));
  const top = predictions.slice(0, 10);
  const goldTests = goldFiles.filter((item) => /(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)(?:__tests__|tests?)\//i.test(item));
  return {
    recallAt5: recall(5),
    recallAt10: recall(10),
    reciprocalRank: first < 0 ? 0 : 1 / (first + 1),
    noiseAt10: top.length === 0 ? 0 : top.filter((item) => !gold.has(item)).length / top.length,
    testRecall: goldTests.length === 0 ? null : goldTests.filter((item) => top.includes(item)).length / goldTests.length,
  };
}

export function aggregateMetrics(results: EvaluationCommitResult[]): EvaluationReport["aggregate"] {
  const tests = results.flatMap((item) => item.testRecall === null ? [] : [item.testRecall]);
  const medianPhaseDurationsMs = Object.fromEntries(
    PHASES.map((phase) => [
      phase,
      median(results.flatMap((item) => item.analysisTimings ? [item.analysisTimings[phase]] : [])),
    ]),
  ) as Omit<AnalysisTimings, "totalMs">;
  const medianAnalysisDurationMs = median(
    results.map((item) => item.analysisTimings?.totalMs ?? item.durationMs),
  );
  return {
    recallAt5: mean(results.map((item) => item.recallAt5)),
    recallAt10: mean(results.map((item) => item.recallAt10)),
    mrr: mean(results.map((item) => item.reciprocalRank)),
    noiseAt10: mean(results.map((item) => item.noiseAt10)),
    testRecall: tests.length === 0 ? null : mean(tests),
    medianTokens: median(results.map((item) => item.estimatedTokens)),
    medianDurationMs: median(results.map((item) => item.durationMs)),
    medianAnalysisDurationMs,
    medianRenderDurationMs: median(results.flatMap((item) =>
      item.renderDurationMs === undefined ? [] : [item.renderDurationMs]
    )),
    medianPhaseDurationsMs: {
      ...medianPhaseDurationsMs,
      totalMs: medianAnalysisDurationMs,
    },
  };
}
