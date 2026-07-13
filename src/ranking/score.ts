import path from "node:path";
import type {
  CandidateRelationship,
  ContextCandidate,
  FileAnalysis,
  GitHistoryIndex,
  RuleRecord,
  ScoreBreakdown,
  SymbolRecord,
} from "../types.js";
import { coChangeStrength } from "../analysis/git-history.js";
import { scoreContentMatches } from "./lexical.js";

export const SCORE_WEIGHTS = {
  lexical: 0.28,
  symbol: 0.22,
  dependency: 0.18,
  git: 0.15,
  test: 0.1,
  rule: 0.07,
} as const;

export const CONTENT_SCORE_SCALE = {
  scoped: 0.2,
  unscoped: 0.9,
} as const;

function words(value: string): Set<string> {
  return new Set(
    value
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .normalize("NFKC")
      .toLowerCase()
      .split(/[^a-z0-9\u3400-\u9fff]+/)
      .filter(Boolean),
  );
}

function matchesTerm(text: string, term: string): boolean {
  const normalized = text.normalize("NFKC").toLowerCase();
  return /[\u3400-\u9fff]/.test(term) ? normalized.includes(term) : words(text).has(term);
}

function termWeights(files: FileAnalysis[], terms: string[]): Map<string, number> {
  const weights = new Map<string, number>();
  for (const term of terms) {
    const frequency = files.filter((file) =>
      matchesTerm(`${file.path} ${file.symbols.map((item) => item.name).join(" ")}`, term),
    ).length;
    weights.set(term, Math.log((files.length + 1) / (frequency + 1)) + 1);
  }
  return weights;
}

function weightedMatch(terms: string[], text: string, weights: Map<string, number>): number {
  const total = terms.reduce((sum, term) => sum + (weights.get(term) ?? 1), 0);
  if (total === 0 || !text) return 0;
  const matched = terms.reduce(
    (sum, term) => sum + (matchesTerm(text, term) ? (weights.get(term) ?? 1) : 0),
    0,
  );
  return Math.min(1, matched / total);
}

function matchedTermCount(terms: string[], text: string): number {
  return terms.filter((term) => matchesTerm(text, term)).length;
}

function sameFeatureStrength(
  file: FileAnalysis,
  terms: string[],
  weights: Map<string, number>,
  seeds: Set<string>,
): number {
  if (file.isConfig || seeds.has(file.path)) return 0;
  const directory = path.posix.dirname(file.path);
  const hasSeedInDirectory = [...seeds].some((seed) => path.posix.dirname(seed) === directory);
  if (!hasSeedInDirectory) return 0;
  const symbolText = file.symbols.map((item) => item.name).join(" ");
  const match = weightedMatch(terms, `${path.posix.basename(file.path)} ${symbolText}`, weights);
  return match >= 0.2 ? Math.min(0.55, match) : 0;
}

function bestSymbol(file: FileAnalysis, terms: string[], weights: Map<string, number>): SymbolRecord | null {
  return [...file.symbols].sort((left, right) => {
    const delta = weightedMatch(terms, right.name, weights) - weightedMatch(terms, left.name, weights);
    return delta || Number(right.exported) - Number(left.exported) || left.startLine - right.startLine;
  })[0] ?? null;
}

