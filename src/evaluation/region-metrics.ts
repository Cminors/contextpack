import type {
  GoldPatchRegion,
  IssueEvaluationResult,
  LineRegion,
  RegionBudgetAggregate,
  RegionBudgetMetrics,
} from "./issue-types.js";
import { median } from "./metrics.js";

const mean = (values: number[]): number => values.length === 0
  ? 0
  : values.reduce((sum, value) => sum + value, 0) / values.length;

function lineKey(path: string, line: number): string {
  return `${path}\0${line}`;
}

function regionLength(region: LineRegion): number {
  return Math.max(0, region.endLine - region.startLine + 1);
}

function overlaps(left: LineRegion, right: LineRegion): boolean {
  return left.path === right.path && left.startLine <= right.endLine && right.startLine <= left.endLine;
}

function discountedGain(relevances: number[]): number {
  return relevances.reduce((sum, relevance, index) =>
    sum + relevance / Math.log2(index + 2), 0);
}

export function regionsWithinBudget(regions: LineRegion[], budgetLines: number): LineRegion[] {
  let remaining = Math.max(0, budgetLines);
  const result: LineRegion[] = [];
  for (const region of regions) {
    if (remaining === 0) break;
    const length = regionLength(region);
    if (length === 0) continue;
    const included = Math.min(length, remaining);
    result.push({ ...region, endLine: region.startLine + included - 1 });
    remaining -= included;
  }
  return result;
}

export function regionMetrics(
  goldRegions: GoldPatchRegion[],
  predictedRegions: LineRegion[],
  budgetLines: number,
): RegionBudgetMetrics {
  const budgeted = regionsWithinBudget(predictedRegions, budgetLines);
  const goldLines = new Set<string>();
  for (const region of goldRegions) {
    for (let line = region.startLine; line <= region.endLine; line += 1) goldLines.add(lineKey(region.path, line));
  }

  const predictedLines = new Set<string>();
  const seenRelevant = new Set<string>();
  const relevances: number[] = [];
  let firstUsefulHit: number | null = null;
  let emittedLines = 0;
  for (const region of budgeted) {
    for (let line = region.startLine; line <= region.endLine; line += 1) {
      emittedLines += 1;
      const key = lineKey(region.path, line);
      predictedLines.add(key);
      const relevant = goldLines.has(key) && !seenRelevant.has(key);
      relevances.push(relevant ? 1 : 0);
      if (relevant) {
        seenRelevant.add(key);
        firstUsefulHit ??= emittedLines;
      }
    }
  }

  const coveredGoldLines = seenRelevant.size;
  const linePrecision = predictedLines.size === 0 ? 0 : coveredGoldLines / predictedLines.size;
  const lineRecall = goldLines.size === 0 ? 0 : coveredGoldLines / goldLines.size;
  const lineF1 = linePrecision + lineRecall === 0 ? 0 : 2 * linePrecision * lineRecall / (linePrecision + lineRecall);
  const hitRegions = goldRegions.filter((gold) => budgeted.some((prediction) => overlaps(gold, prediction))).length;
  const noisyRegions = budgeted.filter((prediction) => !goldRegions.some((gold) => overlaps(gold, prediction))).length;
  const idealRelevant = Math.min(goldLines.size, emittedLines);
  const idealDcg = discountedGain(Array.from({ length: idealRelevant }, () => 1));

  return {
    budgetLines,
    emittedLines,
    coveredGoldLines,
    linePrecision,
    lineRecall,
    lineF1,
    hitRegionRate: goldRegions.length === 0 ? 0 : hitRegions / goldRegions.length,
    noiseRegionRate: budgeted.length === 0 ? 0 : noisyRegions / budgeted.length,
    contextEfficiency: emittedLines === 0 ? 0 : coveredGoldLines / emittedLines,
    ndcg: idealDcg === 0 ? 0 : discountedGain(relevances) / idealDcg,
    firstUsefulHit,
  };
}

export function evaluateRegionBudgets(
  goldRegions: GoldPatchRegion[],
  predictedRegions: LineRegion[],
  budgets: number[],
): Record<string, RegionBudgetMetrics> {
  return Object.fromEntries(budgets.map((budget) => [String(budget), regionMetrics(goldRegions, predictedRegions, budget)]));
}

export function aggregateRegionMetrics(
  results: IssueEvaluationResult[],
  budgets: number[],
): Record<string, RegionBudgetAggregate> {
  return Object.fromEntries(budgets.map((budget) => {
    const values = results.flatMap((result) => {
      const value = result.regionMetrics[String(budget)];
      return value ? [value] : [];
    });
    const hits = values.flatMap((value) => value.firstUsefulHit === null ? [] : [value.firstUsefulHit]);
    return [String(budget), {
      budgetLines: budget,
      medianEmittedLines: median(values.map((value) => value.emittedLines)),
      linePrecision: mean(values.map((value) => value.linePrecision)),
      lineRecall: mean(values.map((value) => value.lineRecall)),
      lineF1: mean(values.map((value) => value.lineF1)),
      hitRegionRate: mean(values.map((value) => value.hitRegionRate)),
      noiseRegionRate: mean(values.map((value) => value.noiseRegionRate)),
      contextEfficiency: mean(values.map((value) => value.contextEfficiency)),
      ndcg: mean(values.map((value) => value.ndcg)),
      usefulHitRate: values.length === 0 ? 0 : hits.length / values.length,
      medianFirstUsefulHit: hits.length === 0 ? null : median(hits),
    }];
  }));
}
