import type { ContextCandidate, PredictionOptions } from "../types.js";

function isBarrel(filePath: string): boolean {
  return /(?:^|\/)index\.[cm]?[jt]sx?$/i.test(filePath);
}

export function selectPredictions(
  candidates: ContextCandidate[],
  options: PredictionOptions,
): string[] {
  const limits = {
    tests: options.maxTests ?? Math.max(2, Math.floor(options.limit * 0.3)),
    configs: options.maxConfigs ?? Math.max(1, Math.floor(options.limit * 0.2)),
    examples: options.maxExamples ?? Math.max(2, Math.floor(options.limit * 0.3)),
    barrels: options.maxBarrels ?? Math.max(2, Math.floor(options.limit * 0.3)),
  };
  const counts = { tests: 0, configs: 0, examples: 0, barrels: 0 };
  const selected: string[] = [];

  for (const candidate of candidates) {
    if (selected.length >= options.limit) break;
    const categories: Array<keyof typeof counts> = [];
    if (/(?:^|\/)(?:__tests__|tests?|spec)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(candidate.path)) categories.push("tests");
    if (/(?:^|\/)(?:package\.json|[^/]*config\.[cm]?[jt]sx?)$/i.test(candidate.path)) categories.push("configs");
    if (candidate.path.startsWith("examples/")) categories.push("examples");
    if (isBarrel(candidate.path)) categories.push("barrels");
    if (categories.some((category) => counts[category] >= limits[category])) continue;
    selected.push(candidate.path);
    for (const category of categories) counts[category] += 1;
  }

  return selected;
}

export function prioritizeCandidates(
  candidates: ContextCandidate[],
  options: PredictionOptions,
): ContextCandidate[] {
  const prioritizedPaths = selectPredictions(candidates, options);
  const priority = new Map(prioritizedPaths.map((filePath, index) => [filePath, index]));
  const prioritized = prioritizedPaths
    .map((filePath) => candidates.find((candidate) => candidate.path === filePath))
    .filter((candidate): candidate is ContextCandidate => candidate !== undefined);
  return [...prioritized, ...candidates.filter((candidate) => !priority.has(candidate.path))];
}