function applicableRules(filePath: string, rules: RuleRecord[]): RuleRecord[] {
  return rules.filter((rule) => {
    if (rule.kind === "documentation") return false;
    if (rule.scopeDirectory !== "." && !filePath.startsWith(`${rule.scopeDirectory}/`)) return false;
    if (rule.globs.length === 0) return true;
    return rule.globs.some((glob) => {
      const plain = glob.replace(/^\*\*\//, "").replaceAll("**", "").replaceAll("*", "");
      return plain.length === 0 || filePath.includes(plain.replace(/^\//, ""));
    });
  });
}

function dependencyDistances(files: FileAnalysis[], seeds: Set<string>): Map<string, number> {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const distances = new Map<string, number>();
  const queue = [...seeds].map((filePath) => ({ filePath, distance: 0 }));
  for (const seed of seeds) distances.set(seed, 0);
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.distance >= 2) continue;
    const file = byPath.get(current.filePath);
    if (!file) continue;
    for (const neighbor of [...file.imports, ...file.importedBy]) {
      if (!distances.has(neighbor)) {
        distances.set(neighbor, current.distance + 1);
        queue.push({ filePath: neighbor, distance: current.distance + 1 });
      }
    }
  }
  return distances;
}

function semanticStrength(
  file: FileAnalysis,
  filesByPath: Map<string, FileAnalysis>,
  seeds: Set<string>,
  terms: string[],
  weights: Map<string, number>,
): number {
  const relations: Array<{ degree: number; names: string[] }> = [];
  for (const seedPath of file.references.filter((item) => seeds.has(item))) {
    relations.push({ degree: file.references.length, names: file.referenceSymbols[seedPath] ?? [] });
  }
  for (const seedPath of file.referencedBy.filter((item) => seeds.has(item))) {
    const seed = filesByPath.get(seedPath);
    relations.push({ degree: seed?.references.length ?? 1, names: seed?.referenceSymbols[file.path] ?? [] });
  }
  return Math.max(
    0,
    ...relations.map(({ degree, names }) => {
      const relevance = weightedMatch(terms, names.join(" "), weights);
      if (relevance === 0) return 0;
      const degreeStrength = Math.max(0.3, 0.85 - Math.log2(Math.max(1, degree)) * 0.1);
      return degreeStrength * (0.6 + relevance * 0.4);
    }),
  );
}

function barrelDistances(files: FileAnalysis[], seeds: Set<string>): Map<string, number> {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const distances = new Map<string, number>();
  const queue = [...seeds].map((filePath) => ({ filePath, distance: 0 }));
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.distance >= 2) continue;
    const file = byPath.get(current.filePath);
    if (!file) continue;
    for (const importerPath of file.importedBy) {
      if (!/(?:^|\/)index\.[cm]?[jt]sx?$/i.test(importerPath) || distances.has(importerPath)) continue;
      const distance = current.distance + 1;
      distances.set(importerPath, distance);
      queue.push({ filePath: importerPath, distance });
    }
  }
  return distances;
}

function testStrength(file: FileAnalysis, files: FileAnalysis[], seeds: Set<string>): number {
  if (file.isTest && [...file.imports, ...file.references].some((item) => seeds.has(item))) return 1;
  if (
    !file.isTest &&
    files.some(
      (item) => item.isTest && [...item.imports, ...item.references].includes(file.path) && seeds.has(file.path),
    )
  ) return 0.8;
  const stem = path.posix.basename(file.path).replace(/\.(?:test|spec)?\.[^.]+$/, "");
  const matchingTest = files.find((item) =>
    item.path !== file.path && item.isTest && path.posix.basename(item.path).replace(/\.(?:test|spec)\.[^.]+$/, "") === stem,
  );
  if (matchingTest && (seeds.has(file.path) || seeds.has(matchingTest.path))) return 0.75;
  return matchingTest ? 0.35 : 0;
}

function directStructuralStrength(
  file: FileAnalysis,
  barrelDistance: number | undefined,
): number {
  if (barrelDistance === 1) return 1;
  if (barrelDistance === 2) return 0.85;
  return 0;
}

function relationshipsFor(
  file: FileAnalysis,
  files: FileAnalysis[],
  history: GitHistoryIndex,
  seeds: Set<string>,
  rules: RuleRecord[],
): CandidateRelationship[] {
  const relationships: CandidateRelationship[] = [];
  for (const target of file.imports.filter((item) => seeds.has(item)).slice(0, 3)) {
    relationships.push({ kind: "imports", target, strength: 1, detail: "Direct import of a lexical seed" });
  }
  for (const target of file.importedBy.filter((item) => seeds.has(item)).slice(0, 3)) {
    relationships.push({ kind: "imported-by", target, strength: 1, detail: "Imported by a lexical seed" });
  }
  for (const target of file.references.filter((item) => seeds.has(item)).slice(0, 3)) {
    relationships.push({ kind: "references", target, strength: 1, detail: "References a symbol declared by a lexical seed" });
  }
  for (const target of file.referencedBy.filter((item) => seeds.has(item)).slice(0, 3)) {
    relationships.push({ kind: "referenced-by", target, strength: 1, detail: "A lexical seed references a symbol declared here" });
  }
  if (file.isTest) {
    for (const target of file.imports.filter((item) => seeds.has(item)).slice(0, 3)) {
      relationships.push({ kind: "test-for", target, strength: 1, detail: "Test directly imports a lexical seed" });
    }
  }
  const strongest = [...seeds]
    .map((target) => ({ target, strength: coChangeStrength(history, file.path, target) }))
    .filter((item) => item.strength > 0)
    .sort((a, b) => b.strength - a.strength || a.target.localeCompare(b.target))[0];
  if (strongest) relationships.push({ kind: "co-change", ...strongest, detail: "Changed together in local Git history" });
  for (const rule of applicableRules(file.path, rules).slice(0, 2)) {
    relationships.push({ kind: "rule-applies", target: rule.path, strength: 1, detail: "Rule scope includes this path" });
  }
  return relationships;
}

export function rankCandidates(
  files: FileAnalysis[],
  terms: string[],
  history: GitHistoryIndex,
  rules: RuleRecord[],
  taskScope: string | null = null,
): ContextCandidate[] {
  const weights = termWeights(files, terms);
  const contentMatches = scoreContentMatches(files, terms);
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const configurationIntent = terms.some((term) =>
    ["build", "builds", "bundle", "bundling", "cjs", "commonjs", "config", "configuration", "esm", "package", "packages", "packaging"].includes(term),
  );
  const rawRelevance = new Map<string, { lexical: number; symbol: number; content: ReturnType<typeof contentMatches.get> }>();
  for (const file of files) {
    const pathScore = weightedMatch(terms, file.path, weights);
    const content = contentMatches.get(file.path);
    const configContent = file.content.slice(0, 50_000);
    const contentScore = configurationIntent && file.isConfig && !file.path.endsWith("package.json") && matchedTermCount(terms, configContent) >= 2
      ? weightedMatch(terms, configContent, weights)
      : 0;
    const contentScale = taskScope ? CONTENT_SCORE_SCALE.scoped : CONTENT_SCORE_SCALE.unscoped;
    const baseLexical = Math.max(pathScore, contentScore * 0.85, (content?.score ?? 0) * contentScale);
    const scopeMatch = taskScope && file.path.toLowerCase().split("/").includes(taskScope) ? 0.35 : 0;
    const lexical = taskScope ? Math.min(1, baseLexical * 0.65 + scopeMatch) : baseLexical;
    const symbolScore = file.symbols.reduce((best, item) => Math.max(best, weightedMatch(terms, item.name, weights)), 0);
    rawRelevance.set(file.path, { lexical, symbol: symbolScore, content });
  }
  const rankedSeeds = [...rawRelevance]
    .filter(([, value]) => Math.max(value.lexical, value.symbol) > 0)
    .sort(([leftPath, left], [rightPath, right]) =>
      Math.max(right.lexical, right.symbol) - Math.max(left.lexical, left.symbol) || leftPath.localeCompare(rightPath),
    );
  const seedPaths: string[] = [];
  const categoryCounts = { config: 0, test: 0, example: 0 };
  const packageCounts = new Map<string, number>();
  for (const [filePath] of rankedSeeds) {
    const file = filesByPath.get(filePath);
    if (!file) continue;
    if (file.isConfig && categoryCounts.config >= 2) continue;
    if (file.isTest && categoryCounts.test >= 3) continue;
    if (file.path.startsWith("examples/") && categoryCounts.example >= 4) continue;
    const packageKey = file.packageDirectory && file.packageDirectory !== "." ? file.packageDirectory : null;
    if (packageKey && (packageCounts.get(packageKey) ?? 0) >= 3) continue;
    if (file.isConfig) categoryCounts.config += 1;
    if (file.isTest) categoryCounts.test += 1;
    if (file.path.startsWith("examples/")) categoryCounts.example += 1;
    if (packageKey) packageCounts.set(packageKey, (packageCounts.get(packageKey) ?? 0) + 1);
    seedPaths.push(filePath);
    if (seedPaths.length >= 12) break;
  }
  let seeds = new Set(seedPaths);
  if (seeds.size === 0) {
    seeds = new Set(files.filter((file) => !file.isConfig).slice(0, 3).map((file) => file.path));
  }
  const distances = dependencyDistances(files, seeds);
  const barrelGraph = barrelDistances(files, seeds);

  return files.map((file) => {
    const relevance = rawRelevance.get(file.path) ?? { lexical: 0, symbol: 0, content: undefined };
    const distance = distances.get(file.path);
    const structural = directStructuralStrength(file, barrelGraph.get(file.path));
    const sameFeature = sameFeatureStrength(file, terms, weights, seeds);
    const semantic = semanticStrength(file, filesByPath, seeds, terms, weights);
    const dependency = Math.max(structural, sameFeature, semantic, distance === 0 ? 1 : distance === 1 ? 0.7 : distance === 2 ? 0.35 : 0);
    const coChange = Math.max(0, ...[...seeds].map((seed) => coChangeStrength(history, file.path, seed)));
    const title = weightedMatch(terms, [...(history.titleTermsByFile.get(file.path) ?? [])].join(" "), weights);
    const test = testStrength(file, files, seeds);
    const matchingRules = applicableRules(file.path, rules);
    const scopedRule = matchingRules.some((item) => item.scopeDirectory !== "." || item.globs.length > 0) ? 0.5 : matchingRules.length > 0 ? 0.1 : 0;
    const rule = Math.min(1, scopedRule + (configurationIntent && file.isConfig && relevance.lexical > 0 ? 0.25 : 0));
    const breakdown: ScoreBreakdown = {
      lexical: relevance.lexical,
      symbol: relevance.symbol,
      dependency,
      git: Math.max(coChange, title * 0.7),
      test,
      rule,
    };
    const rawScore = Object.entries(SCORE_WEIGHTS).reduce(
      (total, [key, weight]) => total + breakdown[key as keyof ScoreBreakdown] * weight,
      0,
    );
    const legacyPenalty = !terms.includes("legacy") && /(?:^|[\/._-])legacy(?:[\/._-]|$)/i.test(file.path) ? 0.6 : 1;
    const score = rawScore * legacyPenalty;
    const reasons = (Object.keys(SCORE_WEIGHTS) as Array<keyof ScoreBreakdown>)
      .filter((key) => breakdown[key] > 0)
      .sort((a, b) => breakdown[b] * SCORE_WEIGHTS[b] - breakdown[a] * SCORE_WEIGHTS[a])
      .slice(0, 3)
      .map((key) => `${key} signal ${breakdown[key].toFixed(2)}`);
    if (relevance.content && relevance.content.evidence.length > 0) {
      const details = relevance.content.evidence
        .map((item) => `"${item.term}" in ${item.field} at line ${item.line}`)
        .join(", ");
      const lexicalReason = reasons.findIndex((reason) => reason.startsWith("lexical signal"));
      if (lexicalReason >= 0) reasons[lexicalReason] = `${reasons[lexicalReason]}; content match ${details}`;
      else reasons.push(`content match ${details}`);
    }
    const chosenSymbol = bestSymbol(file, terms, weights);
    return {
      path: file.path,
      symbol: chosenSymbol,
      startLine: chosenSymbol?.startLine ?? 1,
      endLine: chosenSymbol?.endLine ?? Math.min(file.lineCount, 120),
      score: Number(score.toFixed(6)),
      breakdown,
      selected: false,
      reasons: reasons.length > 0 ? reasons : ["deterministic repository fallback"],
      relationships: relationshipsFor(file, files, history, seeds, rules),
      estimatedTokens: 0,
    };
  }).sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
}
